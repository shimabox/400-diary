import { Hono } from 'hono'
import { jsxRenderer } from 'hono/jsx-renderer'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import { getDiaryIdByDate } from '../lib/db'
import { createMockDB } from '../lib/test-helpers'
import handlers from './new'

vi.mock('../lib/db', () => ({ getDiaryIdByDate: vi.fn() }))
vi.mock('../islands/vertical-editor', () => ({ default: () => 'editor' }))

function createApp(authenticated: boolean) {
  const app = new Hono<AppEnv>()
  app.use('*', async (c, next) => {
    c.set('isAuthenticated', authenticated)
    c.env = { DB: createMockDB() } as unknown as AppEnv['Bindings']
    await next()
  })
  app.use('*', jsxRenderer())
  app.get('/new', ...handlers)
  return app
}

afterEach(() => {
  vi.resetAllMocks()
  vi.useRealTimers()
})

describe('GET /new', () => {
  test('未認証なら日記を検索せずトップへ戻す', async () => {
    const res = await createApp(false).request('/new')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/')
    expect(getDiaryIdByDate).not.toHaveBeenCalled()
  })

  test('今日の日記があれば編集へ進む（JSTの日付を使う）', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T15:01:00Z'))
    vi.mocked(getDiaryIdByDate).mockResolvedValue('existing')
    const res = await createApp(true).request('/new')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/edit/existing')
    expect(getDiaryIdByDate).toHaveBeenCalledWith(
      expect.anything(),
      '2026-09-08',
    )
  })

  test('今日の日記がなければ新規エディタを表示する', async () => {
    vi.mocked(getDiaryIdByDate).mockResolvedValue(null)
    const res = await createApp(true).request('/new')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('editor')
  })
})
