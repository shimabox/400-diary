import { createRoute } from '~/factory'
import { getDiaryWithSnapshot } from '~/lib/db'
import { formatDiaryDate } from '~/lib/format'
import { ogCacheKey, svgToPng } from '~/lib/og-image'

const WIDTH = 1200
const HEIGHT = 630

function generateOgSvg(
  dateLabel: string,
  appName: string,
  bgColor: string,
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${bgColor}" />
  <text
    x="${WIDTH / 2}"
    y="${HEIGHT / 2 - 20}"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="'Klee One', serif"
    font-size="52"
    font-weight="600"
    fill="#333"
  >${dateLabel}の日記</text>
  <text
    x="${WIDTH / 2}"
    y="${HEIGHT / 2 + 60}"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="'Klee One', serif"
    font-size="32"
    fill="#666"
  >${appName}</text>
</svg>`
}

const PNG_HEADERS = {
  'Content-Type': 'image/png',
  'Cache-Control': 'public, max-age=86400',
}

export default createRoute(async (c) => {
  const id = c.req.param('id')!
  const bucket = c.env.BUCKET
  const cacheKey = ogCacheKey(id)

  const cached = await bucket.get(cacheKey)
  if (cached) {
    return new Response(await cached.arrayBuffer(), { headers: PNG_HEADERS })
  }

  const db = c.env.DB
  const result = await getDiaryWithSnapshot(db, id)

  if (!result) {
    return c.notFound()
  }

  const appName = c.env.APP_NAME || '400字日記'
  const { snapshot, ...diary } = result
  const dateLabel = formatDiaryDate(diary.diary_date)
  const bgColor = snapshot.background_color

  const svg = generateOgSvg(dateLabel, appName, bgColor)

  try {
    const png = await svgToPng(svg, bucket)
    await bucket.put(cacheKey, png, {
      httpMetadata: { contentType: 'image/png' },
    })
    return new Response(
      new Blob([new Uint8Array(png)], { type: 'image/png' }),
      {
        headers: PNG_HEADERS,
      },
    )
  } catch (e) {
    console.error('[OGP] PNG generation failed:', e)
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  }
})
