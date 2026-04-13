import { Hono } from 'hono'
import { describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import { createMockDB } from '~/lib/test-helpers'

const mockPngData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

vi.mock('~/lib/og-image', () => ({
  svgToPng: vi.fn(() => Promise.resolve(mockPngData)),
}))

vi.mock('~/lib/db', () => ({
  getDiaryWithSnapshot: vi.fn(),
}))

function createApp() {
  const db = createMockDB()
  const mockBucket = { get: vi.fn() }
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.env = {
      DB: db,
      APP_NAME: 'テスト日記',
      BUCKET: mockBucket,
    } as unknown as AppEnv['Bindings']
    await next()
  })

  app.get('/api/og/:id', async (c) => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')
    const { svgToPng } = await import('~/lib/og-image')
    const { formatDiaryDate } = await import('~/lib/format')

    const id = c.req.param('id')!
    const result = await getDiaryWithSnapshot(c.env.DB, id)

    if (!result) {
      return c.notFound()
    }

    const appName = c.env.APP_NAME || '400字日記'
    const { snapshot, ...diary } = result as {
      diary_date: string
      snapshot: { background_color: string }
    }
    const dateLabel = formatDiaryDate(diary.diary_date)
    const bgColor = snapshot.background_color

    const svg = `<svg><rect fill="${bgColor}"/><text>${dateLabel}の日記</text><text>${appName}</text></svg>`

    try {
      const png = await svgToPng(svg, c.env.BUCKET)
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

const mockDiary = {
  id: 'diary-1',
  diary_date: '2026-04-13',
  snapshot: {
    background_color: '#FFE4E1',
  },
}

describe('GET /api/og/:id', () => {
  test('公開済み日記のOGP画像がPNGで返る', async () => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValueOnce(mockDiary as never)

    const app = createApp()
    const res = await app.request('/api/og/diary-1')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400')
  })

  test('レスポンスボディがPNGバイナリである', async () => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValueOnce(mockDiary as never)

    const app = createApp()
    const res = await app.request('/api/og/diary-1')

    const buffer = await res.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    expect(bytes[0]).toBe(137)
    expect(bytes[1]).toBe(80)
  })

  test('SVGに日記の背景色が反映される', async () => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')
    const { svgToPng } = await import('~/lib/og-image')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValueOnce(mockDiary as never)

    const app = createApp()
    await app.request('/api/og/diary-1')

    expect(svgToPng).toHaveBeenCalledWith(
      expect.stringContaining('#FFE4E1'),
      expect.anything(),
    )
  })

  test('PNG変換失敗時はSVGにフォールバックする', async () => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')
    const { svgToPng } = await import('~/lib/og-image')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValueOnce(mockDiary as never)
    vi.mocked(svgToPng).mockRejectedValueOnce(new Error('WASM init failed'))

    const app = createApp()
    const res = await app.request('/api/og/diary-1')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
    const body = await res.text()
    expect(body).toContain('#FFE4E1')
  })

  test('存在しない日記は404を返す', async () => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValueOnce(null as never)

    const app = createApp()
    const res = await app.request('/api/og/nonexistent')

    expect(res.status).toBe(404)
  })
})
