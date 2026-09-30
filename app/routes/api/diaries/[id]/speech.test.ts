import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import { MAX_BODY_LENGTH } from '../../../../lib/constants'
import type { Diary } from '../../../../lib/db'
import { speechCacheKey } from '../../../../lib/speech'
import { speechStyleForMood } from '../../../../lib/speech-style'

vi.mock('../../../../lib/db', () => ({
  getDiary: vi.fn(),
  setDiarySpeechKey: vi.fn(),
  clearDiarySpeechKeys: vi.fn(),
  listSpeechKeysInUse: vi.fn(),
}))

vi.mock('../../../../lib/speech', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/speech')>()),
  synthesizeSpeech: vi.fn(),
}))

const API_KEY = 'secret-api-key'
const VOICE_ID = 'secret-voice-id'
const BODY = '秘密の日記の本文'

function makeDiary(overrides: Partial<Diary> = {}): Diary {
  return {
    id: 'abc',
    body: BODY,
    image_key: null,
    image_layout: 'left',
    image_x: null,
    image_y: null,
    image_scale: null,
    image_rotation: null,
    background_color: '#FFFFFF',
    mood: 'happy',
    speech_key: null,
    speech_public: 0,
    diary_date: '2026-09-29',
    published_snapshot_id: null,
    created_at: '2026-09-29 00:00:00',
    updated_at: '2026-09-29 00:00:00',
    ...overrides,
  }
}

function makeWav(): Uint8Array {
  const bytes = new Uint8Array(48)
  bytes.set(new TextEncoder().encode('RIFF'), 0)
  bytes.set(new TextEncoder().encode('WAVE'), 8)
  return bytes
}

function createBucket(existingKeys: string[] = []) {
  const keys = new Set(existingKeys)
  return {
    head: vi.fn(async (key: string) => (keys.has(key) ? { key } : null)),
    put: vi.fn(async (key: string) => {
      keys.add(key)
    }),
    list: vi.fn(async () => ({
      objects: [...keys].map((key) => ({ key })),
      truncated: false,
    })),
    delete: vi.fn(async (key: string) => {
      keys.delete(key)
    }),
  }
}

async function createApp(
  options: {
    isAuthenticated?: boolean
    bucket?: ReturnType<typeof createBucket>
    env?: Partial<AppEnv['Bindings']>
  } = {},
) {
  const { POST, DELETE } = await import('./speech')
  const app = new Hono<AppEnv>()
  const bucket = options.bucket ?? createBucket()

  app.use('*', async (c, next) => {
    c.set('isAuthenticated', options.isAuthenticated ?? true)
    c.env = {
      DB: {},
      BUCKET: bucket,
      GEMINI_API_KEY: API_KEY,
      GEMINI_VOICE_ID: VOICE_ID,
      ...options.env,
    } as unknown as AppEnv['Bindings']
    await next()
  })

  app.post('/api/diaries/:id/speech', ...POST)
  app.delete('/api/diaries/:id/speech', ...DELETE)

  return { app, bucket }
}

async function expectedKey(diary: Diary) {
  return speechCacheKey(diary.id, {
    body: diary.body,
    style: speechStyleForMood(diary.mood).instruction,
    voiceId: VOICE_ID,
  })
}

