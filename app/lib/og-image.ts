import type { Fetcher, R2Bucket } from '@cloudflare/workers-types/latest'
import { initWasm, Resvg } from '@resvg/resvg-wasm'

let wasmInitPromise: Promise<void> | null = null
let fontLoadPromise: Promise<Uint8Array[]> | null = null

const FONT_R2_KEYS = ['fonts/klee-one-400.ttf', 'fonts/klee-one-600.ttf']

function ensureWasmInitialized(assets: Fetcher): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      const wasmResponse = await assets.fetch(
        'https://dummy/static/resvg_bg.wasm',
      )
      const wasmBuffer = await wasmResponse.arrayBuffer()
      await initWasm(wasmBuffer)
    })()
  }
  return wasmInitPromise
}

function loadFonts(bucket: R2Bucket): Promise<Uint8Array[]> {
  if (!fontLoadPromise) {
    fontLoadPromise = Promise.all(
      FONT_R2_KEYS.map(async (key) => {
        const obj = await bucket.get(key)
        if (!obj) throw new Error(`Font not found in R2: ${key}`)
        return new Uint8Array(await obj.arrayBuffer())
      }),
    )
  }
  return fontLoadPromise
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
