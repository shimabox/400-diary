import { describe, expect, test } from 'vitest'
import { IMAGE_COMPRESS_MAX_EDGE, MAX_IMAGE_SIZE } from './constants'
import {
  chooseOutputType,
  chooseUploadSource,
  computeResizedSize,
  detectAnimation,
  renameForType,
} from './image-compress'

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0))

const u32be = (n: number) => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
]

const u32le = (n: number) => [
  n & 0xff,
  (n >>> 8) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 24) & 0xff,
]

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** PNG のチャンク（長さ + 種類 + データ + CRC）。判定は CRC を見ないので 0 で埋める */
function pngChunk(type: string, data: number[] = []): number[] {
  return [...u32be(data.length), ...ascii(type), ...data, 0, 0, 0, 0]
}

function png(...chunks: number[][]): Uint8Array {
  return new Uint8Array([...PNG_SIGNATURE, ...chunks.flat()])
}

const IHDR = pngChunk('IHDR', new Array(13).fill(0))
const IDAT = pngChunk('IDAT', [1, 2, 3])
const IEND = pngChunk('IEND')
const acTL = pngChunk('acTL', [...u32be(2), ...u32be(0)])

function webp(chunkType: string, data: number[]): Uint8Array {
  const chunk = [...ascii(chunkType), ...u32le(data.length), ...data]
  return new Uint8Array([
    ...ascii('RIFF'),
    ...u32le(4 + chunk.length),
    ...ascii('WEBP'),
    ...chunk,
  ])
}

/** VP8X のデータ: フラグ(1) + 予約(3) + 幅-1(3) + 高さ-1(3) */
const vp8xData = (flags: number) => [flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]

describe('computeResizedSize', () => {
  test('長辺が上限以下なら縮小せず、拡大もしない', () => {
    expect(computeResizedSize(800, 600, 2000)).toEqual({
      width: 800,
      height: 600,
      resized: false,
    })
  })

  test('長辺がちょうど上限なら縮小しない', () => {
    expect(computeResizedSize(2000, 1500, 2000)).toEqual({
      width: 2000,
      height: 1500,
      resized: false,
    })
  })

  test('横長は幅を上限に合わせ、縦横比を保つ', () => {
    expect(computeResizedSize(4032, 3024, 2000)).toEqual({
      width: 2000,
      height: 1500,
      resized: true,
    })
  })

  test('縦長は高さを上限に合わせ、縦横比を保つ', () => {
    expect(computeResizedSize(3024, 4032, 2000)).toEqual({
      width: 1500,
      height: 2000,
      resized: true,
    })
  })

  test('正方形は両辺を上限に合わせる', () => {
    expect(computeResizedSize(3000, 3000, 2000)).toEqual({
      width: 2000,
      height: 2000,
      resized: true,
    })
  })

  test('短辺は整数に丸め、縦横比のずれは丸めの 1px 以内に収まる', () => {
    const { width, height } = computeResizedSize(4001, 3001, 2000)
    expect(width).toBe(2000)
    expect(Number.isInteger(height)).toBe(true)
    expect(Math.abs(height - (3001 * 2000) / 4001)).toBeLessThanOrEqual(1)
  })

  test('極端に細長くても短辺は 1px 未満にならない', () => {
    expect(computeResizedSize(10000, 1, 2000)).toEqual({
      width: 2000,
      height: 1,
      resized: true,
    })
    expect(computeResizedSize(1, 10000, 2000)).toEqual({
      width: 1,
      height: 2000,
      resized: true,
    })
  })

  test('既定の上限は 2000px', () => {
    expect(IMAGE_COMPRESS_MAX_EDGE).toBe(2000)
  })
})

describe('chooseOutputType', () => {
  test('JPEG は JPEG のまま', () => {
    expect(chooseOutputType('image/jpeg')).toBe('image/jpeg')
  })

  test('PNG と WebP は WebP', () => {
    expect(chooseOutputType('image/png')).toBe('image/webp')
    expect(chooseOutputType('image/webp')).toBe('image/webp')
  })

  test('GIF とそのほかの形式は圧縮しない', () => {
    expect(chooseOutputType('image/gif')).toBeNull()
    expect(chooseOutputType('image/svg+xml')).toBeNull()
    expect(chooseOutputType('')).toBeNull()
  })
})

