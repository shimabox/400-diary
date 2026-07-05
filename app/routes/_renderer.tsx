import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'
import { Script } from 'honox/server'
import type { AppEnv } from '~/factory'
import { DEFAULT_APP_NAME } from '~/lib/constants'
import globalCss from '~/styles/global.css?inline'

export default jsxRenderer(
  ({ children, title, description, ogImage, preloadImage }) => {
    const c = useRequestContext<AppEnv>()
    const cfWebAnalyticsToken = c.env.CF_WEB_ANALYTICS_TOKEN
    const requestUrl = new URL(c.req.url)
    const isLocalhost =
      requestUrl.hostname === 'localhost' ||
      requestUrl.hostname === '127.0.0.1' ||
      requestUrl.hostname === '[::1]'
    const shouldLoadCfAnalytics =
      import.meta.env.PROD && cfWebAnalyticsToken && !isLocalhost
    const pageTitle = title ?? DEFAULT_APP_NAME
    return (
      <html lang="ja">
        <head>
          <meta charset="UTF-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />
          <title>{pageTitle}</title>
          {description && (
            <>
              <meta name="description" content={description} />
              <meta property="og:title" content={pageTitle} />
              <meta property="og:description" content={description} />
            </>
          )}
          {ogImage ? (
            <>
              <meta
                property="og:image"
                content={`${requestUrl.origin}${ogImage}`}
              />
              <meta name="twitter:card" content="summary_large_image" />
            </>
          ) : (
            description && <meta name="twitter:card" content="summary" />
          )}
          <link
            rel="alternate"
            type="application/rss+xml"
            title={`${pageTitle} RSS`}
            href="/rss.xml"
          />
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossorigin=""
          />
          {/* Google Fonts CSS を render-blocking から外す。
              media="print" で initial paint には適用させず、クライアントバンドル側
              （app/lib/async-css.ts）で media="all" に切り替えて適用する。
              以前は onload 属性（インラインイベントハンドラ）で切り替えていたが、
              CSP の script-src から 'unsafe-inline' を排除するため、data-async-css で
              マークして client.ts から querySelector する方式に変更した。
              Google 側の dynamic subsetting (unicode-range 分割) はそのまま活かせるため、
              自前ホスト+サブセットより総転送量で有利。 */}
          <link
            href="https://fonts.googleapis.com/css2?family=Klee+One:wght@400;600&display=swap"
            rel="stylesheet"
            media="print"
            data-async-css="true"
          />
          <noscript>
            <link
              href="https://fonts.googleapis.com/css2?family=Klee+One:wght@400;600&display=swap"
              rel="stylesheet"
            />
          </noscript>
          {/* global.css は 1KB 程度なので別リクエストにせず head へインライン化する。
              これで /static/assets/global.css の render-blocking リクエストを回避。 */}
          <style dangerouslySetInnerHTML={{ __html: globalCss }} />
          {preloadImage && (
            <link rel="preload" as="image" href={preloadImage} />
          )}
          <Script src="/app/client.ts" async />
        </head>
        <body>
          <main>{children}</main>
          {shouldLoadCfAnalytics && (
            <script
              defer
              src="https://static.cloudflareinsights.com/beacon.min.js"
              data-cf-beacon={`{"token": "${cfWebAnalyticsToken}"}`}
            />
          )}
        </body>
      </html>
    )
  },
)
