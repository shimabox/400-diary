import { describe, expect, test } from 'vitest'
import { buildRssFeed } from './rss'

describe('buildRssFeed', () => {
  test('公開日記のRSS XMLを生成する', () => {
    const xml = buildRssFeed({
      appName: '400字日記',
      origin: 'https://example.com',
      items: [
        {
          id: 'diary-1',
          diary_date: '2026-04-13',
          body: '本文 <続き> & "引用"',
          published_at: '2026-04-13 12:34:56',
        },
      ],
    })

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain(
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    )
    expect(xml).toContain('<title>400字日記</title>')
    expect(xml).toContain('<link>https://example.com/</link>')
    expect(xml).toContain(
      '<atom:link href="https://example.com/rss.xml" rel="self" type="application/rss+xml" />',
    )
    expect(xml).toContain('<title>2026/4/13 (月) の日記</title>')
    expect(xml).toContain('<link>https://example.com/d/diary-1</link>')
    expect(xml).toContain(
      '<description>本文 &lt;続き&gt; &amp; &quot;引用&quot;</description>',
    )
    expect(xml).toContain('<pubDate>Mon, 13 Apr 2026 12:34:56 GMT</pubDate>')
  })

  test('アイテムが空でもchannelを生成する', () => {
    const xml = buildRssFeed({
      appName: 'テスト',
      origin: 'https://example.com',
      items: [],
    })

    expect(xml).toContain('<channel>')
    expect(xml).toContain('<title>テスト</title>')
    expect(xml).not.toContain('<item>')
  })
})
