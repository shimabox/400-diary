import { Hono } from 'hono'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import type { Diary, DiarySnapshot, DiaryWithSnapshot } from '../../../lib/db'

vi.mock('../../../lib/db', () => ({
  getDiary: vi.fn(),
  getDiaryWithSnapshot: vi.fn(),
}))

vi.mock('../../../lib/speech', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/speech')>()),
  synthesizeSpeech: vi.fn(),
}))

const AUDIO = new Uint8Array(100).map((_, i) => i)
const PUBLISHED_KEY = 'speech/abc/published.wav'
const DRAFT_KEY = 'speech/abc/draft.wav'

function createBucket(objects: Record<string, Uint8Array>) {
  return {
    head: vi.fn(async (key: string) =>
      objects[key] ? { key, size: objects[key].length } : null,
    ),
    get: vi.fn(
      async (
        key: string,
        options?: { range?: { offset: number; length: number } },
      ) => {
        const data = objects[key]
        if (!data) return null
        const range = options?.range
        return {
          body: range
            ? data.slice(range.offset, range.offset + range.length)
            : data,
        }
      },
    ),
  }
}

function makeDiary(overrides: Partial<Diary> = {}): Diary {
  return {
    id: 'abc',
    body: '本文',
    image_key: null,
    image_layout: 'left',
    image_x: null,
    image_y: null,
    image_scale: null,
    image_rotation: null,
    background_color: '#FFFFFF',
    mood: null,
    speech_key: DRAFT_KEY,
    speech_public: 0,
    diary_date: '2026-09-29',
    published_snapshot_id: 'snap1',
    created_at: '2026-09-29 00:00:00',
    updated_at: '2026-09-29 00:00:00',
    ...overrides,
  }
}

function makePublished(
  snapshotOverrides: Partial<DiarySnapshot> = {},
): DiaryWithSnapshot {
  return {
    ...makeDiary(),
    snapshot: {
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
      mood: null,
      speech_key: PUBLISHED_KEY,
      speech_public: 1,
      published_at: '2026-09-29 12:00:00',
      ...snapshotOverrides,
    },
  }
}

async function createApp(isAuthenticated: boolean) {
  const { GET } = await import('./[id]')
  const { GET: GET_DRAFT } = await import('./[id]/draft')
  const app = new Hono<AppEnv>()
  const bucket = createBucket({
    [PUBLISHED_KEY]: AUDIO,
    [DRAFT_KEY]: AUDIO,
  })

  app.use('*', async (c, next) => {
    c.set('isAuthenticated', isAuthenticated)
    c.env = { DB: {}, BUCKET: bucket } as unknown as AppEnv['Bindings']
    await next()
  })

  app.get('/api/speech/:id', ...GET)
  app.get('/api/speech/:id/draft', ...GET_DRAFT)

  return { app, bucket }
}

async function mockPublished(snapshotOverrides: Partial<DiarySnapshot> = {}) {
  const { getDiaryWithSnapshot } = await import('../../../lib/db')
  vi.mocked(getDiaryWithSnapshot).mockResolvedValue(
    makePublished(snapshotOverrides),
  )
}

