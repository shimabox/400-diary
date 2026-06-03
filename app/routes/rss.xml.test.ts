import { Hono } from 'hono'
import { describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import { createMockDB } from '~/lib/test-helpers'
import rssRoute from './rss.xml'

vi.mock('~/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/db')>()
  return {
    ...actual,
    listPublishedFeedItems: vi.fn(() =>
      Promise.resolve([
        {
          id: 'old-diary',
          diary_date: '2026-04-01',
          body: '古い日記',
          published_at: '2026-05-03 00:00:00',
        },
        {
          id: 'new-diary',
          diary_date: '2026-04-03',
          body: '新しい日記',
          published_at: '2026-05-01 00:00:00',
        },
        {
          id: 'same-date-newer-publish',
          diary_date: '2026-04-03',
          body: '同じ日付で後に公開した日記',
          published_at: '2026-05-02 00:00:00',
        },
      ]),
    ),
  }
})

function createApp() {
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.env = {
      DB: createMockDB(),
      APP_NAME: 'しまぶ日記',
    } as unknown as AppEnv['Bindings']
    await next()
  })

  app.get('/rss.xml', ...rssRoute)

  return app
}

describe('GET /rss.xml', () => {
  test('RSS記事は日記の日付順で返る', async () => {
    const app = createApp()
    const res = await app.request('http://example.com/rss.xml')
    const xml = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe(
      'application/rss+xml; charset=utf-8',
    )

    const sameDateIndex = xml.indexOf('/d/same-date-newer-publish')
    const newDiaryIndex = xml.indexOf('/d/new-diary')
    const oldDiaryIndex = xml.indexOf('/d/old-diary')

    expect(sameDateIndex).toBeGreaterThan(-1)
    expect(newDiaryIndex).toBeGreaterThan(sameDateIndex)
    expect(oldDiaryIndex).toBeGreaterThan(newDiaryIndex)
  })
})
