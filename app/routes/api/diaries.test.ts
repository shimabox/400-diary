import { Hono } from 'hono'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import { MAX_BODY_LENGTH } from '../../lib/constants'
import { createMockDB } from '../../lib/test-helpers'

vi.mock('../../lib/db', () => ({
  createDiary: vi.fn((_db, params) =>
    Promise.resolve({ id: 'new-id', ...params }),
  ),
}))

async function createPostApp(isAuthenticated: boolean) {
  const { POST } = await import('./diaries')
  const db = createMockDB()
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('isAuthenticated', isAuthenticated)
    c.env = { DB: db } as unknown as AppEnv['Bindings']
    await next()
  })

  app.post('/api/diaries', ...POST)

  return app
}

function postJSON(app: Hono<AppEnv>, body: unknown) {
  return app.request('/api/diaries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/diaries バリデーション', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('未認証は401を返す', async () => {
    const app = await createPostApp(false)
    const res = await postJSON(app, {
      body: 'テスト',
      diary_date: '2026-04-12',
    })

    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toContain('認証')
  })

  test('本文が空は400を返す', async () => {
    const app = await createPostApp(true)
    const res = await postJSON(app, { body: '', diary_date: '2026-04-12' })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('本文')
  })

  test('本文がないは400を返す', async () => {
    const app = await createPostApp(true)
    const res = await postJSON(app, { diary_date: '2026-04-12' })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('本文')
  })

  test('400文字ちょうどは許可される', async () => {
    const app = await createPostApp(true)
    const body = 'あ'.repeat(400)

    const res = await postJSON(app, { body, diary_date: '2026-04-12' })

    expect(res.status).toBe(201)
  })

  test('401文字は400エラーを返す', async () => {
    const app = await createPostApp(true)
    const body = 'あ'.repeat(401)
    const res = await postJSON(app, { body, diary_date: '2026-04-12' })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain(`${MAX_BODY_LENGTH}文字`)
  })

  test('日付がないは400を返す', async () => {
    const app = await createPostApp(true)
    const res = await postJSON(app, { body: 'テスト' })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('日付')
  })

  test('日付の形式が不正な場合は400を返す', async () => {
    const app = await createPostApp(true)
    const res = await postJSON(app, { body: 'テスト', diary_date: 'abc' })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('日付')
  })

  test('存在しない日付(2月30日)は400を返す', async () => {
    const app = await createPostApp(true)
    const res = await postJSON(app, {
      body: 'テスト',
      diary_date: '2026-02-30',
    })

    expect(res.status).toBe(400)
  })

  test('不正な背景色(XSS混入含む)は400を返す', async () => {
    const app = await createPostApp(true)
    const res = await postJSON(app, {
      body: 'テスト',
      diary_date: '2026-04-12',
      background_color: '"/><script>alert(1)</script>',
    })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('背景色')
  })

  test('不正な image_layout は400を返す', async () => {
    const app = await createPostApp(true)
    const res = await postJSON(app, {
      body: 'テスト',
      diary_date: '2026-04-12',
      image_layout: 'center',
    })

    expect(res.status).toBe(400)
  })

  test('不正な mood は400を返す', async () => {
    const app = await createPostApp(true)
    const res = await postJSON(app, {
      body: 'テスト',
      diary_date: '2026-04-12',
      mood: 'invalid',
    })

    expect(res.status).toBe(400)
  })

  test('image_x が数値でない文字列の場合は400を返す', async () => {
    const app = await createPostApp(true)
    const res = await postJSON(app, {
      body: 'テスト',
      diary_date: '2026-04-12',
      image_x: 'NaN文字列',
    })

    expect(res.status).toBe(400)
  })

  test('不正なJSONは400を返す', async () => {
    const app = await createPostApp(true)
    const res = await app.request('/api/diaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('形式')
  })

  test('正常なリクエストは201を返す', async () => {
    const app = await createPostApp(true)

    const res = await postJSON(app, {
      body: 'テスト日記',
      diary_date: '2026-04-12',
      background_color: '#FFE4E1',
    })

    expect(res.status).toBe(201)
  })
})
