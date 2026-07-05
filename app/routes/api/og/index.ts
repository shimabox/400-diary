import { createRoute } from '~/factory'
import { DEFAULT_APP_NAME } from '~/lib/constants'
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

// PNG生成失敗時のSVGフォールバックは、正常系より短いTTLでキャッシュする。
// 障害復旧後に劣化OGP(SVGフォールバック)が最長1日キャッシュされ続けるのを防ぐため。
const SVG_FALLBACK_HEADERS = {
  'Content-Type': 'image/svg+xml',
  'Cache-Control': 'public, max-age=300',
}

const CACHE_KEY = 'og/top.png'

export default createRoute(async (c) => {
  const bucket = c.env.BUCKET

  const cached = await bucket.get(CACHE_KEY)
  if (cached) {
    return new Response(await cached.arrayBuffer(), { headers: PNG_HEADERS })
  }

  const appName = c.env.APP_NAME || DEFAULT_APP_NAME
  const svg = generateTopOgSvg(appName)

  try {
    const png = await svgToPng(svg, bucket)
    await bucket.put(CACHE_KEY, png, {
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
      headers: SVG_FALLBACK_HEADERS,
    })
  }
})
