import { beforeEach, describe, expect, test, vi } from 'vitest'

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
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
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

  test('ASSETSからフォントファイルを読み込む', async () => {
    const { svgToPng } = await import('./og-image')
    const assets = createMockAssets()

    await svgToPng('<svg></svg>', assets as never)

    expect(assets.fetch).toHaveBeenCalledWith(
      'https://dummy/static/klee-one-400-ogp-subset.ttf',
    )
    expect(assets.fetch).toHaveBeenCalledWith(
      'https://dummy/static/klee-one-600-ogp-subset.ttf',
    )
  })

  test('ResvgにfontBuffersとdefaultFontFamilyを渡す', async () => {
    const { svgToPng } = await import('./og-image')
    const { Resvg } = await import('@resvg/resvg-wasm')
    const assets = createMockAssets()

    await svgToPng('<svg></svg>', assets as never)

    expect(Resvg).toHaveBeenCalledWith('<svg></svg>', {
      font: {
        fontBuffers: [expect.any(Uint8Array), expect.any(Uint8Array)],
        defaultFontFamily: 'Klee One',
      },
    })
  })

  test('WASMとフォントの初期化は2回目以降キャッシュされる', async () => {
    const { svgToPng } = await import('./og-image')
    const assets = createMockAssets()

    await svgToPng('<svg>1</svg>', assets as never)
    await svgToPng('<svg>2</svg>', assets as never)

    // WASM(1回) + フォント(2回) = 初回3回、2回目は0回
    expect(assets.fetch).toHaveBeenCalledTimes(3)
  })
})
