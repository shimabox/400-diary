import { Hono } from 'hono'
import { describe, expect, test } from 'vitest'
import type { AppEnv } from '~/factory'
import handlers from './[name]'

function createApp() {
  const app = new Hono<AppEnv>()
  app.get('/auth/:name', ...handlers)
  return app
}

describe('GET /auth/:name', () => {
  test.each([
    '400_diary',
    'my-login',
  ])('/auth/%s はトップへ戻す', async (name) => {
    const res = await createApp().request(`/auth/${name}`)
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('/')
  })
})
