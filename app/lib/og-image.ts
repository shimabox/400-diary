import type { Fetcher } from '@cloudflare/workers-types/latest'
import { initWasm, Resvg } from '@resvg/resvg-wasm'

let wasmInitialized = false
let fontDataCache: Uint8Array[] | null = null

async function ensureWasmInitialized(assets: Fetcher): Promise<void> {
  if (wasmInitialized) return
  const wasmResponse = await assets.fetch('https://dummy/static/resvg_bg.wasm')
  const wasmBuffer = await wasmResponse.arrayBuffer()
  await initWasm(wasmBuffer)
  wasmInitialized = true
}

async function loadFonts(): Promise<Uint8Array[]> {
  if (fontDataCache) return fontDataCache

  // Google Fonts CSS を取得（TTF形式を返すUAを指定）
  const cssRes = await fetch(
    'https://fonts.googleapis.com/css2?family=Klee+One:wght@400;600',
    {
      headers: {
        // TTF形式を返すようにレガシーUAを使用
        'User-Agent':
          'Mozilla/5.0 (Linux; U; Android 2.2; en-us) AppleWebKit/530.17',
      },
    },
  )
  const css = await cssRes.text()

  // CSS内のフォントURLを抽出
  const fontUrls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1])

  // フォントファイルを並列で取得
  const fontBuffers = await Promise.all(
    fontUrls.map(async (url) => {
      const res = await fetch(url)
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
  const fonts = await loadFonts()

  const resvg = new Resvg(svg, {
    font: {
      fontBuffers: fonts,
      defaultFontFamily: 'Klee One',
    },
  })

  const rendered = resvg.render()
  return rendered.asPng()
}
