import { Hono } from 'hono'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import { MAX_BODY_LENGTH } from '../../lib/constants'
import type { DiaryWithPublished } from '../../lib/db'
import { createMockDB } from '../../lib/test-helpers'

vi.mock('../../lib/db', () => ({
  createDiary: vi.fn((_db, params) =>
    Promise.resolve({ id: 'new-id', ...params }),
  ),
  listDiariesPage: vi.fn(() => Promise.resolve([])),
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

async function createGetApp(isAuthenticated: boolean) {
  const { GET } = await import('./diaries')
  const db = createMockDB()
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('isAuthenticated', isAuthenticated)
    c.env = { DB: db } as unknown as AppEnv['Bindings']
    await next()
  })

  app.get('/api/diaries', ...GET)

  return app
}

function postJSON(app: Hono<AppEnv>, body: unknown) {
  return app.request('/api/diaries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeRow(
  overrides: Partial<DiaryWithPublished> = {},
): DiaryWithPublished {
  return {
    id: 'diary-1',
    body: '下書き本文（未公開データ）',
    image_key: null,
    image_layout: 'left',
    image_x: null,
    image_y: null,
    background_color: '#FFE4E1',
    mood: 'happy',
    diary_date: '2026-07-05',
    published_snapshot_id: 'snap-1',
    created_at: '2026-07-05T00:00:00',
    updated_at: '2026-07-05T00:00:00',
    published_at: '2026-07-05T00:00:00',
    snapshot_body: '公開本文',
    snapshot_background_color: '#FFE4E1',
    snapshot_image_key: null,
    snapshot_image_layout: 'left',
    snapshot_image_x: null,
    snapshot_image_y: null,
    snapshot_mood: 'happy',
    ...overrides,
  }
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

describe('GET /api/diaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('limit 省略時は31件で取得し、取得件数が31未満なら next は null', async () => {
    const { listDiariesPage } = await import('../../lib/db')
    vi.mocked(listDiariesPage).mockResolvedValue([makeRow()])
    const app = await createGetApp(true)

    const res = await app.request('/api/diaries')

    expect(res.status).toBe(200)
    const json = (await res.json()) as { items: unknown[]; next: unknown }
    expect(json.items).toHaveLength(1)
    expect(json.next).toBeNull()
    expect(vi.mocked(listDiariesPage)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 31, publishedOnly: false }),
    )
  })

  test('取得件数が limit と一致する場合、next カーソルを返す', async () => {
    const { listDiariesPage } = await import('../../lib/db')
    const rows = Array.from({ length: 2 }, (_, i) =>
      makeRow({ id: `diary-${i}`, diary_date: `2026-07-0${5 - i}` }),
    )
    vi.mocked(listDiariesPage).mockResolvedValue(rows)
    const app = await createGetApp(true)

    const res = await app.request('/api/diaries?limit=2')

    const json = (await res.json()) as {
      next: { before_date: string; before_id: string } | null
    }
    expect(json.next).toEqual({
      before_date: '2026-07-04',
      before_id: 'diary-1',
    })
  })

  test('limit は 1〜100 にクランプされる', async () => {
    const { listDiariesPage } = await import('../../lib/db')
    vi.mocked(listDiariesPage).mockResolvedValue([])
    const app = await createGetApp(true)

    await app.request('/api/diaries?limit=9999')
    expect(vi.mocked(listDiariesPage)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 100 }),
    )

    await app.request('/api/diaries?limit=0')
    expect(vi.mocked(listDiariesPage)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 1 }),
    )

    await app.request('/api/diaries?limit=not-a-number')
    expect(vi.mocked(listDiariesPage)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 31 }),
    )
  })

  test('before_date のみ指定は400を返す', async () => {
    const app = await createGetApp(true)

    const res = await app.request('/api/diaries?before_date=2026-07-01')

    expect(res.status).toBe(400)
  })

  test('before_id のみ指定は400を返す', async () => {
    const app = await createGetApp(true)

    const res = await app.request('/api/diaries?before_id=abc')

    expect(res.status).toBe(400)
  })

  test('before_date の形式が不正なら400を返す', async () => {
    const app = await createGetApp(true)

    const res = await app.request(
      '/api/diaries?before_date=not-a-date&before_id=abc',
    )

    expect(res.status).toBe(400)
  })

  test('before_id に不正な文字が含まれる場合は400を返す', async () => {
    const app = await createGetApp(true)

    const res = await app.request(
      '/api/diaries?before_date=2026-07-01&before_id=%3Cscript%3E',
    )

    expect(res.status).toBe(400)
  })

  test('正しいカーソルは listDiariesPage に渡される', async () => {
    const { listDiariesPage } = await import('../../lib/db')
    vi.mocked(listDiariesPage).mockResolvedValue([])
    const app = await createGetApp(true)

    await app.request('/api/diaries?before_date=2026-07-01&before_id=cursor-id')

    expect(vi.mocked(listDiariesPage)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        before: { diaryDate: '2026-07-01', id: 'cursor-id' },
      }),
    )
  })

  test('未認証時は publishedOnly:true で問い合わせる', async () => {
    const { listDiariesPage } = await import('../../lib/db')
    vi.mocked(listDiariesPage).mockResolvedValue([])
    const app = await createGetApp(false)

    await app.request('/api/diaries')

    expect(vi.mocked(listDiariesPage)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ publishedOnly: true }),
    )
  })

  test('未認証時は下書き本文がレスポンスJSONに一切現れない', async () => {
    const { listDiariesPage } = await import('../../lib/db')
    vi.mocked(listDiariesPage).mockResolvedValue([makeRow()])
    const app = await createGetApp(false)

    const res = await app.request('/api/diaries')
    const text = await res.text()

    expect(text).not.toContain('下書き本文（未公開データ）')
    expect(text).toContain('公開本文')
  })

  test('認証なしでもアクセスできる（認証不要エンドポイント）', async () => {
    const { listDiariesPage } = await import('../../lib/db')
    vi.mocked(listDiariesPage).mockResolvedValue([])
    const app = await createGetApp(false)

    const res = await app.request('/api/diaries')

    expect(res.status).toBe(200)
  })

  test('未認証で published_snapshot_id が無い行が紛れ込んでも防御的に除外される', async () => {
    const { listDiariesPage } = await import('../../lib/db')
    vi.mocked(listDiariesPage).mockResolvedValue([
      makeRow({ published_snapshot_id: null, snapshot_body: null }),
    ])
    const app = await createGetApp(false)

    const res = await app.request('/api/diaries')
    const json = (await res.json()) as { items: unknown[] }

    expect(json.items).toEqual([])
  })
})
