import { Hono } from 'hono'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'

vi.mock('../../../../lib/db', () => ({
  getDiary: vi.fn(),
  updateDiary: vi.fn(),
  countSnapshotsWithImageKey: vi.fn(),
}))

vi.mock('../../../../lib/storage', () => ({
  deleteImage: vi.fn(),
  generateImageKey: vi.fn(() => 'diaries/abc/new-key.jpg'),
  uploadImage: vi.fn(),
  validateImage: vi.fn(() => ({ ok: true })),
}))

async function createApp(isAuthenticated: boolean) {
  const { POST, DELETE } = await import('./image')
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('isAuthenticated', isAuthenticated)
    c.env = { DB: {}, BUCKET: {} } as unknown as AppEnv['Bindings']
    await next()
  })

  app.post('/api/diaries/:id/image', ...POST)
  app.delete('/api/diaries/:id/image', ...DELETE)

  return app
}

function postImage(app: Hono<AppEnv>) {
  const form = new FormData()
  form.append(
    'file',
    new File([new Uint8Array([1, 2, 3])], 'test.jpg', { type: 'image/jpeg' }),
  )
  return app.request('/api/diaries/abc/image', {
    method: 'POST',
    body: form,
  })
}

describe('POST /api/diaries/:id/image 旧画像の孤児削除', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('旧画像を snapshot が参照していなければ R2 から削除する', async () => {
    const { getDiary, updateDiary, countSnapshotsWithImageKey } = await import(
      '../../../../lib/db'
    )
    const { deleteImage } = await import('../../../../lib/storage')

    vi.mocked(getDiary).mockResolvedValue({
      id: 'abc',
      image_key: 'diaries/abc/old-key.jpg',
    } as never)
    vi.mocked(updateDiary).mockResolvedValue({ id: 'abc' } as never)
    vi.mocked(countSnapshotsWithImageKey).mockResolvedValue(0)

    const app = await createApp(true)
    const res = await postImage(app)

    expect(res.status).toBe(201)
    expect(vi.mocked(countSnapshotsWithImageKey)).toHaveBeenCalledWith(
      expect.anything(),
      'diaries/abc/old-key.jpg',
    )
    expect(vi.mocked(deleteImage)).toHaveBeenCalledWith(
      expect.anything(),
      'diaries/abc/old-key.jpg',
    )
  })

  test('旧画像を snapshot が参照している場合は R2 を残す', async () => {
    const { getDiary, updateDiary, countSnapshotsWithImageKey } = await import(
      '../../../../lib/db'
    )
    const { deleteImage } = await import('../../../../lib/storage')

    vi.mocked(getDiary).mockResolvedValue({
      id: 'abc',
      image_key: 'diaries/abc/published.jpg',
    } as never)
    vi.mocked(updateDiary).mockResolvedValue({ id: 'abc' } as never)
    vi.mocked(countSnapshotsWithImageKey).mockResolvedValue(1)

    const app = await createApp(true)
    const res = await postImage(app)

    expect(res.status).toBe(201)
    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
  })

  test('旧画像が無い(初回アップロード)場合は参照確認しない', async () => {
    const { getDiary, updateDiary, countSnapshotsWithImageKey } = await import(
      '../../../../lib/db'
    )
    const { deleteImage } = await import('../../../../lib/storage')

    vi.mocked(getDiary).mockResolvedValue({
      id: 'abc',
      image_key: null,
    } as never)
    vi.mocked(updateDiary).mockResolvedValue({ id: 'abc' } as never)

    const app = await createApp(true)
    const res = await postImage(app)

    expect(res.status).toBe(201)
    expect(vi.mocked(countSnapshotsWithImageKey)).not.toHaveBeenCalled()
    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
  })

  test('R2 削除に失敗してもレスポンスは 201 を返す', async () => {
    const { getDiary, updateDiary, countSnapshotsWithImageKey } = await import(
      '../../../../lib/db'
    )
    const { deleteImage } = await import('../../../../lib/storage')

    vi.mocked(getDiary).mockResolvedValue({
      id: 'abc',
      image_key: 'diaries/abc/old.jpg',
    } as never)
    vi.mocked(updateDiary).mockResolvedValue({ id: 'abc' } as never)
    vi.mocked(countSnapshotsWithImageKey).mockResolvedValue(0)
    vi.mocked(deleteImage).mockRejectedValueOnce(new Error('R2 down'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const app = await createApp(true)
    const res = await postImage(app)

    expect(res.status).toBe(201)
    errorSpy.mockRestore()
  })

  test('未認証は 401', async () => {
    const app = await createApp(false)
    const res = await postImage(app)

    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/diaries/:id/image snapshot 参照尊重', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('snapshot が参照中なら R2 から削除しない(公開ページ保護)', async () => {
    const { getDiary, updateDiary, countSnapshotsWithImageKey } = await import(
      '../../../../lib/db'
    )
    const { deleteImage } = await import('../../../../lib/storage')

    vi.mocked(getDiary).mockResolvedValue({
      id: 'abc',
      image_key: 'diaries/abc/published.jpg',
    } as never)
    vi.mocked(updateDiary).mockResolvedValue({ id: 'abc' } as never)
    vi.mocked(countSnapshotsWithImageKey).mockResolvedValue(1)

    const app = await createApp(true)
    const res = await app.request('/api/diaries/abc/image', {
      method: 'DELETE',
    })

    expect(res.status).toBe(204)
    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
    expect(vi.mocked(updateDiary)).toHaveBeenCalledWith(
      expect.anything(),
      'abc',
      { image_key: null },
    )
  })

  test('snapshot 参照無しなら R2 からも削除する', async () => {
    const { getDiary, updateDiary, countSnapshotsWithImageKey } = await import(
      '../../../../lib/db'
    )
    const { deleteImage } = await import('../../../../lib/storage')

    vi.mocked(getDiary).mockResolvedValue({
      id: 'abc',
      image_key: 'diaries/abc/draft.jpg',
    } as never)
    vi.mocked(updateDiary).mockResolvedValue({ id: 'abc' } as never)
    vi.mocked(countSnapshotsWithImageKey).mockResolvedValue(0)

    const app = await createApp(true)
    const res = await app.request('/api/diaries/abc/image', {
      method: 'DELETE',
    })

    expect(res.status).toBe(204)
    expect(vi.mocked(deleteImage)).toHaveBeenCalledWith(
      expect.anything(),
      'diaries/abc/draft.jpg',
    )
  })

  test('DB 更新を R2 delete より先に行う(DB 失敗時に R2 を壊さない)', async () => {
    const { getDiary, updateDiary, countSnapshotsWithImageKey } = await import(
      '../../../../lib/db'
    )
    const { deleteImage } = await import('../../../../lib/storage')

    vi.mocked(getDiary).mockResolvedValue({
      id: 'abc',
      image_key: 'diaries/abc/draft.jpg',
    } as never)
    vi.mocked(updateDiary).mockRejectedValueOnce(new Error('DB down'))

    const app = await createApp(true)
    const res = await app.request('/api/diaries/abc/image', {
      method: 'DELETE',
    })

    expect(res.status).toBe(500)
    expect(vi.mocked(countSnapshotsWithImageKey)).not.toHaveBeenCalled()
    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
  })

  test('画像が無い日記の DELETE は 204 を返し何もしない', async () => {
    const { getDiary, countSnapshotsWithImageKey } = await import(
      '../../../../lib/db'
    )
    const { deleteImage } = await import('../../../../lib/storage')

    vi.mocked(getDiary).mockResolvedValue({
      id: 'abc',
      image_key: null,
    } as never)

    const app = await createApp(true)
    const res = await app.request('/api/diaries/abc/image', {
      method: 'DELETE',
    })

    expect(res.status).toBe(204)
    expect(vi.mocked(countSnapshotsWithImageKey)).not.toHaveBeenCalled()
    expect(vi.mocked(deleteImage)).not.toHaveBeenCalled()
  })
})
