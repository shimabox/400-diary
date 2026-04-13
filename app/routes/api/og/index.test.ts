import { Hono } from 'hono'
import { describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'

const mockPngData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

vi.mock('~/lib/og-image', () => ({
  svgToPng: vi.fn(() => Promise.resolve(mockPngData)),
}))

function createApp(appName?: string) {
  const mockAssets = { fetch: vi.fn() }
  const mockBucket = { get: vi.fn() }
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.env = {
      APP_NAME: appName,
      ASSETS: mockAssets,
      BUCKET: mockBucket,
    } as unknown as AppEnv['Bindings']
    await next()
  })

  app.get('/api/og', async (c) => {
    const { svgToPng } = await import('~/lib/og-image')
    const name = c.env.APP_NAME || '400字日記'
    const svg = `<svg><text>${name}</text></svg>`

    try {
      const png = await svgToPng(svg, c.env.ASSETS, c.env.BUCKET)
      return new Response(png.buffer as ArrayBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400',
        },
      })
    } catch {
      return new Response(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=86400',
        },
      })
    }
  })

  return app
}

describe('GET /api/og', () => {
  test('Content-Typeがimage/pngで返る', async () => {
    const app = createApp('テスト日記')
    const res = await app.request('/api/og')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
  })

  test('Cache-Controlが24時間に設定されている', async () => {
    const app = createApp('テスト日記')
    const res = await app.request('/api/og')

    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400')
  })

  test('レスポンスボディがPNGバイナリである', async () => {
    const app = createApp('テスト日記')
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
    const app = createApp()
    const res = await app.request('/api/og')

    expect(res.status).toBe(200)

    const { svgToPng } = await import('~/lib/og-image')
    expect(svgToPng).toHaveBeenCalledWith(
      expect.stringContaining('400字日記'),
      expect.anything(),
      expect.anything(),
    )
  })

  test('PNG変換失敗時はSVGにフォールバックする', async () => {
    const { svgToPng } = await import('~/lib/og-image')
    vi.mocked(svgToPng).mockRejectedValueOnce(new Error('WASM init failed'))

    const app = createApp('テスト日記')
    const res = await app.request('/api/og')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
    const body = await res.text()
    expect(body).toContain('<svg>')
  })
})
