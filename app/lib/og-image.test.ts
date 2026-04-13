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

function createMockBucket() {
  return {
    get: vi.fn(() =>
      Promise.resolve({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(500)),
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
    const bucket = createMockBucket()

    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><text>test</text></svg>'
    const result = await svgToPng(svg, assets as never, bucket as never)

    expect(result).toBeInstanceOf(Uint8Array)
    expect(result).toEqual(mockPngData)
  })

  test('ASSETSバインディング経由でWASMバイナリを読み込む', async () => {
    const { svgToPng } = await import('./og-image')
    const assets = createMockAssets()
    const bucket = createMockBucket()

    await svgToPng('<svg></svg>', assets as never, bucket as never)

    expect(assets.fetch).toHaveBeenCalledWith(
      'https://dummy/static/resvg_bg.wasm',
    )
  })

  test('initWasmにWASMバイナリを渡して初期化する', async () => {
    const { svgToPng } = await import('./og-image')
    const { initWasm } = await import('@resvg/resvg-wasm')
    const assets = createMockAssets()
    const bucket = createMockBucket()

    await svgToPng('<svg></svg>', assets as never, bucket as never)

    expect(initWasm).toHaveBeenCalledOnce()
  })

  test('R2からフォントファイルを読み込む', async () => {
    const { svgToPng } = await import('./og-image')
    const assets = createMockAssets()
    const bucket = createMockBucket()

    await svgToPng('<svg></svg>', assets as never, bucket as never)

    expect(bucket.get).toHaveBeenCalledWith('fonts/klee-one-400.ttf')
    expect(bucket.get).toHaveBeenCalledWith('fonts/klee-one-600.ttf')
  })

  test('R2にフォントが存在しない場合エラーを投げる', async () => {
    const { svgToPng } = await import('./og-image')
    const assets = createMockAssets()
    const bucket = {
      get: vi.fn(() => Promise.resolve(null)),
    }

    await expect(
      svgToPng('<svg></svg>', assets as never, bucket as never),
    ).rejects.toThrow('Font not found in R2')
  })

  test('ResvgにfontBuffersとdefaultFontFamilyを渡す', async () => {
    const { svgToPng } = await import('./og-image')
    const { Resvg } = await import('@resvg/resvg-wasm')
    const assets = createMockAssets()
    const bucket = createMockBucket()

    await svgToPng('<svg></svg>', assets as never, bucket as never)

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
    const bucket = createMockBucket()

    await svgToPng('<svg>1</svg>', assets as never, bucket as never)
    await svgToPng('<svg>2</svg>', assets as never, bucket as never)

    // WASM初期化は1回だけ
    expect(assets.fetch).toHaveBeenCalledTimes(1)
    // R2フォント取得は1回ずつ = 2回だけ
    expect(bucket.get).toHaveBeenCalledTimes(2)
  })

  test('WASM初期化失敗後に次のリクエストでリトライできる', async () => {
    const { svgToPng } = await import('./og-image')
    const bucket = createMockBucket()

    const failingAssets = {
      fetch: vi.fn(() => Promise.reject(new Error('network error'))),
    }

    await expect(
      svgToPng('<svg></svg>', failingAssets as never, bucket as never),
    ).rejects.toThrow('network error')

    // リトライ: 正常なassetsを渡す
    const workingAssets = createMockAssets()
    const result = await svgToPng(
      '<svg></svg>',
      workingAssets as never,
      bucket as never,
    )

    expect(result).toEqual(mockPngData)
    expect(workingAssets.fetch).toHaveBeenCalledTimes(1)
  })

  test('フォント読み込み失敗後に次のリクエストでリトライできる', async () => {
    const { svgToPng } = await import('./og-image')
    const assets = createMockAssets()

    const failingBucket = {
      get: vi.fn(() => Promise.resolve(null)),
    }

    await expect(
      svgToPng('<svg></svg>', assets as never, failingBucket as never),
    ).rejects.toThrow('Font not found in R2')

    // リトライ: 正常なbucketを渡す
    const workingBucket = createMockBucket()
    const result = await svgToPng(
      '<svg></svg>',
      assets as never,
      workingBucket as never,
    )

    expect(result).toEqual(mockPngData)
    expect(workingBucket.get).toHaveBeenCalledTimes(2)
  })
})
