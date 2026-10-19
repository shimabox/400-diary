import { Hono } from 'hono'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import { pickRandomPublishedDiaryId } from '~/lib/db'
import { createMockDB } from '~/lib/test-helpers'
import randomRoute from './random'

vi.mock('~/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/db')>()
  return {
    ...actual,
    pickRandomPublishedDiaryId: vi.fn(),
  }
})

function createApp() {
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.env = {
      DB: createMockDB(),
    } as unknown as AppEnv['Bindings']
    await next()
  })

  app.get('/random', ...randomRoute)

  return app
}

describe('GET /random', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('from 以外から選んだ公開中の日記へ、キャッシュさせずに 302 で案内する', async () => {
    vi.mocked(pickRandomPublishedDiaryId).mockResolvedValueOnce('diary-2')

    const res = await createApp().request(
      'http://example.com/random?from=diary-1',
    )

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/d/diary-2')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(pickRandomPublishedDiaryId).toHaveBeenCalledWith(
      expect.anything(),
      'diary-1',
    )
  })

  test('選べる日記が無ければトップへ 302 で戻す', async () => {
    vi.mocked(pickRandomPublishedDiaryId).mockResolvedValueOnce(null)

    const res = await createApp().request(
      'http://example.com/random?from=diary-1',
    )

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/')
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  test('from が無ければ除外せずに選ぶ', async () => {
    vi.mocked(pickRandomPublishedDiaryId).mockResolvedValueOnce('diary-3')

    const res = await createApp().request('http://example.com/random')

    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/d/diary-3')
    expect(pickRandomPublishedDiaryId).toHaveBeenCalledWith(
      expect.anything(),
      null,
    )
  })
})
