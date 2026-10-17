import { Hono } from 'hono'
import { jsxRenderer } from 'hono/jsx-renderer'
import { describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import { createMockDB } from '../lib/test-helpers'
import handlers from './index'

vi.mock('../lib/db', () => ({
  getDiaryDateRange: vi.fn().mockResolvedValue(null),
  listDiariesPage: vi.fn().mockResolvedValue([]),
  listDiaryCalendarEntries: vi.fn().mockResolvedValue([]),
  listPublishedCalendarEntries: vi.fn().mockResolvedValue([]),
}))
vi.mock('../islands/calendar-view', () => ({ default: () => 'calendar' }))
vi.mock('../islands/diary-list', () => ({ default: () => 'list' }))
vi.mock('../islands/theme-toggle', () => ({ default: () => 'theme' }))

function createApp(env: Partial<AppEnv['Bindings']> = {}) {
  const app = new Hono<AppEnv>()
  app.use('*', async (c, next) => {
    c.set('isAuthenticated', false)
    c.env = { DB: createMockDB(), ...env } as unknown as AppEnv['Bindings']
    await next()
  })
  app.use(
    '*',
    jsxRenderer(({ children, description }) => (
      <html lang="ja">
        <head>
          <meta name="description" content={description} />
        </head>
        <body>{children}</body>
      </html>
    )),
  )
  app.get('/', ...handlers)
  return app
}

describe('GET /', () => {
  test('説明文は APP_DESCRIPTION を使い、未設定ならデフォルトにする', async () => {
    const custom = await createApp({ APP_DESCRIPTION: '毎日の記録' }).request(
      '/',
    )
    expect(await custom.text()).toContain(
      '<meta name="description" content="毎日の記録"/>',
    )

    const fallback = await createApp().request('/')
    expect(await fallback.text()).toContain(
      '<meta name="description" content="400文字で綴る日記"/>',
    )
  })

  test('フッターの X と GitHub のリンクは、設定したものだけ出す', async () => {
    const both = await (
      await createApp({
        X_URL: 'https://x.com/example',
        GITHUB_URL: 'https://github.com/example/400-diary',
      }).request('/')
    ).text()
    expect(both).toContain('href="https://x.com/example"')
    expect(both).toContain('href="https://github.com/example/400-diary"')

    const onlyGithub = await (
      await createApp({
        GITHUB_URL: 'https://github.com/example/400-diary',
      }).request('/')
    ).text()
    expect(onlyGithub).not.toContain('>X</a>')
    expect(onlyGithub).toContain('>GitHub</a>')

    const none = await (await createApp().request('/')).text()
    expect(none).not.toContain('>X</a>')
    expect(none).not.toContain('>GitHub</a>')
    expect(none).toContain('href="/rss.xml"')
  })
})
