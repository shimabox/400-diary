import { beforeEach, describe, expect, test, vi } from 'vitest'

const mockPngData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

vi.mock('@resvg/resvg-wasm', () => ({
  initWasm: vi.fn(() => Promise.resolve()),
  // biome-ignore lint/complexity/useArrowFunction: vi.fn()でnewを使うにはfunction式が必要
  Resvg: vi.fn(function () {
    return {
      render: () => ({ asPng: () => mockPngData }),
    }
  }),
}))

vi.mock('@resvg/resvg-wasm/index_bg.wasm', () => ({
  default: 'mock-wasm-module',
}))

vi.mock('resvg-wasm-module', () => ({
  default: 'mock-wasm-module',
}))

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
    const bucket = createMockBucket()

    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><text>test</text></svg>'
    const result = await svgToPng(svg, bucket as never)

    expect(result).toBeInstanceOf(Uint8Array)
    expect(result).toEqual(mockPngData)
  })

  test('initWasmが呼ばれる', async () => {
    const { svgToPng } = await import('./og-image')
    const { initWasm } = await import('@resvg/resvg-wasm')
    const bucket = createMockBucket()

    await svgToPng('<svg></svg>', bucket as never)

    expect(initWasm).toHaveBeenCalledOnce()
  })

  test('R2からフォントファイルを読み込む', async () => {
    const { svgToPng } = await import('./og-image')
    const bucket = createMockBucket()

    await svgToPng('<svg></svg>', bucket as never)

    expect(bucket.get).toHaveBeenCalledWith('fonts/klee-one-400.ttf')
    expect(bucket.get).toHaveBeenCalledWith('fonts/klee-one-600.ttf')
  })

  test('R2にフォントが存在しない場合エラーを投げる', async () => {
    const { svgToPng } = await import('./og-image')
    const bucket = {
      get: vi.fn(() => Promise.resolve(null)),
    }

    await expect(svgToPng('<svg></svg>', bucket as never)).rejects.toThrow(
      'Font not found in R2',
    )
  })

  test('ResvgにfontBuffersとdefaultFontFamilyを渡す', async () => {
    const { svgToPng } = await import('./og-image')
    const { Resvg } = await import('@resvg/resvg-wasm')
    const bucket = createMockBucket()

    await svgToPng('<svg></svg>', bucket as never)

    expect(Resvg).toHaveBeenCalledWith('<svg></svg>', {
      font: {
        fontBuffers: [expect.any(Uint8Array), expect.any(Uint8Array)],
        defaultFontFamily: 'Klee One',
      },
    })
  })

  test('WASMとフォントの初期化は2回目以降キャッシュされる', async () => {
    const { svgToPng } = await import('./og-image')
    const { initWasm } = await import('@resvg/resvg-wasm')
    const bucket = createMockBucket()

    await svgToPng('<svg>1</svg>', bucket as never)
    await svgToPng('<svg>2</svg>', bucket as never)

    // WASM初期化は1回だけ
    expect(initWasm).toHaveBeenCalledTimes(1)
    // R2フォント取得は1回ずつ = 2回だけ
    expect(bucket.get).toHaveBeenCalledTimes(2)
  })

  test('WASM初期化失敗後にリトライできる', async () => {
    const { initWasm } = await import('@resvg/resvg-wasm')
    vi.mocked(initWasm).mockRejectedValueOnce(new Error('wasm init failed'))

    const { svgToPng } = await import('./og-image')
    const bucket = createMockBucket()

    await expect(svgToPng('<svg></svg>', bucket as never)).rejects.toThrow(
      'wasm init failed',
    )

    // リトライ: initWasmは次回成功する（デフォルトのvi.fn()に戻る）
    const result = await svgToPng('<svg></svg>', bucket as never)
    expect(result).toEqual(mockPngData)
  })

  test('フォント読み込み失敗後にリトライできる', async () => {
    const { svgToPng } = await import('./og-image')

    const failingBucket = {
      get: vi.fn(() => Promise.resolve(null)),
    }

    await expect(
      svgToPng('<svg></svg>', failingBucket as never),
    ).rejects.toThrow('Font not found in R2')

    // リトライ: 正常なbucketを渡す
    const workingBucket = createMockBucket()
    const result = await svgToPng('<svg></svg>', workingBucket as never)

    expect(result).toEqual(mockPngData)
    expect(workingBucket.get).toHaveBeenCalledTimes(2)
  })
})
