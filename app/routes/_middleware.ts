import { createMiddleware } from 'hono/factory'
import type { AppEnv } from '~/factory'
import { verifyAccess } from '../lib/auth'

const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  // ローカル開発用バイパス
  if (c.env.DEV_AUTH_BYPASS === 'true') {
    c.set('isAuthenticated', true)
    return next()
  }

  const token = c.req.header('Cf-Access-Jwt-Assertion')
  const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN
  const aud = c.env.CF_ACCESS_AUD

  if (!teamDomain || !aud) {
    c.set('isAuthenticated', false)
    return next()
  }

  const isAuthenticated = await verifyAccess(token, teamDomain, aud)
  c.set('isAuthenticated', isAuthenticated)
  return next()
})

export default [authMiddleware]
