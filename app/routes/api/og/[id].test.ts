import { Hono } from 'hono'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import type { DiaryWithSnapshot } from '~/lib/db'

const mockPngData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

vi.mock('~/lib/og-image', () => ({
  svgToPng: vi.fn(() => Promise.resolve(mockPngData)),
}))

vi.mock('~/lib/db', () => ({
  getDiaryWithSnapshot: vi.fn(),
}))

type MockBucket = {
  get: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
}

async function createApp() {
  const { default: handlers } = await import('./[id]')
  const app = new Hono<AppEnv>()
  const mockBucket: MockBucket = {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  }

  app.use('*', async (c, next) => {
    c.env = {
      DB: {},
      APP_NAME: 'テスト日記',
      BUCKET: mockBucket,
    } as unknown as AppEnv['Bindings']
    c.set('mockBucket' as never, mockBucket as never)
    await next()
  })

  app.get('/api/og/:id', ...handlers)

  return { app, mockBucket }
}

function makeResult(snapshotId = 'snap_abc123'): DiaryWithSnapshot {
  return {
    id: 'diary-1',
    diary_date: '2026-04-13',
    body: '下書き',
    image_key: null,
    audio_key: null,
    image_layout: 'left',
    image_x: null,
    image_y: null,
    background_color: '#FFE4E1',
    mood: 'happy',
    published_snapshot_id: snapshotId,
    created_at: '2026-04-13 00:00:00',
    updated_at: '2026-04-15 00:00:00',
    snapshot: {
      id: snapshotId,
      diary_id: 'diary-1',
      body: '公開された本文',
      image_key: null,
      audio_key: null,
      image_layout: 'left',
      image_x: null,
      image_y: null,
      background_color: '#FFE4E1',
      mood: 'happy',
      published_at: '2026-04-15 12:00:00',
    },
  }
}

describe('GET /api/og/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('公開済み日記のOGP画像がPNGで返る', async () => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValueOnce(makeResult())

    const { app } = await createApp()
    const res = await app.request('/api/og/diary-1')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400')
  })

  test('キャッシュキーが og/{diaryId}/{snapshotId}.png 形式(stale回避)', async () => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValueOnce(
      makeResult('snap_xyz'),
    )

    const { app, mockBucket } = await createApp()
    await app.request('/api/og/diary-1')

    expect(mockBucket.get).toHaveBeenCalledWith('og/diary-1/snap_xyz.png')
    expect(mockBucket.put).toHaveBeenCalledWith(
      'og/diary-1/snap_xyz.png',
      expect.anything(),
      expect.anything(),
    )
  })

  test('再公開で snapshot.id が変われば別キーで保存される(回帰)', async () => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')

    // 1回目: snap_old
    vi.mocked(getDiaryWithSnapshot).mockResolvedValueOnce(
      makeResult('snap_old'),
    )
    const first = await createApp()
    await first.app.request('/api/og/diary-1')
    expect(first.mockBucket.get).toHaveBeenCalledWith('og/diary-1/snap_old.png')

    // 2回目（再公開後相当）: snap_new
    vi.mocked(getDiaryWithSnapshot).mockResolvedValueOnce(
      makeResult('snap_new'),
    )
    const second = await createApp()
    await second.app.request('/api/og/diary-1')
    expect(second.mockBucket.get).toHaveBeenCalledWith(
      'og/diary-1/snap_new.png',
    )
  })

  test('キャッシュヒット時は svgToPng を呼ばずに R2 の PNG を返す', async () => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')
    const { svgToPng } = await import('~/lib/og-image')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValueOnce(makeResult())

    const { app, mockBucket } = await createApp()
    mockBucket.get.mockResolvedValueOnce({
      arrayBuffer: () => Promise.resolve(mockPngData.buffer),
    })

    const res = await app.request('/api/og/diary-1')

    expect(res.status).toBe(200)
    expect(svgToPng).not.toHaveBeenCalled()
  })

  test('SVGに日記の背景色が反映される', async () => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')
    const { svgToPng } = await import('~/lib/og-image')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValueOnce(makeResult())

    const { app } = await createApp()
    await app.request('/api/og/diary-1')

    expect(svgToPng).toHaveBeenCalledWith(
      expect.stringContaining('#FFE4E1'),
      expect.anything(),
    )
  })

  test('PNG変換失敗時はSVGにフォールバックする', async () => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')
    const { svgToPng } = await import('~/lib/og-image')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValueOnce(makeResult())
    vi.mocked(svgToPng).mockRejectedValueOnce(new Error('WASM init failed'))

    const { app } = await createApp()
    const res = await app.request('/api/og/diary-1')

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/svg+xml')
    const body = await res.text()
    expect(body).toContain('#FFE4E1')
  })

  test('存在しない日記は404を返す(R2 lookup は走らない)', async () => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValueOnce(null)

    const { app, mockBucket } = await createApp()
    const res = await app.request('/api/og/nonexistent')

    expect(res.status).toBe(404)
    expect(mockBucket.get).not.toHaveBeenCalled()
  })
})
