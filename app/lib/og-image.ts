import type { R2Bucket } from '@cloudflare/workers-types/latest'
import { initWasm, Resvg } from '@resvg/resvg-wasm'
// @ts-expect-error -- ビルド時にwranglerがWebAssembly.Moduleとしてコンパイルする
import resvgWasm from 'resvg-wasm-module'

let wasmInitPromise: Promise<void> | null = null
let fontLoadPromise: Promise<Uint8Array[]> | null = null

const FONT_R2_KEYS = ['fonts/klee-one-400.ttf', 'fonts/klee-one-600.ttf']

function ensureWasmInitialized(): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = initWasm(resvgWasm).catch((e) => {
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

/** 個別日記 OGP の R2 キャッシュキー。公開・削除時の無効化と参照箇所で共有する。 */
export function ogCacheKey(diaryId: string): string {
  return `og/${diaryId}.png`
}

/**
 * 個別日記 OGP の R2 キャッシュを削除する。
 * 再公開時に呼ぶことで、スナップショット更新後の OGP 再生成を保証する。
 */
export async function deleteOgCache(
  bucket: R2Bucket,
  diaryId: string,
): Promise<void> {
  await bucket.delete(ogCacheKey(diaryId))
}

export async function svgToPng(
  svg: string,
  bucket: R2Bucket,
): Promise<Uint8Array> {
  await ensureWasmInitialized()
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
