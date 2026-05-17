import { Hono } from 'hono'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'

vi.mock('../../../lib/storage', () => ({
  getImage: vi.fn(),
}))

async function createApp() {
  const { GET } = await import('./[...key]')
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.env = { BUCKET: {} } as unknown as AppEnv['Bindings']
    await next()
  })

  app.get('/api/images/*', ...GET)

  return app
}

describe('GET /api/images/* 公開範囲', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('diaries/ prefix は従来通り配信される', async () => {
    const { getImage } = await import('../../../lib/storage')
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
        controller.close()
      },
    })
    vi.mocked(getImage).mockResolvedValue({
      body,
      contentType: 'image/jpeg',
    })

    const app = await createApp()
    const res = await app.request('/api/images/diaries/abc/123-xyz.jpg')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
    expect(vi.mocked(getImage)).toHaveBeenCalledWith(
      expect.anything(),
      'diaries/abc/123-xyz.jpg',
    )
  })

  test('fonts/ prefix は R2 を参照せず 404 を返す', async () => {
    const { getImage } = await import('../../../lib/storage')

    const app = await createApp()
    const res = await app.request('/api/images/fonts/klee-one-400.ttf')

    expect(res.status).toBe(404)
    expect(vi.mocked(getImage)).not.toHaveBeenCalled()
  })

  test('og/ prefix は R2 を参照せず 404 を返す', async () => {
    const { getImage } = await import('../../../lib/storage')

    const app = await createApp()
    const res = await app.request('/api/images/og/cache-key.png')

    expect(res.status).toBe(404)
    expect(vi.mocked(getImage)).not.toHaveBeenCalled()
  })

  test('prefix の無いキーは 404 を返す', async () => {
    const { getImage } = await import('../../../lib/storage')

    const app = await createApp()
    const res = await app.request('/api/images/secret')

    expect(res.status).toBe(404)
    expect(vi.mocked(getImage)).not.toHaveBeenCalled()
  })

  test('diaries/ prefix でも R2 に存在しない場合は 404', async () => {
    const { getImage } = await import('../../../lib/storage')
    vi.mocked(getImage).mockResolvedValue(null)

    const app = await createApp()
    const res = await app.request('/api/images/diaries/missing/file.jpg')

    expect(res.status).toBe(404)
  })
})
