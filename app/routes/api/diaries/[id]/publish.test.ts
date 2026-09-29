import { Hono } from 'hono'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import type { DiarySnapshot } from '../../../../lib/db'

vi.mock('../../../../lib/db', () => ({
  publishDiary: vi.fn(),
  listSpeechKeysInUse: vi.fn(),
}))

function createBucket(keys: string[] = []) {
  return {
    list: vi.fn(async () => ({
      objects: keys.map((key) => ({ key })),
      truncated: false,
    })),
    delete: vi.fn(async () => {}),
  }
}

async function createApp(
  isAuthenticated: boolean,
  options: {
    bucket?: ReturnType<typeof createBucket>
    voiceId?: string
  } = {},
) {
  const { POST } = await import('./publish')
  const app = new Hono<AppEnv>()
  const bucket = options.bucket ?? createBucket()

  app.use('*', async (c, next) => {
    c.set('isAuthenticated', isAuthenticated)
    c.env = {
      DB: {},
      BUCKET: bucket,
      GEMINI_VOICE_ID: options.voiceId,
    } as unknown as AppEnv['Bindings']
    await next()
  })

  app.post('/api/diaries/:id/publish', ...POST)

  return app
}

function makeSnapshot(): DiarySnapshot {
  return {
    id: 'snap1',
    diary_id: 'abc',
    body: '本文',
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
    published_at: '2026-04-15 12:00:00',
  }
}

describe('POST /api/diaries/:id/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('未認証は401を返す', async () => {
    const app = await createApp(false)
    const res = await app.request('/api/diaries/abc/publish', {
      method: 'POST',
    })
    expect(res.status).toBe(401)
  })

  test('存在しない日記は404を返す', async () => {
    const { publishDiary } = await import('../../../../lib/db')
    vi.mocked(publishDiary).mockResolvedValue(null)

    const app = await createApp(true)
    const res = await app.request('/api/diaries/unknown/publish', {
      method: 'POST',
    })

    expect(res.status).toBe(404)
  })

  test('公開成功時に published_at を返す', async () => {
    const { publishDiary, listSpeechKeysInUse } = await import(
      '../../../../lib/db'
    )
    vi.mocked(publishDiary).mockResolvedValue(makeSnapshot())
    vi.mocked(listSpeechKeysInUse).mockResolvedValue([])

    const app = await createApp(true)
    const res = await app.request('/api/diaries/abc/publish', {
      method: 'POST',
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as { published_at: string }
    expect(json.published_at).toBe('2026-04-15 12:00:00')
  })

  test('公開版に写した音声のキーを返す（写さなければ null）', async () => {
    const { publishDiary, listSpeechKeysInUse } = await import(
      '../../../../lib/db'
    )
    vi.mocked(listSpeechKeysInUse).mockResolvedValue([])
    const app = await createApp(true)

    vi.mocked(publishDiary).mockResolvedValue({
      ...makeSnapshot(),
      speech_key: 'speech/abc/current.wav',
    })
    const withSpeech = await app.request('/api/diaries/abc/publish', {
      method: 'POST',
    })
    expect(await withSpeech.json()).toEqual({
      published_at: '2026-04-15 12:00:00',
      speech_key: 'speech/abc/current.wav',
    })

    vi.mocked(publishDiary).mockResolvedValue(makeSnapshot())
    const withoutSpeech = await app.request('/api/diaries/abc/publish', {
      method: 'POST',
    })
    expect(await withoutSpeech.json()).toEqual({
      published_at: '2026-04-15 12:00:00',
      speech_key: null,
    })
  })

  test('音声の引き継ぎ判定のため声 ID を publishDiary に渡す', async () => {
    const { publishDiary, listSpeechKeysInUse } = await import(
      '../../../../lib/db'
    )
    vi.mocked(publishDiary).mockResolvedValue(makeSnapshot())
    vi.mocked(listSpeechKeysInUse).mockResolvedValue([])

    const app = await createApp(true, { voiceId: 'voice_a' })
    await app.request('/api/diaries/abc/publish', { method: 'POST' })

    expect(publishDiary).toHaveBeenCalledWith(expect.anything(), 'abc', {
      voiceId: 'voice_a',
    })
  })

  test('公開後に、下書きと公開中のどちらからも使われていない音声を消す', async () => {
    const { publishDiary, listSpeechKeysInUse } = await import(
      '../../../../lib/db'
    )
    vi.mocked(publishDiary).mockResolvedValue(makeSnapshot())
    vi.mocked(listSpeechKeysInUse).mockResolvedValue(['speech/abc/current.wav'])
    const bucket = createBucket([
      'speech/abc/current.wav',
      'speech/abc/old-published.wav',
    ])

    const app = await createApp(true, { bucket })
    const res = await app.request('/api/diaries/abc/publish', {
      method: 'POST',
    })

    expect(res.status).toBe(200)
    expect(listSpeechKeysInUse).toHaveBeenCalledWith(expect.anything(), 'abc')
    expect(bucket.list).toHaveBeenCalledWith({ prefix: 'speech/abc/' })
    expect(bucket.delete).toHaveBeenCalledTimes(1)
    expect(bucket.delete).toHaveBeenCalledWith('speech/abc/old-published.wav')
  })

  test('音声の削除に失敗しても公開は成功させる', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { publishDiary, listSpeechKeysInUse } = await import(
      '../../../../lib/db'
    )
    vi.mocked(publishDiary).mockResolvedValue(makeSnapshot())
    vi.mocked(listSpeechKeysInUse).mockResolvedValue([])
    const bucket = createBucket(['speech/abc/old.wav'])
    bucket.delete.mockRejectedValue(new Error('R2 down'))

    const app = await createApp(true, { bucket })
    const res = await app.request('/api/diaries/abc/publish', {
      method: 'POST',
    })

    expect(res.status).toBe(200)
    expect(consoleError).toHaveBeenCalledWith(
      '[speech] failed to delete unused audio:',
      'Error',
    )
    consoleError.mockRestore()
  })
})
