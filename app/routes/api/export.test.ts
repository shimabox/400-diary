import { unzipSync } from 'fflate'
import { Hono } from 'hono'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import type { Diary } from '../../lib/db'

vi.mock('../../lib/db', () => ({
  listAllDiaries: vi.fn(() => Promise.resolve([])),
}))

async function createApp(isAuthenticated: boolean) {
  const { GET } = await import('./export')
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('isAuthenticated', isAuthenticated)
    c.env = { DB: {} } as unknown as AppEnv['Bindings']
    await next()
  })

  app.get('/api/export', ...GET)

  return app
}

function makeDiary(overrides: Partial<Diary> = {}): Diary {
  return {
    id: 'diary-1',
    body: '本文テスト',
    image_key: null,
    image_layout: 'left',
    image_x: null,
    image_y: null,
    background_color: '#FFE4E1',
    mood: null,
    diary_date: '2026-07-05',
    published_snapshot_id: null,
    created_at: '2026-07-05T00:00:00',
    updated_at: '2026-07-05T00:00:00',
    ...overrides,
  }
}

describe('GET /api/export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('未認証は401を返す', async () => {
    const app = await createApp(false)

    const res = await app.request('/api/export')

    expect(res.status).toBe(401)
    const json = (await res.json()) as { error: string }
    expect(json.error).toContain('認証')
  })

  test('認証済みは200でzipを返す', async () => {
    const { listAllDiaries } = await import('../../lib/db')
    vi.mocked(listAllDiaries).mockResolvedValue([makeDiary()])
    const app = await createApp(true)

    const res = await app.request('/api/export')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/zip')
    expect(res.headers.get('Content-Disposition')).toContain(
      'attachment; filename="400-diary-export-',
    )
    expect(res.headers.get('Content-Disposition')).toContain('.zip"')
  })

  test('下書きを含む個人データのため CDN・共有キャッシュに保存されないよう指定する', async () => {
    const { listAllDiaries } = await import('../../lib/db')
    vi.mocked(listAllDiaries).mockResolvedValue([makeDiary()])
    const app = await createApp(true)

    const res = await app.request('/api/export')

    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  test('zip の中身は 1日記 = 1 md ファイルで、frontmatterと本文を含む', async () => {
    const { listAllDiaries } = await import('../../lib/db')
    vi.mocked(listAllDiaries).mockResolvedValue([
      makeDiary({
        diary_date: '2026-07-05',
        body: '今日は良い天気でした',
        mood: 'happy',
        published_snapshot_id: 'snap-1',
      }),
    ])
    const app = await createApp(true)

    const res = await app.request('/api/export')
    const buf = new Uint8Array(await res.arrayBuffer())
    const unzipped = unzipSync(buf)

    expect(Object.keys(unzipped)).toEqual(['2026-07-05.md'])
    const text = new TextDecoder().decode(unzipped['2026-07-05.md'])
    expect(text).toContain('date: "2026-07-05"')
    expect(text).toContain('mood: "happy"')
    expect(text).toContain('draft: false')
    expect(text).toContain('今日は良い天気でした')
  })

  test('同日複数件でもファイル名が衝突しない(昇順で -2, -3 と採番)', async () => {
    const { listAllDiaries } = await import('../../lib/db')
    vi.mocked(listAllDiaries).mockResolvedValue([
      makeDiary({ id: 'a', diary_date: '2026-07-05' }),
      makeDiary({ id: 'b', diary_date: '2026-07-05' }),
      makeDiary({ id: 'c', diary_date: '2026-07-05' }),
    ])
    const app = await createApp(true)

    const res = await app.request('/api/export')
    const buf = new Uint8Array(await res.arrayBuffer())
    const unzipped = unzipSync(buf)

    expect(Object.keys(unzipped).sort()).toEqual([
      '2026-07-05-2.md',
      '2026-07-05-3.md',
      '2026-07-05.md',
    ])
  })

  test('日記が0件でも空のzipを200で返す', async () => {
    const { listAllDiaries } = await import('../../lib/db')
    vi.mocked(listAllDiaries).mockResolvedValue([])
    const app = await createApp(true)

    const res = await app.request('/api/export')
    const buf = new Uint8Array(await res.arrayBuffer())
    const unzipped = unzipSync(buf)

    expect(res.status).toBe(200)
    expect(Object.keys(unzipped)).toEqual([])
  })
})
