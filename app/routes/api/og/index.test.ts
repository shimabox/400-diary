import { Hono } from 'hono'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'

const mockPngData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

vi.mock('~/lib/og-image', () => ({
  svgToPng: vi.fn(() => Promise.resolve(mockPngData)),
}))

type MockBucket = {
  get: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
}

async function createApp(appName?: string) {
  const { default: handlers } = await import('./index')
  const app = new Hono<AppEnv>()
  const mockBucket: MockBucket = {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  }

  app.use('*', async (c, next) => {
    c.env = {
      APP_NAME: appName,
      BUCKET: mockBucket,
    } as unknown as AppEnv['Bindings']
    await next()
  })

  app.get('/api/og', ...handlers)

  return { app, mockBucket }
}

describe('GET /api/og', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('Content-Typeがimage/pngで返る', async () => {
    const { app } = await createApp('テスト日記')
    const res = await app.request('/api/og')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  test('Cache-Controlが24時間に設定されている', async () => {
    const { app } = await createApp('テスト日記')
    const res = await app.request('/api/og')

    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400')
  })

  test('レスポンスボディがPNGバイナリである', async () => {
    const { app } = await createApp('テスト日記')
    const res = await app.request('/api/og')

    const buffer = await res.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    // PNGマジックバイト
    expect(bytes[0]).toBe(137)
    expect(bytes[1]).toBe(80) // P
    expect(bytes[2]).toBe(78) // N
    expect(bytes[3]).toBe(71) // G
  })

  test('APP_NAME未設定時はデフォルト名が使われる', async () => {
    const { app } = await createApp()
    const res = await app.request('/api/og')

    expect(res.status).toBe(200)

    const { svgToPng } = await import('~/lib/og-image')
    expect(svgToPng).toHaveBeenCalledWith(
      expect.stringContaining('400字日記'),
      expect.anything(),
    )
  })

  test('キャッシュキーが og/top.png でR2に保存される', async () => {
    const { app, mockBucket } = await createApp('テスト日記')
    await app.request('/api/og')

    expect(mockBucket.get).toHaveBeenCalledWith('og/top.png')
    expect(mockBucket.put).toHaveBeenCalledWith(
      'og/top.png',
      expect.anything(),
      expect.anything(),
    )
  })

  test('キャッシュヒット時は svgToPng を呼ばずに R2 の PNG を返す', async () => {
    const { svgToPng } = await import('~/lib/og-image')
    const { app, mockBucket } = await createApp('テスト日記')
    mockBucket.get.mockResolvedValueOnce({
      arrayBuffer: () => Promise.resolve(mockPngData.buffer),
    })

    const res = await app.request('/api/og')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(svgToPng).not.toHaveBeenCalled()
    expect(mockBucket.put).not.toHaveBeenCalled()
  })

  test('PNG変換失敗時はSVGにフォールバックする', async () => {
    const { svgToPng } = await import('~/lib/og-image')
    vi.mocked(svgToPng).mockRejectedValueOnce(new Error('WASM init failed'))

    const { app } = await createApp('テスト日記')
    const res = await app.request('/api/og')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300')
    const body = await res.text()
    expect(body).toContain('<svg')
    expect(body).toContain('テスト日記')
  })
})