describe('detectAnimation (PNG)', () => {
  test('acTL より先に IDAT がある PNG は静止画', () => {
    expect(detectAnimation(png(IHDR, IDAT, IEND), 'image/png')).toBe('static')
  })

  test('IDAT より前に acTL がある PNG は APNG', () => {
    expect(detectAnimation(png(IHDR, acTL, IDAT, IEND), 'image/png')).toBe(
      'animated',
    )
  })

  test('acTL の前に iCCP や tEXt が並んでいても APNG と判定する', () => {
    const iCCP = pngChunk('iCCP', ascii('icc\0\0profile-bytes'))
    const tEXt = pngChunk('tEXt', ascii('Comment\0hello'))
    expect(
      detectAnimation(png(IHDR, iCCP, tEXt, acTL, IDAT, IEND), 'image/png'),
    ).toBe('animated')
  })

  test('IDAT のあとの acTL は見ない（IDAT に先に着いたら静止画）', () => {
    expect(detectAnimation(png(IHDR, IDAT, acTL, IEND), 'image/png')).toBe(
      'static',
    )
  })

  test('途中で切れた PNG は判定できない', () => {
    const whole = png(IHDR, acTL, IDAT, IEND)
    // IHDR の途中で切れる
    expect(detectAnimation(whole.slice(0, 20), 'image/png')).toBe('unknown')
    // 署名だけ
    expect(detectAnimation(whole.slice(0, 8), 'image/png')).toBe('unknown')
    // acTL の種類までは読めるが、データが途中で切れる
    const acTLStart = 8 + IHDR.length
    expect(detectAnimation(whole.slice(0, acTLStart + 10), 'image/png')).toBe(
      'unknown',
    )
    // IDAT の種類までは読めるが、データが途中で切れる
    const staticPng = png(IHDR, IDAT, IEND)
    const idatStart = 8 + IHDR.length
    expect(
      detectAnimation(staticPng.slice(0, idatStart + 9), 'image/png'),
    ).toBe('unknown')
  })

  test('IDAT にも acTL にも着かずに終わる PNG は判定できない', () => {
    expect(detectAnimation(png(IHDR, IEND), 'image/png')).toBe('unknown')
  })

  test('チャンクの長さが壊れている PNG は判定できない', () => {
    const broken = png(IHDR, IDAT, IEND)
    // IHDR の長さを 0xffffffff にする
    broken.set([0xff, 0xff, 0xff, 0xff], 8)
    expect(detectAnimation(broken, 'image/png')).toBe('unknown')

    const tooLong = png(IHDR, IDAT, IEND)
    tooLong.set(u32be(1000), 8)
    expect(detectAnimation(tooLong, 'image/png')).toBe('unknown')
  })

  test('PNG の署名がないバイト列は判定できない', () => {
    expect(detectAnimation(new Uint8Array([1, 2, 3, 4]), 'image/png')).toBe(
      'unknown',
    )
    expect(detectAnimation(new Uint8Array(), 'image/png')).toBe('unknown')
  })
})

describe('detectAnimation (WebP)', () => {
  test('VP8X のアニメーションのビットが立っていればアニメーション', () => {
    expect(detectAnimation(webp('VP8X', vp8xData(0x02)), 'image/webp')).toBe(
      'animated',
    )
    // 透過 (0x10) など、ほかのビットと一緒に立っていても同じ
    expect(detectAnimation(webp('VP8X', vp8xData(0x12)), 'image/webp')).toBe(
      'animated',
    )
  })

  test('VP8X のアニメーションのビットが立っていなければ静止画', () => {
    expect(detectAnimation(webp('VP8X', vp8xData(0x10)), 'image/webp')).toBe(
      'static',
    )
    expect(detectAnimation(webp('VP8X', vp8xData(0)), 'image/webp')).toBe(
      'static',
    )
  })

  test('最初のチャンクが VP8 / VP8L の単純な形式は静止画', () => {
    expect(detectAnimation(webp('VP8 ', [0, 0, 0, 0]), 'image/webp')).toBe(
      'static',
    )
    expect(detectAnimation(webp('VP8L', [0, 0, 0, 0]), 'image/webp')).toBe(
      'static',
    )
  })

  test('途中で切れた WebP は判定できない', () => {
    const whole = webp('VP8X', vp8xData(0x02))
    expect(detectAnimation(whole.slice(0, 12), 'image/webp')).toBe('unknown')
    expect(detectAnimation(whole.slice(0, 21), 'image/webp')).toBe('unknown')
  })

  test('VP8X のデータが短すぎる WebP は判定できない', () => {
    expect(detectAnimation(webp('VP8X', [0x02]), 'image/webp')).toBe('unknown')
  })

  test('RIFF / WEBP の署名がない、または最初のチャンクが未知なら判定できない', () => {
    const notRiff = webp('VP8X', vp8xData(0))
    notRiff.set(ascii('RIFX'), 0)
    expect(detectAnimation(notRiff, 'image/webp')).toBe('unknown')

    const notWebp = webp('VP8X', vp8xData(0))
    notWebp.set(ascii('WAVE'), 8)
    expect(detectAnimation(notWebp, 'image/webp')).toBe('unknown')

    expect(detectAnimation(webp('ANIM', [0, 0, 0, 0]), 'image/webp')).toBe(
      'unknown',
    )
  })
})

