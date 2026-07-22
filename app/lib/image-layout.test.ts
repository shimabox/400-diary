import { describe, expect, test } from 'vitest'
import { computeImageFrame } from './image-layout'

// エディタ・公開ページの実寸 (minWidth 880 / containerHeight 416)
const CONTAINER = { width: 880, height: 416 }

describe('computeImageFrame', () => {
  test('大きい画像は倍率1.0で基準枠(幅30%/高さ256px)に収まる', () => {
    const { imageSize } = computeImageFrame(
      { width: 4032, height: 3024 },
      CONTAINER,
      1,
      0,
    )

    // 幅30% (264px) が先に効く
    expect(imageSize.width).toBeCloseTo(264)
    expect(imageSize.height).toBeCloseTo(264 * (3024 / 4032))
  })

  test('縦長画像は高さ256pxが先に効く', () => {
    const { imageSize } = computeImageFrame(
      { width: 1000, height: 2000 },
      CONTAINER,
      1,
      0,
    )

    expect(imageSize.height).toBeCloseTo(256)
    expect(imageSize.width).toBeCloseTo(128)
  })

  test('基準枠より小さい画像は倍率1.0で自然サイズのまま', () => {
    const { imageSize } = computeImageFrame(
      { width: 200, height: 150 },
      CONTAINER,
      1,
      0,
    )

    expect(imageSize).toEqual({ width: 200, height: 150 })
  })

  test('基準枠より小さい画像にも倍率が正確に効く', () => {
    const { imageSize } = computeImageFrame(
      { width: 200, height: 150 },
      CONTAINER,
      1.5,
      0,
    )

    expect(imageSize).toEqual({ width: 300, height: 225 })
  })

  test('回転0度なら外接矩形は表示サイズと一致する', () => {
    const { imageSize, frameSize } = computeImageFrame(
      { width: 1000, height: 800 },
      CONTAINER,
      1,
      0,
    )

    expect(frameSize).toEqual(imageSize)
  })

  test('回転すると外接矩形が w|cosθ|+h|sinθ| で広がる', () => {
    const { imageSize, frameSize } = computeImageFrame(
      { width: 200, height: 100 },
      CONTAINER,
      1,
      15,
    )

    const cos = Math.cos((15 * Math.PI) / 180)
    const sin = Math.sin((15 * Math.PI) / 180)
    expect(frameSize.width).toBeCloseTo(
      imageSize.width * cos + imageSize.height * sin,
    )
    expect(frameSize.height).toBeCloseTo(
      imageSize.width * sin + imageSize.height * cos,
    )
  })

  test('負の回転角でも外接矩形は正の回転角と同じ', () => {
    const natural = { width: 200, height: 100 }
    const plus = computeImageFrame(natural, CONTAINER, 1, 15)
    const minus = computeImageFrame(natural, CONTAINER, 1, -15)

    expect(minus.frameSize.width).toBeCloseTo(plus.frameSize.width)
    expect(minus.frameSize.height).toBeCloseTo(plus.frameSize.height)
  })

  test('境界: 最大倍率1.5×最大回転15度の正方形画像でも外接矩形がコンテナ高に収まる', () => {
    // 素の計算では 256*1.5=384px 四方 → 外接矩形 約470px がコンテナ高416pxを超えるケース
    const { imageSize, frameSize } = computeImageFrame(
      { width: 2000, height: 2000 },
      CONTAINER,
      1.5,
      15,
    )

    expect(frameSize.height).toBeCloseTo(CONTAINER.height)
    expect(frameSize.width).toBeLessThanOrEqual(CONTAINER.width)
    // 補正はアスペクト比を保つ(表示サイズも同率で縮む)
    expect(imageSize.width).toBeCloseTo(imageSize.height)
    expect(imageSize.width).toBeLessThan(384)
  })

  test('コンテナに収まる組み合わせでは補正が掛からない', () => {
    const raw = computeImageFrame(
      { width: 2000, height: 2000 },
      CONTAINER,
      1,
      15,
    )

    // 256px四方 × 15度回転 → 外接矩形 約313px は 416px に収まるので素の値のまま
    expect(raw.imageSize.width).toBeCloseTo(256)
    const expected =
      256 * (Math.cos((15 * Math.PI) / 180) + Math.sin((15 * Math.PI) / 180))
    expect(raw.frameSize.height).toBeCloseTo(expected)
  })
})
