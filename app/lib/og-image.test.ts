import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mockPngData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

vi.mock('@resvg/resvg-wasm', () => ({
  initWasm: vi.fn(),
  // biome-ignore lint/complexity/useArrowFunction: vi.fn()でnewを使うにはfunction式が必要
  Resvg: vi.fn(function () {
    return {
      render: () => ({ asPng: () => mockPngData }),
    }
  }),
}))

function createMockAssets() {
  return {
    fetch: vi.fn(() =>
      Promise.resolve({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      }),
    ),
  }
}

describe('svgToPng', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('fonts.googleapis.com')) {
        return Promise.resolve(
          new Response(
            '@font-face { src: url(https://fonts.gstatic.com/s/kleeone/v7/test.ttf); }',
          ),
        )
      }
      if (url.includes('fonts.gstatic.com')) {
        return Promise.resolve(new Response(new ArrayBuffer(500)))
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('SVGをPNG (Uint8Array) に変換する', async () => {
    const { svgToPng } = await import('./og-image')
    const assets = createMockAssets()

    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><text>test</text></svg>'
    const result = await svgToPng(svg, assets as never)

    expect(result).toBeInstanceOf(Uint8Array)
    expect(result).toEqual(mockPngData)
  })

  test('ASSETSバインディング経由でWASMバイナリを読み込む', async () => {
    const { svgToPng } = await import('./og-image')
    const assets = createMockAssets()

    await svgToPng('<svg></svg>', assets as never)

    expect(assets.fetch).toHaveBeenCalledWith(
      'https://dummy/static/resvg_bg.wasm',
    )
  })

  test('initWasmにWASMバイナリを渡して初期化する', async () => {
    const { svgToPng } = await import('./og-image')
    const { initWasm } = await import('@resvg/resvg-wasm')
    const assets = createMockAssets()

    await svgToPng('<svg></svg>', assets as never)

    expect(initWasm).toHaveBeenCalledOnce()
    expect(initWasm).toHaveBeenCalledWith(expect.any(ArrayBuffer))
  })

  test('Google FontsからKlee Oneフォントを取得する', async () => {
    const { svgToPng } = await import('./og-image')
    const assets = createMockAssets()

    await svgToPng('<svg></svg>', assets as never)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://fonts.googleapis.com/css2?family=Klee+One:wght@400;600',
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.any(String) }),
      }),
    )
  })

  test('CSS内のフォントURLからフォントファイルを取得する', async () => {
    const { svgToPng } = await import('./og-image')
    const assets = createMockAssets()

    await svgToPng('<svg></svg>', assets as never)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://fonts.gstatic.com/s/kleeone/v7/test.ttf',
    )
  })

  test('ResvgにfontBuffersとdefaultFontFamilyを渡す', async () => {
    const { svgToPng } = await import('./og-image')
    const { Resvg } = await import('@resvg/resvg-wasm')
    const assets = createMockAssets()

    await svgToPng('<svg></svg>', assets as never)

    expect(Resvg).toHaveBeenCalledWith('<svg></svg>', {
      font: {
        fontBuffers: [expect.any(Uint8Array)],
        defaultFontFamily: 'Klee One',
      },
    })
  })

  test('WASMとフォントの初期化は2回目以降キャッシュされる', async () => {
    const { svgToPng } = await import('./og-image')
    const assets = createMockAssets()

    await svgToPng('<svg>1</svg>', assets as never)
    await svgToPng('<svg>2</svg>', assets as never)

    // WASM初期化は1回だけ
    expect(assets.fetch).toHaveBeenCalledTimes(1)
    // Google Fonts CSS取得 + フォントファイル取得 = 2回だけ
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })
})
