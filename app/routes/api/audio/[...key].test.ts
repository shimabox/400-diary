import { Hono } from 'hono'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'

vi.mock('../../../lib/storage', () => ({
  getAudio: vi.fn(),
}))

async function createApp() {
  const { GET } = await import('./[...key]')
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.env = { BUCKET: {} } as unknown as AppEnv['Bindings']
    await next()
  })

  app.get('/api/audio/*', ...GET)

  return app
}

describe('GET /api/audio/* 公開範囲', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('diaries/:id/audio/ 配下の音声を配信する', async () => {
    const { getAudio } = await import('../../../lib/storage')
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.close()
      },
    })
    vi.mocked(getAudio).mockResolvedValue({
      body,
      contentType: 'audio/webm',
    })

    const app = await createApp()
    const res = await app.request('/api/audio/diaries/abc/audio/voice.webm')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('audio/webm')
    expect(res.headers.get('Cache-Control')).toBe(
      'public, max-age=31536000, immutable',
    )
    expect(vi.mocked(getAudio)).toHaveBeenCalledWith(
      expect.anything(),
      'diaries/abc/audio/voice.webm',
    )
  })

  test('diaries 配下でも audio フォルダ以外は 404', async () => {
    const { getAudio } = await import('../../../lib/storage')

    const app = await createApp()
    const res = await app.request('/api/audio/diaries/abc/photo.jpg')

    expect(res.status).toBe(404)
    expect(vi.mocked(getAudio)).not.toHaveBeenCalled()
  })

  test('内部 prefix は R2 を参照せず 404', async () => {
    const { getAudio } = await import('../../../lib/storage')

    const app = await createApp()
    const res = await app.request('/api/audio/fonts/klee-one-400.ttf')

    expect(res.status).toBe(404)
    expect(vi.mocked(getAudio)).not.toHaveBeenCalled()
  })

  test('R2 に存在しない場合は 404', async () => {
    const { getAudio } = await import('../../../lib/storage')
    vi.mocked(getAudio).mockResolvedValue(null)

    const app = await createApp()
    const res = await app.request('/api/audio/diaries/missing/audio/x.webm')

    expect(res.status).toBe(404)
  })
})
