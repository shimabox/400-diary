import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'

vi.mock('../lib/auth', () => ({
  verifyAccess: vi.fn(),
}))

import { verifyAccess } from '../lib/auth'
import middlewares from './_middleware'

function createApp(env: Partial<AppEnv['Bindings']> = {}) {
  const app = new Hono<AppEnv>()

  // authMiddleware が c.env を参照するため、実際の HonoX と同様に
  // ミドルウェア適用前に env をセットしておく
  app.use('*', async (c, next) => {
    c.env = env as AppEnv['Bindings']
    await next()
  })
  app.use('*', ...middlewares)
  app.get('/', (c) => c.json({ isAuthenticated: c.get('isAuthenticated') }))

  return app
}

describe('_middleware', () => {
  beforeEach(() => {
    vi.mocked(verifyAccess).mockReset()
  })

  describe('secureHeaders', () => {
    describe('本番ビルド相当(import.meta.env.DEV === false)', () => {
      // authMiddleware の DEV_AUTH_BYPASS 分岐と同様、script-src の 'unsafe-inline' も
      // import.meta.env.DEV を見て切り替えているため、本番相当の検証はここで DEV を
      // 明示的に false にして行う(vite は本番ビルド時にこれを静的に false へ置換する)。
      beforeEach(() => {
        import.meta.env.DEV = false
      })

      afterEach(() => {
        // 他のテストに影響しないよう元に戻す
        import.meta.env.DEV = true
      })

      test('CSP・nosniff・Referrer-Policy・frame-ancestors 相当のヘッダーが付与される', async () => {
        vi.mocked(verifyAccess).mockResolvedValue(false)
        const app = createApp({
          CF_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
          CF_ACCESS_AUD: 'aud-tag',
        })

        const res = await app.request('/')

        expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
        expect(res.headers.get('Referrer-Policy')).toBeTruthy()
        // frame-ancestors 'none' を主として使い、古いブラウザ向けに X-Frame-Options も設定する
        expect(res.headers.get('X-Frame-Options')).toBe('DENY')

        const csp = res.headers.get('Content-Security-Policy')
        expect(csp).toBeTruthy()
        expect(csp).toContain("frame-ancestors 'none'")
        expect(csp).toContain("default-src 'self'")
        // Google Fonts: stylesheet と フォント本体
        expect(csp).toContain('style-src')
        expect(csp).toContain('https://fonts.googleapis.com')
        expect(csp).toContain('font-src')
        expect(csp).toContain('https://fonts.gstatic.com')
        // Cloudflare Web Analytics: script と beacon 送信先(connect-src)
        expect(csp).toContain('https://static.cloudflareinsights.com')
        expect(csp).toContain('connect-src')
        expect(csp).toContain('https://cloudflareinsights.com')
        // 本番相当では script-src から 'unsafe-inline' を排除済み
        // (インラインスクリプトは全て外部化。理由は _middleware.ts のコメント参照)
        expect(csp).toContain(
          "script-src 'self' https://static.cloudflareinsights.com",
        )
        const scriptSrcDirective = csp
          ?.split(';')
          .find((directive) => directive.trim().startsWith('script-src'))
        expect(scriptSrcDirective).not.toContain('unsafe-inline')
        // style-src はインラインスタイルを多用しているため 'unsafe-inline' を維持(理由は _middleware.ts のコメント参照)
        expect(csp).toContain("style-src 'self' 'unsafe-inline'")
        expect(csp).toContain("img-src 'self' data:")
      })
    })

    test('dev環境(import.meta.env.DEV === true)では vite の HMR インラインスクリプト用に script-src へ unsafe-inline を許容する', async () => {
      // vitest の実行時は import.meta.env.DEV が true になる
      expect(import.meta.env.DEV).toBe(true)
      vi.mocked(verifyAccess).mockResolvedValue(false)
      const app = createApp({
        CF_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
        CF_ACCESS_AUD: 'aud-tag',
      })

      const res = await app.request('/')
      const csp = res.headers.get('Content-Security-Policy')

      expect(csp).toContain(
        "script-src 'self' https://static.cloudflareinsights.com 'unsafe-inline'",
      )
    })
  })

  describe('DEV_AUTH_BYPASS', () => {
    test('dev環境(import.meta.env.DEV === true)で DEV_AUTH_BYPASS=true なら認証をバイパスする', async () => {
      // vitest の実行時は import.meta.env.DEV が true になる
      expect(import.meta.env.DEV).toBe(true)

      const app = createApp({ DEV_AUTH_BYPASS: 'true' })
      const res = await app.request('/')
      const body = (await res.json()) as { isAuthenticated: boolean }

      expect(body.isAuthenticated).toBe(true)
      expect(verifyAccess).not.toHaveBeenCalled()
    })

    test('dev環境でも DEV_AUTH_BYPASS が未設定なら通常の認証フローに進む', async () => {
      vi.mocked(verifyAccess).mockResolvedValue(true)
      const app = createApp({
        CF_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
        CF_ACCESS_AUD: 'aud-tag',
      })

      const res = await app.request('/')
      const body = (await res.json()) as { isAuthenticated: boolean }

      expect(body.isAuthenticated).toBe(true)
      expect(verifyAccess).toHaveBeenCalledTimes(1)
    })

    describe('本番ビルド相当(import.meta.env.DEV === false)', () => {
      // vite は本番ビルド時に import.meta.env.DEV を静的に false へ置換し、
      // `import.meta.env.DEV && ...` の右辺は dead code として除去される。
      // vitest ではモジュールの静的置換が起きないため、実行時に import.meta.env.DEV を
      // 直接書き換えることで「本番ビルドではこの分岐に絶対入らない」ことを検証する。
      beforeEach(() => {
        // vite が本番ビルド時に静的置換する DEV フラグを、テストでは実行時に切り替えて再現する
        import.meta.env.DEV = false
      })

      afterEach(() => {
        // 他のテストに影響しないよう元に戻す
        import.meta.env.DEV = true
      })

      test('DEV_AUTH_BYPASS=true を誤って設定しても認証はバイパスされない', async () => {
        vi.mocked(verifyAccess).mockResolvedValue(false)
        const app = createApp({
          DEV_AUTH_BYPASS: 'true',
          CF_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com',
          CF_ACCESS_AUD: 'aud-tag',
        })

        const res = await app.request('/')
        const body = (await res.json()) as { isAuthenticated: boolean }

        expect(body.isAuthenticated).toBe(false)
        expect(verifyAccess).toHaveBeenCalledTimes(1)
      })
    })

    test('teamDomain/aud が未設定なら未認証扱いになる', async () => {
      const app = createApp({})
      const res = await app.request('/')
      const body = (await res.json()) as { isAuthenticated: boolean }

      expect(body.isAuthenticated).toBe(false)
      expect(verifyAccess).not.toHaveBeenCalled()
    })
  })
})
