import { createRoute } from '~/factory'
import { svgToPng } from '~/lib/og-image'
import { getDiaryWithSnapshot } from '../../../lib/db'
import { formatDiaryDate } from '../../../lib/format'

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

export default createRoute(async (c) => {
  const id = c.req.param('id')!
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
    const png = await svgToPng(svg, c.env.ASSETS)
    return new Response(png.buffer as ArrayBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  }
})
