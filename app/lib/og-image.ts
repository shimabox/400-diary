import type { Fetcher, R2Bucket } from '@cloudflare/workers-types/latest'
import { initWasm, Resvg } from '@resvg/resvg-wasm'

let wasmInitialized = false
let fontDataCache: Uint8Array[] | null = null

const FONT_R2_KEYS = ['fonts/klee-one-400.ttf', 'fonts/klee-one-600.ttf']

async function ensureWasmInitialized(assets: Fetcher): Promise<void> {
  if (wasmInitialized) return
  const wasmResponse = await assets.fetch('https://dummy/static/resvg_bg.wasm')
  const wasmBuffer = await wasmResponse.arrayBuffer()
  await initWasm(wasmBuffer)
  wasmInitialized = true
}

async function loadFonts(bucket: R2Bucket): Promise<Uint8Array[]> {
  if (fontDataCache) return fontDataCache

  const fontBuffers = await Promise.all(
    FONT_R2_KEYS.map(async (key) => {
      const obj = await bucket.get(key)
      if (!obj) throw new Error(`Font not found in R2: ${key}`)
      return new Uint8Array(await obj.arrayBuffer())
    }),
  )

  fontDataCache = fontBuffers
  return fontBuffers
}

export async function svgToPng(
  svg: string,
  assets: Fetcher,
  bucket: R2Bucket,
): Promise<Uint8Array> {
  await ensureWasmInitialized(assets)
  const fonts = await loadFonts(bucket)

  const resvg = new Resvg(svg, {
    font: {
      fontBuffers: fonts,
      defaultFontFamily: 'Klee One',
    },
  })

  const rendered = resvg.render()
  return rendered.asPng()
}
