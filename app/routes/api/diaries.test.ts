import { Hono } from 'hono'
import { describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import { MAX_BODY_LENGTH } from '../../lib/constants'
import { createMockDB } from '../../lib/test-helpers'

vi.mock('../../lib/db', () => ({
  createDiary: vi.fn((_db, params) =>
    Promise.resolve({ id: 'new-id', ...params }),
  ),
}))

function createPostApp(isAuthenticated: boolean) {
  const db = createMockDB()
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('isAuthenticated', isAuthenticated)
    c.env = { DB: db } as unknown as AppEnv['Bindings']
    await next()
  })

  app.post('/api/diaries', async (c) => {
    if (!c.get('isAuthenticated')) {
      return c.json({ error: '認証が必要です' }, 401)
    }

    const json = await c.req.json<{
      body?: string
      diary_date?: string
      background_color?: string
    }>()

    if (!json.body || json.body.length === 0) {
      return c.json({ error: '本文を入力してください' }, 400)
    }
    if (json.body.length > MAX_BODY_LENGTH) {
      return c.json(
        { error: `本文は${MAX_BODY_LENGTH}文字以内で入力してください` },
        400,
      )
    }
    if (!json.diary_date) {
      return c.json({ error: '日付を入力してください' }, 400)
    }

    const { createDiary } = await import('../../lib/db')
    const diary = await createDiary(c.env.DB, {
      body: json.body,
      diary_date: json.diary_date,
      background_color: json.background_color || '#FFE4E1',
    })

    return c.json(diary, 201)
  })

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
  test('未認証は401を返す', async () => {
    const app = createPostApp(false)
    const res = await postJSON(app, {
      body: 'テスト',
      diary_date: '2026-04-12',
    })

    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toContain('認証')
  })

  test('本文が空は400を返す', async () => {
    const app = createPostApp(true)
    const res = await postJSON(app, { body: '', diary_date: '2026-04-12' })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('本文')
  })

  test('本文がないは400を返す', async () => {
    const app = createPostApp(true)
    const res = await postJSON(app, { diary_date: '2026-04-12' })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('本文')
  })

  test('400文字ちょうどは許可される', async () => {
    const app = createPostApp(true)
    const body = 'あ'.repeat(400)

    const res = await postJSON(app, { body, diary_date: '2026-04-12' })

    expect(res.status).toBe(201)
  })

  test('401文字は400エラーを返す', async () => {
    const app = createPostApp(true)
    const body = 'あ'.repeat(401)
    const res = await postJSON(app, { body, diary_date: '2026-04-12' })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain(`${MAX_BODY_LENGTH}文字`)
  })

  test('日付がないは400を返す', async () => {
    const app = createPostApp(true)
    const res = await postJSON(app, { body: 'テスト' })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('日付')
  })

  test('正常なリクエストは201を返す', async () => {
    const app = createPostApp(true)

    const res = await postJSON(app, {
      body: 'テスト日記',
      diary_date: '2026-04-12',
      background_color: '#FFE4E1',
    })

    expect(res.status).toBe(201)
  })
})

describe('PUT /api/diaries/:id バリデーション', () => {
  function createPutApp(isAuthenticated: boolean) {
    const app = new Hono<AppEnv>()
    app.use('*', async (c, next) => {
      c.set('isAuthenticated', isAuthenticated)
      await next()
    })

    app.put('/api/diaries/:id', async (c) => {
      if (!c.get('isAuthenticated')) {
        return c.json({ error: '認証が必要です' }, 401)
      }

      const json = await c.req.json<{ body?: string }>()

      if (json.body !== undefined) {
        if (json.body.length === 0) {
          return c.json({ error: '本文を入力してください' }, 400)
        }
        if (json.body.length > MAX_BODY_LENGTH) {
          return c.json(
            { error: `本文は${MAX_BODY_LENGTH}文字以内で入力してください` },
            400,
          )
        }
      }

      return c.json({ id: c.req.param('id') })
    })

    return app
  }

  function putJSON(app: Hono<AppEnv>, body: unknown) {
    return app.request('/api/diaries/test-id', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  test('未認証は401を返す', async () => {
    const app = createPutApp(false)
    const res = await putJSON(app, { body: '更新' })

    expect(res.status).toBe(401)
  })

  test('本文が空は400を返す', async () => {
    const app = createPutApp(true)
    const res = await putJSON(app, { body: '' })

    expect(res.status).toBe(400)
  })

  test('400文字ちょうどは許可される', async () => {
    const app = createPutApp(true)
    const res = await putJSON(app, { body: 'あ'.repeat(400) })

    expect(res.status).toBe(200)
  })

  test('401文字は400エラーを返す', async () => {
    const app = createPutApp(true)
    const res = await putJSON(app, { body: 'あ'.repeat(401) })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain(`${MAX_BODY_LENGTH}文字`)
  })

  test('bodyを省略した更新は許可される', async () => {
    const app = createPutApp(true)
    const res = await putJSON(app, { background_color: '#D6E6FF' })

    expect(res.status).toBe(200)
  })
})
