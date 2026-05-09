import { Hono } from 'hono'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'

vi.mock('../../../../lib/db', () => ({
  getDiary: vi.fn(),
  updateDiary: vi.fn(),
  countSnapshotsWithAudioKey: vi.fn(),
}))

vi.mock('../../../../lib/storage', () => ({
  deleteAudio: vi.fn(),
  generateAudioKey: vi.fn(() => 'diaries/abc/audio/new-key.webm'),
  uploadAudio: vi.fn(),
  validateAudio: vi.fn(() => ({ ok: true })),
}))

async function createApp(isAuthenticated: boolean) {
  const { POST, DELETE } = await import('./audio')
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('isAuthenticated', isAuthenticated)
    c.env = { DB: {}, BUCKET: {} } as unknown as AppEnv['Bindings']
    await next()
  })

  app.post('/api/diaries/:id/audio', ...POST)
  app.delete('/api/diaries/:id/audio', ...DELETE)

  return app
}

function postAudio(app: Hono<AppEnv>) {
  const form = new FormData()
  form.append(
    'file',
    new File([new Uint8Array([1, 2, 3])], 'voice.webm', {
      type: 'audio/webm',
    }),
  )
  return app.request('/api/diaries/abc/audio', {
    method: 'POST',
    body: form,
  })
}

describe('POST /api/diaries/:id/audio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('音声をアップロードして diary.audio_key を更新する', async () => {
    const { getDiary, updateDiary } = await import('../../../../lib/db')
    const { uploadAudio } = await import('../../../../lib/storage')

    vi.mocked(getDiary).mockResolvedValue({
      id: 'abc',
      audio_key: null,
    } as never)
    vi.mocked(updateDiary).mockResolvedValue({ id: 'abc' } as never)

    const app = await createApp(true)
    const res = await postAudio(app)

    expect(res.status).toBe(201)
    expect(uploadAudio).toHaveBeenCalledWith(
      expect.anything(),
      'diaries/abc/audio/new-key.webm',
      expect.any(ArrayBuffer),
      'audio/webm',
    )
    expect(updateDiary).toHaveBeenCalledWith(expect.anything(), 'abc', {
      audio_key: 'diaries/abc/audio/new-key.webm',
    })
  })

  test('旧音声を snapshot が参照していなければ R2 から削除する', async () => {
    const { getDiary, updateDiary, countSnapshotsWithAudioKey } = await import(
      '../../../../lib/db'
    )
    const { deleteAudio } = await import('../../../../lib/storage')

    vi.mocked(getDiary).mockResolvedValue({
      id: 'abc',
      audio_key: 'diaries/abc/audio/old.webm',
    } as never)
    vi.mocked(updateDiary).mockResolvedValue({ id: 'abc' } as never)
    vi.mocked(countSnapshotsWithAudioKey).mockResolvedValue(0)

    const app = await createApp(true)
    const res = await postAudio(app)

    expect(res.status).toBe(201)
    expect(deleteAudio).toHaveBeenCalledWith(
      expect.anything(),
      'diaries/abc/audio/old.webm',
    )
  })

  test('旧音声を snapshot が参照している場合は R2 を残す', async () => {
    const { getDiary, updateDiary, countSnapshotsWithAudioKey } = await import(
      '../../../../lib/db'
    )
    const { deleteAudio } = await import('../../../../lib/storage')

    vi.mocked(getDiary).mockResolvedValue({
      id: 'abc',
      audio_key: 'diaries/abc/audio/published.webm',
    } as never)
    vi.mocked(updateDiary).mockResolvedValue({ id: 'abc' } as never)
    vi.mocked(countSnapshotsWithAudioKey).mockResolvedValue(1)

    const app = await createApp(true)
    const res = await postAudio(app)

    expect(res.status).toBe(201)
    expect(deleteAudio).not.toHaveBeenCalled()
  })

  test('不正な MIME type は 400', async () => {
    const { getDiary } = await import('../../../../lib/db')
    const { validateAudio } = await import('../../../../lib/storage')

    vi.mocked(getDiary).mockResolvedValue({ id: 'abc' } as never)
    vi.mocked(validateAudio).mockReturnValueOnce({
      ok: false,
      error: '音声形式が不正です',
    })

    const app = await createApp(true)
    const res = await postAudio(app)

    expect(res.status).toBe(400)
  })

  test('未認証は 401', async () => {
    const app = await createApp(false)
    const res = await postAudio(app)

    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/diaries/:id/audio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('DB を先にクリアしてから孤児音声を削除する', async () => {
    const { getDiary, updateDiary, countSnapshotsWithAudioKey } = await import(
      '../../../../lib/db'
    )
    const { deleteAudio } = await import('../../../../lib/storage')

    vi.mocked(getDiary).mockResolvedValue({
      id: 'abc',
      audio_key: 'diaries/abc/audio/draft.webm',
    } as never)
    vi.mocked(updateDiary).mockResolvedValue({ id: 'abc' } as never)
    vi.mocked(countSnapshotsWithAudioKey).mockResolvedValue(0)

    const app = await createApp(true)
    const res = await app.request('/api/diaries/abc/audio', {
      method: 'DELETE',
    })

    expect(res.status).toBe(204)
    expect(updateDiary).toHaveBeenCalledWith(expect.anything(), 'abc', {
      audio_key: null,
    })
    expect(deleteAudio).toHaveBeenCalledWith(
      expect.anything(),
      'diaries/abc/audio/draft.webm',
    )
  })

  test('snapshot 参照中なら R2 から削除しない', async () => {
    const { getDiary, updateDiary, countSnapshotsWithAudioKey } = await import(
      '../../../../lib/db'
    )
    const { deleteAudio } = await import('../../../../lib/storage')

    vi.mocked(getDiary).mockResolvedValue({
      id: 'abc',
      audio_key: 'diaries/abc/audio/published.webm',
    } as never)
    vi.mocked(updateDiary).mockResolvedValue({ id: 'abc' } as never)
    vi.mocked(countSnapshotsWithAudioKey).mockResolvedValue(1)

    const app = await createApp(true)
    const res = await app.request('/api/diaries/abc/audio', {
      method: 'DELETE',
    })

    expect(res.status).toBe(204)
    expect(deleteAudio).not.toHaveBeenCalled()
  })
})
