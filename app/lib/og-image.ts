import type { Fetcher } from '@cloudflare/workers-types/latest'
import { initWasm, Resvg } from '@resvg/resvg-wasm'

let wasmInitialized = false
let fontDataCache: Uint8Array[] | null = null

const FONT_FILES = [
  '/static/klee-one-400-ogp-subset.ttf',
  '/static/klee-one-600-ogp-subset.ttf',
]

async function ensureWasmInitialized(assets: Fetcher): Promise<void> {
  if (wasmInitialized) return
  const wasmResponse = await assets.fetch('https://dummy/static/resvg_bg.wasm')
  const wasmBuffer = await wasmResponse.arrayBuffer()
  await initWasm(wasmBuffer)
  wasmInitialized = true
}

async function loadFonts(assets: Fetcher): Promise<Uint8Array[]> {
  if (fontDataCache) return fontDataCache

  const fontBuffers = await Promise.all(
    FONT_FILES.map(async (path) => {
      const res = await assets.fetch(`https://dummy${path}`)
      return new Uint8Array(await res.arrayBuffer())
    }),
  )

  fontDataCache = fontBuffers
  return fontBuffers
}

export async function svgToPng(
  svg: string,
  assets: Fetcher,
): Promise<Uint8Array> {
  await ensureWasmInitialized(assets)
  const fonts = await loadFonts(assets)

  const resvg = new Resvg(svg, {
    font: {
      fontBuffers: fonts,
      defaultFontFamily: 'Klee One',
    },
  })

  const rendered = resvg.render()
  return rendered.asPng()
}