describe('GET /api/speech/:id（公開版）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('訪問者も聞ける設定なら未認証でも全体を返す', async () => {
    await mockPublished()
    const { app, bucket } = await createApp(false)

    const res = await app.request('/api/speech/abc')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('audio/wav')
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
    expect(res.headers.get('Content-Length')).toBe('100')
    expect(res.headers.get('Cache-Control')).toBe('no-cache')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(AUDIO)
    expect(bucket.get).toHaveBeenCalledWith(PUBLISHED_KEY)
  })

  test('speech_public = 0 は認証の有無にかかわらず 404', async () => {
    await mockPublished({ speech_public: 0 })

    const anonymous = await createApp(false)
    const res1 = await anonymous.app.request('/api/speech/abc')
    expect(res1.status).toBe(404)
    expect(anonymous.bucket.get).not.toHaveBeenCalled()

    const owner = await createApp(true)
    const res2 = await owner.app.request('/api/speech/abc')
    expect(res2.status).toBe(404)
    expect(owner.bucket.head).not.toHaveBeenCalled()
    expect(owner.bucket.get).not.toHaveBeenCalled()
  })

  test('公開中の speech_key が無ければ 404', async () => {
    await mockPublished({ speech_key: null })
    const { app } = await createApp(true)

    const res = await app.request('/api/speech/abc')

    expect(res.status).toBe(404)
  })

  test('R2 に実体が無ければ 404', async () => {
    await mockPublished({ speech_key: 'speech/abc/missing.wav' })
    const { app } = await createApp(false)

    const res = await app.request('/api/speech/abc')

    expect(res.status).toBe(404)
  })

  test('未公開の日記は 404', async () => {
    const { getDiaryWithSnapshot } = await import('../../../lib/db')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValue(null)
    const { app } = await createApp(true)

    const res = await app.request('/api/speech/abc')

    expect(res.status).toBe(404)
  })

  test('Range 付きなら 206 と正しい Content-Range で、その範囲だけを返す', async () => {
    await mockPublished()
    const { app, bucket } = await createApp(false)

    const res = await app.request('/api/speech/abc', {
      headers: { Range: 'bytes=0-1' },
    })

    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 0-1/100')
    expect(res.headers.get('Content-Length')).toBe('2')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      new Uint8Array([0, 1]),
    )
    expect(bucket.get).toHaveBeenCalledWith(PUBLISHED_KEY, {
      range: { offset: 0, length: 2 },
    })
  })

  test('末尾からの Range（-n）にも応える', async () => {
    await mockPublished()
    const { app } = await createApp(false)

    const res = await app.request('/api/speech/abc', {
      headers: { Range: 'bytes=-10' },
    })

    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 90-99/100')
    expect((await res.arrayBuffer()).byteLength).toBe(10)
  })

  test('範囲外は 416 と bytes */size', async () => {
    await mockPublished()
    const { app, bucket } = await createApp(false)

    const res = await app.request('/api/speech/abc', {
      headers: { Range: 'bytes=100-' },
    })

    expect(res.status).toBe(416)
    expect(res.headers.get('Content-Range')).toBe('bytes */100')
    expect(bucket.get).not.toHaveBeenCalled()
  })

  test('HEAD はヘッダだけを返し、本体を取りに行かない', async () => {
    await mockPublished()
    const { app, bucket } = await createApp(false)

    const res = await app.request('/api/speech/abc', { method: 'HEAD' })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Length')).toBe('100')
    expect(res.headers.get('Content-Type')).toBe('audio/wav')
    expect(bucket.get).not.toHaveBeenCalled()
  })

  test('HEAD も非公開なら認証の有無にかかわらず 404', async () => {
    await mockPublished({ speech_public: 0 })

    for (const isAuthenticated of [false, true]) {
      const { app } = await createApp(isAuthenticated)
      const res = await app.request('/api/speech/abc', { method: 'HEAD' })
      expect(res.status).toBe(404)
    }
  })

  test('配信は Gemini を呼ばない', async () => {
    const { synthesizeSpeech } = await import('../../../lib/speech')
    await mockPublished({ speech_key: null })
    const { app } = await createApp(true)

    await app.request('/api/speech/abc')

    expect(synthesizeSpeech).not.toHaveBeenCalled()
  })
})

describe('GET /api/speech/:id/draft（下書き）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('未認証は 401', async () => {
    const { app, bucket } = await createApp(false)

    const res = await app.request('/api/speech/abc/draft')

    expect(res.status).toBe(401)
    expect(bucket.get).not.toHaveBeenCalled()
  })

  test('認証済みなら diaries.speech_key の音声を private, no-store で返す', async () => {
    const { getDiary } = await import('../../../lib/db')
    vi.mocked(getDiary).mockResolvedValue(makeDiary())
    const { app, bucket } = await createApp(true)

    const res = await app.request('/api/speech/abc/draft')

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(bucket.get).toHaveBeenCalledWith(DRAFT_KEY)
  })

  test('Range 付きなら 206', async () => {
    const { getDiary } = await import('../../../lib/db')
    vi.mocked(getDiary).mockResolvedValue(makeDiary())
    const { app } = await createApp(true)

    const res = await app.request('/api/speech/abc/draft', {
      headers: { Range: 'bytes=10-' },
    })

    expect(res.status).toBe(206)
    expect(res.headers.get('Content-Range')).toBe('bytes 10-99/100')
    expect(res.headers.get('Content-Length')).toBe('90')
  })

  test('下書きに音声が無い・日記が無いときは 404', async () => {
    const { getDiary } = await import('../../../lib/db')
    vi.mocked(getDiary).mockResolvedValueOnce(makeDiary({ speech_key: null }))
    const { app } = await createApp(true)

    expect((await app.request('/api/speech/abc/draft')).status).toBe(404)

    vi.mocked(getDiary).mockResolvedValueOnce(null)
    expect((await app.request('/api/speech/abc/draft')).status).toBe(404)
  })
})
