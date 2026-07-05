import { Hono } from 'hono'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import { MAX_BODY_LENGTH } from '../../../lib/constants'
import type { Diary, DiarySnapshot, DiaryWithSnapshot } from '../../../lib/db'

vi.mock('../../../lib/db', () => ({
  getDiary: vi.fn(),
  getDiaryWithSnapshot: vi.fn(),
  updateDiary: vi.fn(),
  deleteDiary: vi.fn(),
  listSnapshotImageKeys: vi.fn(),
}))

vi.mock('../../../lib/storage', () => ({
  deleteImage: vi.fn(),
}))

vi.mock('../../../lib/og-cache', () => ({
  deleteDiaryOgCache: vi.fn(),
}))

async function createApp(isAuthenticated: boolean) {
  const { GET, PUT, DELETE } = await import('./[id]')
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

  app.get('/api/diaries/:id', ...GET)
  app.put('/api/diaries/:id', ...PUT)
  app.delete('/api/diaries/:id', ...DELETE)

  return app
}

function putJSON(app: Hono<AppEnv>, body: unknown) {
  return app.request('/api/diaries/abc', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeDiary(overrides: Partial<Diary> = {}): Diary {
  return {
    id: 'abc',
    body: '下書き本文',
    image_key: 'diaries/abc/draft.jpg',
    image_layout: 'left',
    image_x: null,
    image_y: null,
    background_color: '#FFFFFF',
    mood: 'happy',
    diary_date: '2026-04-15',
    published_snapshot_id: null,
    created_at: '2026-04-15 00:00:00',
    updated_at: '2026-04-15 00:00:00',
    ...overrides,
  }
}

function makeSnapshot(overrides: Partial<DiarySnapshot> = {}): DiarySnapshot {
  return {
    id: 'snap1',
    diary_id: 'abc',
    body: '公開済み本文',
    image_key: 'diaries/abc/published.jpg',
    image_layout: 'left',
    image_x: null,
    image_y: null,
    background_color: '#EEEEEE',
    mood: 'calm',
    published_at: '2026-04-15 12:00:00',
    ...overrides,
  }
}

describe('GET /api/diaries/:id 公開チェック', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('認証済みなら未公開の日記も取得でき、未使用の audio_key は返さない', async () => {
    const diary = {
      ...makeDiary({ body: '下書き' }),
      audio_key: 'diaries/abc/audio/old.webm',
    } as unknown as Diary
    const { getDiary } = await import('../../../lib/db')
    vi.mocked(getDiary).mockResolvedValue(diary)

    const app = await createApp(true)
    const res = await app.request('/api/diaries/abc')

    expect(res.status).toBe(200)
    const json = (await res.json()) as Record<string, unknown>
    expect(json.body).toBe('下書き')
    expect(json).not.toHaveProperty('audio_key')
  })

  test('未認証で公開済みの日記は snapshot の内容を返す', async () => {
    const diary = makeDiary({
      body: '未公開の下書き差分',
      image_key: 'diaries/abc/draft.jpg',
      background_color: '#FFFFFF',
      mood: 'happy',
      published_snapshot_id: 'snap1',
    })
    const snapshot = makeSnapshot({
      body: '公開された本文',
      image_key: 'diaries/abc/published.jpg',
      background_color: '#EEEEEE',
      mood: 'calm',
      published_at: '2026-04-15 12:00:00',
    })
    const { getDiaryWithSnapshot } = await import('../../../lib/db')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValue({
      ...diary,
      snapshot,
    } as DiaryWithSnapshot)

    const app = await createApp(false)
    const res = await app.request('/api/diaries/abc')

    expect(res.status).toBe(200)
    const json = (await res.json()) as Record<string, unknown>
    expect(json.body).toBe('公開された本文')
    expect(json.image_key).toBe('diaries/abc/published.jpg')
    expect(json).not.toHaveProperty('audio_key')
    expect(json.background_color).toBe('#EEEEEE')
    expect(json.mood).toBe('calm')
    expect(json.id).toBe('abc')
    expect(json.diary_date).toBe('2026-04-15')
    expect(json.published_at).toBe('2026-04-15 12:00:00')
  })

  test('未認証レスポンスに下書き側メタデータを含まない(回帰)', async () => {
    const diary = makeDiary({
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-04-19 23:59:59',
      published_snapshot_id: 'snap1',
    })
    const snapshot = makeSnapshot()
    const { getDiaryWithSnapshot } = await import('../../../lib/db')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValue({
      ...diary,
      snapshot,
    } as DiaryWithSnapshot)

    const app = await createApp(false)
    const res = await app.request('/api/diaries/abc')
    const json = (await res.json()) as Record<string, unknown>

    expect(json).not.toHaveProperty('created_at')
    expect(json).not.toHaveProperty('updated_at')
    expect(json).not.toHaveProperty('published_snapshot_id')
  })

  test('未認証時に下書きの body / image_key が漏れない(回帰)', async () => {
    const diary = makeDiary({
      body: 'SECRET_DRAFT_BODY',
      image_key: 'diaries/abc/SECRET_DRAFT_IMAGE.jpg',
      mood: 'sad',
      published_snapshot_id: 'snap1',
    })
    const snapshot = makeSnapshot({
      body: '公開された本文',
      image_key: 'diaries/abc/published.jpg',
      mood: 'happy',
    })
    const { getDiaryWithSnapshot } = await import('../../../lib/db')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValue({
      ...diary,
      snapshot,
    } as DiaryWithSnapshot)

    const app = await createApp(false)
    const res = await app.request('/api/diaries/abc')

    const text = await res.text()
    expect(text).not.toContain('SECRET_DRAFT_BODY')
    expect(text).not.toContain('SECRET_DRAFT_IMAGE')

    const json = JSON.parse(text) as Diary
    expect(json.mood).toBe('happy')
  })

  test('未認証で未公開の日記は404を返す', async () => {
    const { getDiaryWithSnapshot } = await import('../../../lib/db')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValue(null)

    const app = await createApp(false)
    const res = await app.request('/api/diaries/abc')

    expect(res.status).toBe(404)
  })

  test('認証済みで存在しない日記は404を返す', async () => {
    const { getDiary } = await import('../../../lib/db')
    vi.mocked(getDiary).mockResolvedValue(null)

    const app = await createApp(true)
    const res = await app.request('/api/diaries/not-found')

    expect(res.status).toBe(404)
  })
})

describe('PUT /api/diaries/:id バリデーション', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('未認証は401を返す', async () => {
    const app = await createApp(false)
    const res = await putJSON(app, { body: '更新' })

    expect(res.status).toBe(401)
  })

  test('本文が空は400を返す', async () => {
    const app = await createApp(true)
    const res = await putJSON(app, { body: '' })

    expect(res.status).toBe(400)
  })

  test('400文字ちょうどは許可される', async () => {
    const { updateDiary } = await import('../../../lib/db')
    vi.mocked(updateDiary).mockResolvedValue(makeDiary())

    const app = await createApp(true)
    const res = await putJSON(app, { body: 'あ'.repeat(400) })

    expect(res.status).toBe(200)
  })

  test('401文字は400エラーを返す', async () => {
    const app = await createApp(true)
    const res = await putJSON(app, { body: 'あ'.repeat(401) })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain(`${MAX_BODY_LENGTH}文字`)
  })

  test('bodyを省略した更新は許可される', async () => {
    const { updateDiary } = await import('../../../lib/db')
    vi.mocked(updateDiary).mockResolvedValue(makeDiary())

    const app = await createApp(true)
    const res = await putJSON(app, { background_color: '#D6E6FF' })

    expect(res.status).toBe(200)
  })

  test('不正な diary_date は400を返す', async () => {
    const app = await createApp(true)
    const res = await putJSON(app, { diary_date: 'not-a-date' })

    expect(res.status).toBe(400)
  })

  test('存在しない日付(2月30日)は400を返す', async () => {
    const app = await createApp(true)
    const res = await putJSON(app, { diary_date: '2026-02-30' })

    expect(res.status).toBe(400)
  })

  test('不正な background_color(XSS混入含む)は400を返す', async () => {
    const app = await createApp(true)
    const res = await putJSON(app, { background_color: '"/><script>' })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('背景色')
  })

  test('不正な image_layout は400を返す', async () => {
    const app = await createApp(true)
    const res = await putJSON(app, { image_layout: 'center' })

    expect(res.status).toBe(400)
  })

  test('不正な mood は400を返す', async () => {
    const app = await createApp(true)
    const res = await putJSON(app, { mood: 'invalid' })

    expect(res.status).toBe(400)
  })

  test('mood に null を指定した更新(明示的なクリア)は許可される', async () => {
    const { updateDiary } = await import('../../../lib/db')
    vi.mocked(updateDiary).mockResolvedValue(makeDiary({ mood: null }))

    const app = await createApp(true)
    const res = await putJSON(app, { mood: null })

    expect(res.status).toBe(200)
    expect(updateDiary).toHaveBeenCalledWith(
      expect.anything(),
      'abc',
      expect.objectContaining({ mood: null }),
    )
  })

  test('image_x が数値でない文字列の場合は400を返す', async () => {
    const app = await createApp(true)
    const res = await putJSON(app, { image_x: 'NaN文字列' })

    expect(res.status).toBe(400)
  })

  test('不正なJSONは400を返す', async () => {
    const app = await createApp(true)
    const res = await app.request('/api/diaries/abc', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('形式')
  })

  test('存在しない日記は404を返す', async () => {
    const { updateDiary } = await import('../../../lib/db')
    vi.mocked(updateDiary).mockResolvedValue(null)

    const app = await createApp(true)
    const res = await putJSON(app, { body: '更新' })

    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/diaries/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('未認証は401を返す', async () => {
    const app = await createApp(false)
    const res = await app.request('/api/diaries/abc', { method: 'DELETE' })
    expect(res.status).toBe(401)
  })

  test('存在しない日記は404を返す', async () => {
    const { getDiary } = await import('../../../lib/db')
    vi.mocked(getDiary).mockResolvedValue(null)

    const app = await createApp(true)
    const res = await app.request('/api/diaries/unknown', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  test('削除時に OGP キャッシュ(全スナップショット分)も R2 から捨てる', async () => {
    const { getDiary, listSnapshotImageKeys, deleteDiary } = await import(
      '../../../lib/db'
    )
    const { deleteDiaryOgCache } = await import('../../../lib/og-cache')
    vi.mocked(getDiary).mockResolvedValue(makeDiary({ image_key: null }))
    vi.mocked(listSnapshotImageKeys).mockResolvedValue([])
    vi.mocked(deleteDiary).mockResolvedValue(true)

    const app = await createApp(true)
    const res = await app.request('/api/diaries/abc', { method: 'DELETE' })

    expect(res.status).toBe(204)
    expect(deleteDiaryOgCache).toHaveBeenCalledWith(expect.anything(), 'abc')
  })
})
