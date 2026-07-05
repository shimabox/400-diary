import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { secureHeaders } from 'hono/secure-headers'
import type { AppEnv } from '~/factory'
import { verifyAccess } from '../lib/auth'

// セキュリティヘッダー。CSP は以下の外部リソース/インライン利用を壊さないように設計している:
// - Google Fonts: スタイルシートは https://fonts.googleapis.com（_renderer.tsx）、
//   フォント本体は https://fonts.gstatic.com から読み込む
// - Cloudflare Web Analytics: スクリプトは https://static.cloudflareinsights.com（_renderer.tsx）、
//   ビーコン送信先は https://cloudflareinsights.com（connect-src）
// - インラインスクリプト（d/[id].tsx のスクロール制御、_renderer.tsx の onload 属性）を使っているため
//   script-src に 'unsafe-inline' を許容する。nonce 化すればより厳格にできるが、今回のスコープ外とし、
//   まずは XSS の主要な対策層（属性/入力のエスケープ・バリデーション）に守らせる
// - インラインスタイル（style 属性 / <style> タグでの global.css インライン化）を多用しているため
//   style-src にも 'unsafe-inline' が必須
const secureHeadersMiddleware = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    scriptSrc: [
      "'self'",
      "'unsafe-inline'",
      'https://static.cloudflareinsights.com',
    ],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'", 'https://cloudflareinsights.com'],
    objectSrc: ["'none'"],
    frameAncestors: ["'none'"],
  },
  // frame-ancestors 'none' が優先されるが、CSP 非対応の古いブラウザ向けフォールバックとして明示指定
  xFrameOptions: 'DENY',
  // デフォルトの same-origin だと OGP 画像や日記画像を外部サイトがブラウザ経由で
  // 読み込むケース（ホットリンクや一部フィードリーダー）を静かに壊す。
  // 公開コンテンツを配信するサイトなので CORP は付けない（従来挙動を維持）
  crossOriginResourcePolicy: false,
})

const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  // ローカル開発用バイパス。
  // import.meta.env.DEV は vite が本番ビルドでは false に静的置換して dead code として除去するため、
  // DEV_AUTH_BYPASS を誤って本番の環境変数に設定してしまっても認証はバイパスされない。
  if (import.meta.env.DEV && c.env.DEV_AUTH_BYPASS === 'true') {
    c.set('isAuthenticated', true)

    return next()
  }

  const token =
    c.req.header('Cf-Access-Jwt-Assertion') ?? getCookie(c, 'CF_Authorization')
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

export default [secureHeadersMiddleware, authMiddleware]