describe('POST /api/diaries/:id/speech', () => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const { setDiarySpeechKey } = await import('../../../../lib/db')
    vi.mocked(setDiarySpeechKey).mockResolvedValue(true)
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    const logged = consoleError.mock.calls.flat().map(String).join('\n')
    expect(logged).not.toContain(API_KEY)
    expect(logged).not.toContain(VOICE_ID)
    expect(logged).not.toContain(BODY)
    consoleError.mockRestore()
  })

  test('未認証は 401 で Gemini を呼ばない', async () => {
    const { synthesizeSpeech } = await import('../../../../lib/speech')
    const { app } = await createApp({ isAuthenticated: false })

    const res = await app.request('/api/diaries/abc/speech', { method: 'POST' })

    expect(res.status).toBe(401)
    expect(synthesizeSpeech).not.toHaveBeenCalled()
  })

  test('日記が無ければ 404', async () => {
    const { getDiary } = await import('../../../../lib/db')
    vi.mocked(getDiary).mockResolvedValue(null)
    const { app } = await createApp()

    const res = await app.request('/api/diaries/abc/speech', { method: 'POST' })

    expect(res.status).toBe(404)
  })

  test.each([
    ['空本文', '  \n '],
    ['上限超', 'あ'.repeat(MAX_BODY_LENGTH + 1)],
  ])('%sは 422 で Gemini を呼ばない', async (_label, body) => {
    const { getDiary } = await import('../../../../lib/db')
    const { synthesizeSpeech } = await import('../../../../lib/speech')
    vi.mocked(getDiary).mockResolvedValue(makeDiary({ body }))
    const { app } = await createApp()

    const res = await app.request('/api/diaries/abc/speech', { method: 'POST' })

    expect(res.status).toBe(422)
    expect(synthesizeSpeech).not.toHaveBeenCalled()
  })

  test.each([
    ['API キー', { GEMINI_API_KEY: undefined }],
    ['声 ID', { GEMINI_VOICE_ID: undefined }],
  ])('%sが未設定なら 503 で Gemini を呼ばない', async (_label, env) => {
    const { getDiary } = await import('../../../../lib/db')
    const { synthesizeSpeech } = await import('../../../../lib/speech')
    vi.mocked(getDiary).mockResolvedValue(makeDiary())
    const { app } = await createApp({ env })

    const res = await app.request('/api/diaries/abc/speech', { method: 'POST' })

    expect(res.status).toBe(503)
    expect(synthesizeSpeech).not.toHaveBeenCalled()
  })

  test('同じキーの音声があれば Gemini を呼ばずに記録だけする', async () => {
    const diary = makeDiary()
    const key = await expectedKey(diary)
    const { getDiary, setDiarySpeechKey, listSpeechKeysInUse } = await import(
      '../../../../lib/db'
    )
    const { synthesizeSpeech } = await import('../../../../lib/speech')
    vi.mocked(getDiary).mockResolvedValue(diary)
    vi.mocked(listSpeechKeysInUse).mockResolvedValue([key])
    const { app, bucket } = await createApp({ bucket: createBucket([key]) })

    const res = await app.request('/api/diaries/abc/speech', { method: 'POST' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ created: false, speech_key: key })
    expect(synthesizeSpeech).not.toHaveBeenCalled()
    expect(bucket.put).not.toHaveBeenCalled()
    expect(setDiarySpeechKey).toHaveBeenCalledWith(
      expect.anything(),
      'abc',
      key,
      diary.updated_at,
    )
  })

  test('音声が無ければ 1 回だけ生成し、audio/wav で保存して記録し、残す音声以外を消す', async () => {
    const diary = makeDiary({ mood: 'sad' })
    const key = await expectedKey(diary)
    const { getDiary, setDiarySpeechKey, listSpeechKeysInUse } = await import(
      '../../../../lib/db'
    )
    const { synthesizeSpeech } = await import('../../../../lib/speech')
    const wav = makeWav()
    vi.mocked(getDiary).mockResolvedValue(diary)
    vi.mocked(synthesizeSpeech).mockResolvedValue(wav)
    vi.mocked(listSpeechKeysInUse).mockResolvedValue([
      key,
      'speech/abc/published.wav',
    ])
    const { app, bucket } = await createApp({
      bucket: createBucket(['speech/abc/old.wav', 'speech/abc/published.wav']),
    })

    const res = await app.request('/api/diaries/abc/speech', { method: 'POST' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ created: true, speech_key: key })
    expect(synthesizeSpeech).toHaveBeenCalledTimes(1)
    expect(synthesizeSpeech).toHaveBeenCalledWith({
      apiKey: API_KEY,
      voiceId: VOICE_ID,
      text: BODY,
      style: '日記を読み聞かせるように、静かに、少しゆっくり、悲しそうに',
    })
    expect(bucket.put).toHaveBeenCalledWith(key, wav, {
      httpMetadata: { contentType: 'audio/wav' },
    })
    expect(setDiarySpeechKey).toHaveBeenCalledWith(
      expect.anything(),
      'abc',
      key,
      diary.updated_at,
    )
    expect(bucket.delete).toHaveBeenCalledTimes(1)
    expect(bucket.delete).toHaveBeenCalledWith('speech/abc/old.wav')
  })

  /**
   * D1 の diaries.updated_at を 1 つの変数で表し、setDiarySpeechKey の
   * 「updated_at が生成開始時のままのときだけ記録する」を再現する。
   * clearDiarySpeechKeys は updated_at をミリ秒まで書く
   */
  async function mockConditionalRecord(
    diary: Diary,
    clearedAt = '2026-09-29 00:00:30.000',
  ) {
    const { getDiary, setDiarySpeechKey, clearDiarySpeechKeys } = await import(
      '../../../../lib/db'
    )
    const db = { updatedAt: diary.updated_at, speechKey: diary.speech_key }
    vi.mocked(getDiary).mockImplementation(async () => ({
      ...diary,
      speech_key: db.speechKey,
      updated_at: db.updatedAt,
    }))
    vi.mocked(setDiarySpeechKey).mockImplementation(
      async (_db, _id, speechKey, expectedUpdatedAt) => {
        if (expectedUpdatedAt !== db.updatedAt) return false
        db.speechKey = speechKey
        return true
      },
    )
    vi.mocked(clearDiarySpeechKeys).mockImplementation(async () => {
      db.speechKey = null
      db.updatedAt = clearedAt
    })
    return db
  }

  test('生成中に本文が保存されたら、記録せずに 409 を返し、put した音声だけを消す', async () => {
    const diary = makeDiary()
    const key = await expectedKey(diary)
    const { listSpeechKeysInUse } = await import('../../../../lib/db')
    const { synthesizeSpeech } = await import('../../../../lib/speech')
    const db = await mockConditionalRecord(diary)
    vi.mocked(synthesizeSpeech).mockImplementation(async () => {
      // 生成を待つ間に本文が保存され、updated_at が進む
      db.updatedAt = '2026-09-29 00:00:10'
      return makeWav()
    })
    vi.mocked(listSpeechKeysInUse).mockResolvedValue([
      'speech/abc/published.wav',
    ])
    const { app, bucket } = await createApp({
      bucket: createBucket(['speech/abc/published.wav']),
    })

    const res = await app.request('/api/diaries/abc/speech', { method: 'POST' })

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({
      error: expect.stringContaining('音声を記録しませんでした'),
    })
    expect(db.speechKey).toBeNull()
    expect(bucket.put).toHaveBeenCalledWith(key, expect.anything(), {
      httpMetadata: { contentType: 'audio/wav' },
    })
    expect(bucket.delete).toHaveBeenCalledTimes(1)
    expect(bucket.delete).toHaveBeenCalledWith(key)
  })

  test('生成中に別の画面で音声を削除したら、削除した音声を復活させない', async () => {
    const oldKey = 'speech/abc/old.wav'
    const diary = makeDiary({ speech_key: oldKey })
    const key = await expectedKey(diary)
    const { listSpeechKeysInUse } = await import('../../../../lib/db')
    const { synthesizeSpeech } = await import('../../../../lib/speech')
    const db = await mockConditionalRecord(diary)
    vi.mocked(listSpeechKeysInUse).mockImplementation(async () =>
      db.speechKey ? [db.speechKey] : [],
    )
    const bucket = createBucket([oldKey])
    const { app } = await createApp({ bucket })
    vi.mocked(synthesizeSpeech).mockImplementation(async () => {
      const deleted = await app.request('/api/diaries/abc/speech', {
        method: 'DELETE',
      })
      expect(deleted.status).toBe(204)
      return makeWav()
    })

    const res = await app.request('/api/diaries/abc/speech', { method: 'POST' })

    expect(res.status).toBe(409)
    expect(db.speechKey).toBeNull()
    expect(bucket.put).toHaveBeenCalledWith(key, expect.anything(), {
      httpMetadata: { contentType: 'audio/wav' },
    })
    expect(bucket.delete).toHaveBeenCalledWith(key)
    expect(await bucket.head(key)).toBeNull()
    expect(await bucket.head(oldKey)).toBeNull()
  })

  test('生成開始と同じ秒に音声を削除しても、削除した音声を復活させない', async () => {
    const oldKey = 'speech/abc/old.wav'
    const diary = makeDiary({ speech_key: oldKey })
    const key = await expectedKey(diary)
    const clearedAt = '2026-09-29 00:00:00.250'
    // 秒までは生成開始時の updated_at と同じで、ミリ秒の分だけ文字列が異なる
    expect(clearedAt.slice(0, 19)).toBe(diary.updated_at)
    expect(clearedAt).not.toBe(diary.updated_at)
    const { listSpeechKeysInUse } = await import('../../../../lib/db')
    const { synthesizeSpeech } = await import('../../../../lib/speech')
    const db = await mockConditionalRecord(diary, clearedAt)
    vi.mocked(listSpeechKeysInUse).mockImplementation(async () =>
      db.speechKey ? [db.speechKey] : [],
    )
    const bucket = createBucket([oldKey])
    const { app } = await createApp({ bucket })
    vi.mocked(synthesizeSpeech).mockImplementation(async () => {
      const deleted = await app.request('/api/diaries/abc/speech', {
        method: 'DELETE',
      })
      expect(deleted.status).toBe(204)
      return makeWav()
    })

    const res = await app.request('/api/diaries/abc/speech', { method: 'POST' })

    expect(res.status).toBe(409)
    expect(db.updatedAt).toBe(clearedAt)
    expect(db.speechKey).toBeNull()
    expect(bucket.delete).toHaveBeenCalledWith(key)
    expect(await bucket.head(key)).toBeNull()
    expect(await bucket.head(oldKey)).toBeNull()
  })

  test('同じキーの音声があっても、updated_at が変わっていれば記録せず、その音声も消さない', async () => {
    const diary = makeDiary()
    const key = await expectedKey(diary)
    const { getDiary, setDiarySpeechKey } = await import('../../../../lib/db')
    const { synthesizeSpeech } = await import('../../../../lib/speech')
    vi.mocked(getDiary).mockResolvedValue(diary)
    vi.mocked(setDiarySpeechKey).mockResolvedValue(false)
    const { app, bucket } = await createApp({ bucket: createBucket([key]) })

    const res = await app.request('/api/diaries/abc/speech', { method: 'POST' })

    expect(res.status).toBe(409)
    expect(synthesizeSpeech).not.toHaveBeenCalled()
    expect(bucket.put).not.toHaveBeenCalled()
    expect(bucket.delete).not.toHaveBeenCalled()
  })

  test('生成の処理を waitUntil にも渡す', async () => {
    const { getDiary } = await import('../../../../lib/db')
    const { synthesizeSpeech } = await import('../../../../lib/speech')
    vi.mocked(getDiary).mockResolvedValue(makeDiary())
    vi.mocked(synthesizeSpeech).mockResolvedValue(makeWav())
    const { app } = await createApp()
    const waitUntil = vi.fn()

    const res = await app.request(
      '/api/diaries/abc/speech',
      { method: 'POST' },
      undefined,
      { waitUntil, passThroughOnException: vi.fn(), props: {} },
    )

    expect(res.status).toBe(200)
    expect(waitUntil).toHaveBeenCalledTimes(1)
  })

  test('使われなくなった音声の削除に失敗しても生成は成功とする', async () => {
    const { getDiary, listSpeechKeysInUse } = await import('../../../../lib/db')
    const { synthesizeSpeech } = await import('../../../../lib/speech')
    vi.mocked(getDiary).mockResolvedValue(makeDiary())
    vi.mocked(synthesizeSpeech).mockResolvedValue(makeWav())
    vi.mocked(listSpeechKeysInUse).mockRejectedValue(new Error('D1 down'))
    const { app } = await createApp()

    const res = await app.request('/api/diaries/abc/speech', { method: 'POST' })

    expect(res.status).toBe(200)
    expect(consoleError).toHaveBeenCalled()
  })

  test.each([
    ['http', 403, 502],
    ['no_audio', null, 502],
    ['invalid_audio', null, 502],
    ['network', null, 502],
    ['timeout', null, 504],
  ] as const)('Gemini の失敗（%s）は %s → %i を返し、R2 にも D1 にも書かない', async (kind, status, expected) => {
    const { getDiary, setDiarySpeechKey } = await import('../../../../lib/db')
    const { synthesizeSpeech, SpeechSynthesisError } = await import(
      '../../../../lib/speech'
    )
    vi.mocked(getDiary).mockResolvedValue(makeDiary())
    vi.mocked(synthesizeSpeech).mockRejectedValue(
      new SpeechSynthesisError(kind, status),
    )
    const { app, bucket } = await createApp()

    const res = await app.request('/api/diaries/abc/speech', { method: 'POST' })

    expect(res.status).toBe(expected)
    expect(await res.json()).toEqual({ error: '音声を作れませんでした' })
    expect(bucket.put).not.toHaveBeenCalled()
    expect(bucket.delete).not.toHaveBeenCalled()
    expect(setDiarySpeechKey).not.toHaveBeenCalled()
    const logged = consoleError.mock.calls.flat().map(String).join(' ')
    expect(logged).toContain('[speech]')
    expect(logged).toContain(kind)
  })
})

