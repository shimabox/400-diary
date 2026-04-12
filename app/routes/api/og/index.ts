import { createRoute } from '~/factory'

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

export default createRoute(async (c) => {
  const appName = c.env.APP_NAME || '400字日記'
  const svg = generateTopOgSvg(appName)

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  })
})
