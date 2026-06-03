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

export function buildRssFeed(params: {
  appName: string
  origin: string
  items: PublishedFeedItem[]
}): string {
  const { appName, origin, items } = params
  const siteUrl = `${origin}/`
  const feedUrl = `${origin}/rss.xml`
  const lastBuildDate = items[0]?.published_at
    ? `    <lastBuildDate>${toRssDate(items[0].published_at)}</lastBuildDate>\n`
    : ''
  const itemXml = items
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