describe('DELETE /api/diaries/:id/speech', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('未認証は 401 で何も消さない', async () => {
    const { clearDiarySpeechKeys } = await import('../../../../lib/db')
    const { app, bucket } = await createApp({
      isAuthenticated: false,
      bucket: createBucket(['speech/abc/a.wav']),
    })

    const res = await app.request('/api/diaries/abc/speech', {
      method: 'DELETE',
    })

    expect(res.status).toBe(401)
    expect(bucket.delete).not.toHaveBeenCalled()
    expect(clearDiarySpeechKeys).not.toHaveBeenCalled()
  })

  test('日記が無ければ 404', async () => {
    const { getDiary } = await import('../../../../lib/db')
    vi.mocked(getDiary).mockResolvedValue(null)
    const { app } = await createApp()

    const res = await app.request('/api/diaries/abc/speech', {
      method: 'DELETE',
    })

    expect(res.status).toBe(404)
  })

  test('R2 の音声を全削除し、下書きと公開中の speech_key を NULL にする', async () => {
    const { getDiary, clearDiarySpeechKeys } = await import(
      '../../../../lib/db'
    )
    vi.mocked(getDiary).mockResolvedValue(
      makeDiary({ speech_key: 'speech/abc/a.wav' }),
    )
    const { app, bucket } = await createApp({
      bucket: createBucket(['speech/abc/a.wav', 'speech/abc/b.wav']),
    })

    const res = await app.request('/api/diaries/abc/speech', {
      method: 'DELETE',
    })

    expect(res.status).toBe(204)
    expect(bucket.list).toHaveBeenCalledWith({ prefix: 'speech/abc/' })
    expect(bucket.delete).toHaveBeenCalledWith('speech/abc/a.wav')
    expect(bucket.delete).toHaveBeenCalledWith('speech/abc/b.wav')
    expect(clearDiarySpeechKeys).toHaveBeenCalledWith(expect.anything(), 'abc')
  })

  test('R2 の削除に失敗してもログに残して D1 の NULL 化は行う', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { getDiary, clearDiarySpeechKeys } = await import(
      '../../../../lib/db'
    )
    vi.mocked(getDiary).mockResolvedValue(makeDiary())
    const bucket = createBucket(['speech/abc/a.wav'])
    bucket.delete.mockRejectedValue(new Error('R2 down'))
    const { app } = await createApp({ bucket })

    const res = await app.request('/api/diaries/abc/speech', {
      method: 'DELETE',
    })

    expect(res.status).toBe(204)
    expect(clearDiarySpeechKeys).toHaveBeenCalled()
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
