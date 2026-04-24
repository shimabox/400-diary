import { Hono } from 'hono'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import type { DiarySnapshot } from '../../../../lib/db'

vi.mock('../../../../lib/db', () => ({
  publishDiary: vi.fn(),
}))

vi.mock('../../../../lib/og-image', () => ({
  deleteOgCache: vi.fn(),
}))

async function createApp(isAuthenticated: boolean) {
  const { POST } = await import('./publish')
  const app = new Hono<AppEnv>()
  const mockBucket = { delete: vi.fn() }

  app.use('*', async (c, next) => {
    c.set('isAuthenticated', isAuthenticated)
    c.env = {
      DB: {},
      BUCKET: mockBucket,
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
    background_color: '#FFFFFF',
    mood: 'happy',
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

  test('存在しない日記は404を返し、OGPキャッシュ削除は呼ばない', async () => {
    const { publishDiary } = await import('../../../../lib/db')
    const { deleteOgCache } = await import('../../../../lib/og-image')
    vi.mocked(publishDiary).mockResolvedValue(null)

    const app = await createApp(true)
    const res = await app.request('/api/diaries/unknown/publish', {
      method: 'POST',
    })

    expect(res.status).toBe(404)
    expect(deleteOgCache).not.toHaveBeenCalled()
  })

  test('公開成功時に OGP キャッシュを削除して次回リクエストで再生成させる', async () => {
    const { publishDiary } = await import('../../../../lib/db')
    const { deleteOgCache } = await import('../../../../lib/og-image')
    vi.mocked(publishDiary).mockResolvedValue(makeSnapshot())

    const app = await createApp(true)
    const res = await app.request('/api/diaries/abc/publish', {
      method: 'POST',
    })

    expect(res.status).toBe(200)
    expect(deleteOgCache).toHaveBeenCalledWith(expect.anything(), 'abc')
  })

  test('OGP キャッシュ削除が失敗してもレスポンスは成功にする', async () => {
    const { publishDiary } = await import('../../../../lib/db')
    const { deleteOgCache } = await import('../../../../lib/og-image')
    vi.mocked(publishDiary).mockResolvedValue(makeSnapshot())
    vi.mocked(deleteOgCache).mockRejectedValueOnce(new Error('R2 down'))

    const app = await createApp(true)
    const res = await app.request('/api/diaries/abc/publish', {
      method: 'POST',
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as { published_at: string }
    expect(json.published_at).toBe('2026-04-15 12:00:00')
  })
})
