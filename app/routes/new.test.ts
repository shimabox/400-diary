import { Hono } from 'hono'
import { jsxRenderer } from 'hono/jsx-renderer'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import { findFirstFreeDiaryDate, getDiaryIdByDate } from '../lib/db'
import { createMockDB } from '../lib/test-helpers'
import handlers from './new'

vi.mock('../lib/db', () => ({
  findFirstFreeDiaryDate: vi.fn(),
  getDiaryIdByDate: vi.fn(),
}))
vi.mock('../islands/vertical-editor', () => ({
  default: ({ initialDate }: { initialDate: string }) =>
    `editor:${initialDate}`,
}))

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

  test('今日の日記があれば次に空いている日で新規エディタを開く（JSTの日付を使う）', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T15:01:00Z'))
    vi.mocked(getDiaryIdByDate).mockResolvedValue('existing')
    vi.mocked(findFirstFreeDiaryDate).mockResolvedValue('2026-09-10')
    const res = await createApp(true).request('/new')
    expect(res.status).toBe(200)
    expect(getDiaryIdByDate).toHaveBeenCalledWith(
      expect.anything(),
      '2026-09-08',
    )
    expect(findFirstFreeDiaryDate).toHaveBeenCalledWith(
      expect.anything(),
      '2026-09-09',
    )
    const html = await res.text()
    expect(html).toContain('editor:2026-09-10')
    expect(html).toContain('href="/edit/existing"')
  })

  test('今日の日記がなければ今日の日付で新規エディタを表示する', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T15:01:00Z'))
    vi.mocked(getDiaryIdByDate).mockResolvedValue(null)
    const res = await createApp(true).request('/new')
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('editor:2026-09-08')
    expect(html).not.toContain('/edit/')
    expect(findFirstFreeDiaryDate).not.toHaveBeenCalled()
  })
})
