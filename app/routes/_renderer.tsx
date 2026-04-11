import { jsxRenderer } from 'hono/jsx-renderer'
import { Script } from 'honox/server'

export default jsxRenderer(({ children, title, description, ogImage }) => {
  const pageTitle = title ?? '400字日記'
  return (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{pageTitle}</title>
        {description && (
          <>
            <meta name="description" content={description} />
            <meta property="og:title" content={pageTitle} />
            <meta property="og:description" content={description} />
            <meta name="twitter:card" content="summary" />
          </>
        )}
        {ogImage && <meta property="og:image" content={ogImage} />}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossorigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Klee+One:wght@400;600&display=swap"
          rel="stylesheet"
        />
        {import.meta.env.PROD ? (
          <link rel="stylesheet" href="/static/assets/global.css" />
        ) : (
          <link rel="stylesheet" href="/app/styles/global.css" />
        )}
        <Script src="/app/client.ts" async />
      </head>
      <body>{children}</body>
    </html>
  )
})
