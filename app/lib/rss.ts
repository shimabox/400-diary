import type { PublishedFeedItem } from './db'
import { formatDiaryDate } from './format'

const FEED_DESCRIPTION = 'しまぶが400文字で綴る日記'

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function toRssDate(value: string): string {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(hasTimezone ? normalized : `${normalized}Z`)
  return Number.isNaN(date.getTime())
    ? new Date(value).toUTCString()
    : date.toUTCString()
}

function compareFeedItemsByDiaryDate(
  a: PublishedFeedItem,
  b: PublishedFeedItem,
): number {
  if (a.diary_date !== b.diary_date) {
    return b.diary_date.localeCompare(a.diary_date)
  }
  return b.published_at.localeCompare(a.published_at)
}

export function buildRssFeed(params: {
  appName: string
  origin: string
  items: PublishedFeedItem[]
}): string {
  const { appName, origin, items } = params
  const orderedItems = [...items].sort(compareFeedItemsByDiaryDate)
  const siteUrl = `${origin}/`
  const feedUrl = `${origin}/rss.xml`
  const lastBuildDate = orderedItems[0]?.published_at
    ? `    <lastBuildDate>${toRssDate(orderedItems[0].published_at)}</lastBuildDate>\n`
    : ''
  const itemXml = orderedItems
    .map((item) => {
      const url = `${origin}/d/${item.id}`
      const title = `${formatDiaryDate(item.diary_date)} の日記`
      return `    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description>${escapeXml(item.body)}</description>
      <pubDate>${toRssDate(item.published_at)}</pubDate>
    </item>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(appName)}</title>
    <link>${escapeXml(siteUrl)}</link>
    <description>${escapeXml(FEED_DESCRIPTION)}</description>
    <language>ja</language>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${lastBuildDate}${itemXml}
  </channel>
</rss>`
}
