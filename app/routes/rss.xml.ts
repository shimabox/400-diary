import { createRoute } from '~/factory'
import { listPublishedFeedItems } from '~/lib/db'
import { buildRssFeed } from '~/lib/rss'

export default createRoute(async (c) => {
  const appName = c.env.APP_NAME || '400字日記'
  const origin = new URL(c.req.url).origin
  const items = await listPublishedFeedItems(c.env.DB)
  const feed = buildRssFeed({ appName, origin, items })

  return new Response(feed, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  })
})
