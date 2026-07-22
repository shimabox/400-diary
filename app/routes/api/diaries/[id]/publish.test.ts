import { Hono } from 'hono'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import type { DiarySnapshot } from '../../../../lib/db'

vi.mock('../../../../lib/db', () => ({
  publishDiary: vi.fn(),
}))

async function createApp(isAuthenticated: boolean) {
  const { POST } = await import('./publish')
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('isAuthenticated', isAuthenticated)
    c.env = {
      DB: {},
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
    const { publishDiary } = await import('../../../../lib/db')
    vi.mocked(publishDiary).mockResolvedValue(makeSnapshot())

    const app = await createApp(true)
    const res = await app.request('/api/diaries/abc/publish', {
      method: 'POST',
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as { published_at: string }
    expect(json.published_at).toBe('2026-04-15 12:00:00')
  })
})
