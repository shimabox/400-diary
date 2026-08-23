import { getCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { secureHeaders } from 'hono/secure-headers'
import type { AppEnv } from '~/factory'
import { verifyAccess } from '../lib/auth'
import { HEATMAP_SCROLL_INLINE_SCRIPT_HASH } from '../lib/heatmap-scroll-inline'

// セキュリティヘッダー。CSP は以下の外部リソース/インライン利用を壊さないように設計している:
// - Google Fonts: スタイルシートは https://fonts.googleapis.com（_renderer.tsx）、
//   フォント本体は https://fonts.gstatic.com から読み込む
// - Cloudflare Web Analytics: スクリプトは https://static.cloudflareinsights.com（_renderer.tsx）、
//   ビーコン送信先は https://cloudflareinsights.com（connect-src）
// - インラインスクリプトは使用していない。d/[id].tsx のスクロール制御と _renderer.tsx の
//   Google Fonts onload 属性は以前インラインスクリプト/属性を使っていたが、クライアント
//   バンドル（app/client.ts, app/spa-navigation.ts, app/lib/async-css.ts）側に処理を移し、
//   script-src から 'unsafe-inline' を排除した
//   ※ islands/calendar-view.tsx のヒートマップ横スクロール初期化だけは「hydration 前に
//   実行してちらつきを抑える」ことが目的のため外部化できない。'unsafe-inline' で全許可する
//   代わりに、このスクリプト（静的文字列）の SHA-256 ハッシュのみを本番の script-src で
//   個別許可する。ハッシュとスクリプト本体の整合は heatmap-scroll-inline.test.ts が検証する
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
        // CSP はハッシュ/nonce が存在すると 'unsafe-inline' を無視する仕様のため、
        // dev（vite の HMR インラインスクリプトに 'unsafe-inline' が必要）では
        // ハッシュを付けず、本番のみハッシュで calendar-view のインラインスクリプトを許可する
        ...(import.meta.env.DEV
          ? ["'unsafe-inline'"]
          : [HEATMAP_SCROLL_INLINE_SCRIPT_HASH]),
      ],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      // data: はフォント置換系のブラウザ拡張が data URI フォントを注入するのを
      // 許容するため。フォントはスクリプト実行ベクタではなく、style-src が既に
      // 'unsafe-inline' を許容している以上、data: フォントの遮断に追加の防御価値はほぼ無い
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
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

    await next()
    return
  }

  const token =
    c.req.header('Cf-Access-Jwt-Assertion') ?? getCookie(c, 'CF_Authorization')
  const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN
  const aud = c.env.CF_ACCESS_AUD

  if (!teamDomain || !aud) {
    c.set('isAuthenticated', false)

    await next()
    return
  }

  const isAuthenticated = await verifyAccess(token, teamDomain, aud)
  c.set('isAuthenticated', isAuthenticated)
  await next()
})

export default [secureHeadersMiddleware, authMiddleware]
