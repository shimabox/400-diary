import { createRoute } from '~/factory'
import { DEFAULT_APP_DESCRIPTION, DEFAULT_APP_NAME } from '~/lib/constants'
import { listPublishedFeedItems } from '~/lib/db'
import { buildRssFeed } from '~/lib/rss'

export default createRoute(async (c) => {
  const appName = c.env.APP_NAME || DEFAULT_APP_NAME
  const description = c.env.APP_DESCRIPTION || DEFAULT_APP_DESCRIPTION
  const origin = new URL(c.req.url).origin
  const items = await listPublishedFeedItems(c.env.DB)
  const feed = buildRssFeed({ appName, description, origin, items })

  return new Response(feed, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  })
})