describe('detectAnimation (そのほかの形式)', () => {
  test('JPEG はバイト列に関係なくアニメーションではない', () => {
    expect(
      detectAnimation(new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg'),
    ).toBe('static')
    expect(detectAnimation(new Uint8Array(), 'image/jpeg')).toBe('static')
  })
})

describe('chooseUploadSource', () => {
  const maxSize = MAX_IMAGE_SIZE

  test('縮小したときは、元より大きくても上限以下なら圧縮後を送る', () => {
    expect(
      chooseUploadSource({
        resized: true,
        compressedSize: 3_000_000,
        originalSize: 2_000_000,
        maxSize,
      }),
    ).toBe('compressed')
  })

  test('縮小したときも、圧縮後が上限を超えるなら元を送る', () => {
    expect(
      chooseUploadSource({
        resized: true,
        compressedSize: maxSize + 1,
        originalSize: 9_000_000,
        maxSize,
      }),
    ).toBe('original')
  })

  test('圧縮後がちょうど上限なら送れる', () => {
    expect(
      chooseUploadSource({
        resized: true,
        compressedSize: maxSize,
        originalSize: 9_000_000,
        maxSize,
      }),
    ).toBe('compressed')
  })

  test('縮小していないときは、圧縮後のほうが小さければ圧縮後を送る', () => {
    expect(
      chooseUploadSource({
        resized: false,
        compressedSize: 500_000,
        originalSize: 1_000_000,
        maxSize,
      }),
    ).toBe('compressed')
  })

  test('縮小していないときは、圧縮後が元以上なら元を送る', () => {
    expect(
      chooseUploadSource({
        resized: false,
        compressedSize: 1_000_000,
        originalSize: 1_000_000,
        maxSize,
      }),
    ).toBe('original')
    expect(
      chooseUploadSource({
        resized: false,
        compressedSize: 1_200_000,
        originalSize: 1_000_000,
        maxSize,
      }),
    ).toBe('original')
  })

  test('縮小していなくても、圧縮後が上限を超えるなら元を送る', () => {
    expect(
      chooseUploadSource({
        resized: false,
        compressedSize: maxSize + 1,
        originalSize: maxSize + 2,
        maxSize,
      }),
    ).toBe('original')
  })
})

describe('renameForType', () => {
  test('拡張子を書き出した形式に付け替える', () => {
    expect(renameForType('IMG_0001.HEIC.png', 'image/webp')).toBe(
      'IMG_0001.HEIC.webp',
    )
    expect(renameForType('photo.jpeg', 'image/jpeg')).toBe('photo.jpg')
    expect(renameForType('shot.webp', 'image/png')).toBe('shot.png')
  })

  test('拡張子がなければ付け足し、名前が空なら image にする', () => {
    expect(renameForType('photo', 'image/webp')).toBe('photo.webp')
    expect(renameForType('', 'image/jpeg')).toBe('image.jpg')
    expect(renameForType('.png', 'image/webp')).toBe('image.webp')
  })

  test('対応していない形式なら名前を変えない', () => {
    expect(renameForType('anim.gif', 'image/gif')).toBe('anim.gif')
  })
})
