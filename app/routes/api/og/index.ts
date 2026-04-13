import { createRoute } from '~/factory'
import { svgToPng } from '~/lib/og-image'

const WIDTH = 1200
const HEIGHT = 630

function generateTopOgSvg(appName: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#faf9f6" />
  <text
    x="${WIDTH / 2}"
    y="${HEIGHT / 2 - 20}"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="'Klee One', serif"
    font-size="64"
    font-weight="600"
    fill="#333"
  >${appName}</text>
  <text
    x="${WIDTH / 2}"
    y="${HEIGHT / 2 + 60}"
    text-anchor="middle"
    dominant-baseline="central"
    font-family="'Klee One', serif"
    font-size="28"
    fill="#666"
  >しまぶが400文字で綴る日記</text>
</svg>`
}

const PNG_HEADERS = {
  'Content-Type': 'image/png',
  'Cache-Control': 'public, max-age=86400',
}

const CACHE_KEY = 'og/top.png'

export default createRoute(async (c) => {
  const bucket = c.env.BUCKET

  const cached = await bucket.get(CACHE_KEY)
  if (cached) {
    return new Response(await cached.arrayBuffer(), { headers: PNG_HEADERS })
  }

  const appName = c.env.APP_NAME || '400字日記'
  const svg = generateTopOgSvg(appName)

  try {
    const png = await svgToPng(svg, c.env.ASSETS, bucket)
    await bucket.put(CACHE_KEY, png, {
      httpMetadata: { contentType: 'image/png' },
    })
    return new Response(
      new Blob([new Uint8Array(png)], { type: 'image/png' }),
      {
        headers: PNG_HEADERS,
      },
    )
  } catch {
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  }
})
