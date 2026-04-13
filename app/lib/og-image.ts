import type { Fetcher, R2Bucket } from '@cloudflare/workers-types/latest'
import { initWasm, Resvg } from '@resvg/resvg-wasm'

let wasmInitPromise: Promise<void> | null = null
let fontLoadPromise: Promise<Uint8Array[]> | null = null

const FONT_R2_KEYS = ['fonts/klee-one-400.ttf', 'fonts/klee-one-600.ttf']

function ensureWasmInitialized(assets?: Fetcher): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      if (assets) {
        // 本番: Response を直接渡して instantiateStreaming を利用する
        const res = await assets.fetch('https://dummy/static/resvg_bg.wasm')
        await initWasm(res as unknown as Response)
      } else {
        // ローカル dev 環境: fs で読み込み WebAssembly.Module にコンパイル
        // @ts-expect-error -- Node.js API (nodejs_compat) は型定義なしで使用
        const { readFile } = await import('node:fs/promises')
        // @ts-expect-error -- Node.js API (nodejs_compat) は型定義なしで使用
        const { resolve } = await import('node:path')
        const buf: Uint8Array = await readFile(
          resolve('public/static/resvg_bg.wasm'),
        )
        const wasmModule = await WebAssembly.compile(new Uint8Array(buf))
        await initWasm(wasmModule)
      }
    })().catch((e) => {
      wasmInitPromise = null
      throw e
    })
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
    ).catch((e) => {
      fontLoadPromise = null
      throw e
    })
  }
  return fontLoadPromise
}

export async function svgToPng(
  svg: string,
  assets: Fetcher | undefined,
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
