import { Hono } from 'hono'
import { describe, expect, test } from 'vitest'
import type { AppEnv } from '~/factory'

function createGetApp(
  isAuthenticated: boolean,
  diary: { published_snapshot_id: string | null } | null,
) {
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('isAuthenticated', isAuthenticated)
    await next()
  })

  app.get('/api/diaries/:id', async (c) => {
    if (!diary) {
      return c.json({ error: '日記が見つかりません' }, 404)
    }

    if (!c.get('isAuthenticated') && !diary.published_snapshot_id) {
      return c.json({ error: '日記が見つかりません' }, 404)
    }

    return c.json(diary)
  })

  return app
}

describe('GET /api/diaries/:id 公開チェック', () => {
  test('認証済みなら未公開の日記も取得できる', async () => {
    const diary = { id: 'abc', body: '下書き', published_snapshot_id: null }
    const app = createGetApp(true, diary)

    const res = await app.request('/api/diaries/abc')

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.body).toBe('下書き')
  })

  test('未認証で公開済みの日記は取得できる', async () => {
    const diary = {
      id: 'abc',
      body: '公開済み',
      published_snapshot_id: 'snap1',
    }
    const app = createGetApp(false, diary)

    const res = await app.request('/api/diaries/abc')

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.body).toBe('公開済み')
  })

  test('未認証で未公開の日記は404を返す', async () => {
    const diary = { id: 'abc', body: '下書き', published_snapshot_id: null }
    const app = createGetApp(false, diary)

    const res = await app.request('/api/diaries/abc')

    expect(res.status).toBe(404)
  })

  test('存在しない日記は404を返す', async () => {
    const app = createGetApp(true, null)

    const res = await app.request('/api/diaries/not-found')

    expect(res.status).toBe(404)
  })
})
