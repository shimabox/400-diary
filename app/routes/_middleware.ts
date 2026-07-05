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
// - インラインスクリプトは使用していない。d/[id].tsx のスクロール制御と _renderer.tsx の
//   Google Fonts onload 属性は以前インラインスクリプト/属性を使っていたが、クライアント
//   バンドル（app/client.ts, app/spa-navigation.ts, app/lib/async-css.ts）側に処理を移し、
//   script-src から 'unsafe-inline' を排除した
//   ※ islands/calendar-view.tsx のヒートマップ横スクロール初期化には、hydration 前の
//   ちらつき防止用インラインスクリプトが今回のスコープ外として残っている。CSP により
//   実行はブロックされるが、同じ計算を行う useEffect フォールバックがあるため機能自体は
//   失われず、初期表示時に軽微なスクロール位置のちらつきが起きうるのみ。別途対応予定
// - インラインスタイル（style 属性 / <style> タグでの global.css インライン化）を多用しているため
//   style-src にも 'unsafe-inline' が必須
// - dev サーバー(vite)は HMR クライアントを読み込むためのインラインスクリプト
//   (`<script type="module">import("/@vite/client")...</script>`) を自動注入する。
//   これは vite の dev 専用の挙動で本番ビルドには含まれないため、import.meta.env.DEV が
//   本番ビルドで静的に false へ置換されることを利用し、dev 環境に限って
//   script-src に 'unsafe-inline' を足す。本番の CSP は厳格なまま保たれる
//   （authMiddleware の DEV_AUTH_BYPASS 分岐と同様、リクエストごとの関数内で参照することで
//   テストからも import.meta.env.DEV を切り替えて両方の分岐を検証できるようにしている）
const secureHeadersMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  return secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      scriptSrc: [
        "'self'",
        'https://static.cloudflareinsights.com',
        ...(import.meta.env.DEV ? ["'unsafe-inline'"] : []),
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
  })(c, next)
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
