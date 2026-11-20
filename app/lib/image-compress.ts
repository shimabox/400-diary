import {
  IMAGE_COMPRESS_MAX_EDGE,
  IMAGE_COMPRESS_QUALITY,
  MAX_IMAGE_SIZE,
} from './constants'
import type { ImageSize } from './image-layout'

/**
 * アップロード前に、ブラウザで画像を縮小・再エンコードする。
 *
 * サーバー（Workers）には画像を加工する標準の仕組みがないため、ブラウザで行う。
 * 判断の部分は純粋関数にしてユニットテストできるようにし、ブラウザの API を
 * 呼ぶ部分は compressImageForUpload にまとめる。ブラウザの API は関数の実行時に
 * だけ参照するので、SSR でこのモジュールが読み込まれても例外にならない。
 */

export type ResizedSize = {
  width: number
  height: number
  /** 縮小したかどうか。長辺が上限以下なら false で、幅・高さは元のまま */
  resized: boolean
}

/**
 * 長辺が maxEdge を超えるときだけ、縦横比を保って長辺を maxEdge に縮めた
 * 幅・高さを返す。拡大はしない。幅・高さは整数に丸め、1px 未満にしない。
 */
export function computeResizedSize(
  width: number,
  height: number,
  maxEdge: number,
): ResizedSize {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxEdge) {
    return { width, height, resized: false }
  }
  const scale = maxEdge / longEdge
  // 長辺は浮動小数点の誤差で 1999.999… などにならないよう、上限の値をそのまま使う
  return {
    width: width >= height ? maxEdge : Math.max(1, Math.round(width * scale)),
    height: height >= width ? maxEdge : Math.max(1, Math.round(height * scale)),
    resized: true,
  }
}

export type CompressOutputType = 'image/jpeg' | 'image/webp'

/**
 * 入力の MIME から再エンコードの出力形式を選ぶ。圧縮しない形式は null。
 *
 * - JPEG は JPEG のまま（写真の形式を変えない）
 * - PNG と WebP は透過を残せる WebP にする。ブラウザが WebP で書き出せない
 *   ときは、書き出しの段階で PNG に切り替える
 * - GIF はアニメーションのことが多く、再エンコードすると 1 コマ目だけになるので
 *   判定せずに圧縮しない
 */
export function chooseOutputType(inputType: string): CompressOutputType | null {
  switch (inputType) {
    case 'image/jpeg':
      return 'image/jpeg'
    case 'image/png':
    case 'image/webp':
      return 'image/webp'
    default:
      return null
  }
}

/**
 * アニメーション画像かどうかの判定結果。
 * - animated: アニメーション
 * - static: アニメーションではない
 * - unknown: バイト列が壊れている・途中で切れているなどで判定できない
 */
export type AnimationCheck = 'animated' | 'static' | 'unknown'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  if (bytes.length < offset + signature.length) return false
  return signature.every((byte, i) => bytes[offset + i] === byte)
}

function readFourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  )
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  )
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  )
}

/**
 * APNG かを判定する。チャンクを先頭から順にたどり、最初の IDAT より前に acTL が
 * あれば APNG。IDAT に先に着けば静止画。チャンクの長さが壊れている・途中で
 * 切れている・どちらにも着かずに終わるときは判定できない。
 */
function detectPngAnimation(bytes: Uint8Array): AnimationCheck {
  if (!startsWith(bytes, PNG_SIGNATURE)) return 'unknown'
  let offset = PNG_SIGNATURE.length
  // チャンク = 長さ(4) + 種類(4) + データ(長さ) + CRC(4)
  while (offset + 8 <= bytes.length) {
    const length = readUint32BE(bytes, offset)
    // PNG の仕様でチャンクの長さは 2^31 - 1 まで
    if (length > 0x7fffffff) return 'unknown'
    const type = readFourCC(bytes, offset + 4)
    const next = offset + 12 + length
    // 種類だけ読めてもチャンクが途中で切れていれば、壊れたファイルとして扱う
    if (next > bytes.length) return 'unknown'
    if (type === 'acTL') return 'animated'
    if (type === 'IDAT') return 'static'
    offset = next
  }
  return 'unknown'
}

/**
 * アニメーション WebP かを判定する。RIFF の最初のチャンクが VP8X なら、その
 * フラグのアニメーションのビット (0x02) で決める。最初のチャンクが VP8 / VP8L
 * なら単純な形式で、アニメーションを持てない。
 */
function detectWebpAnimation(bytes: Uint8Array): AnimationCheck {
  // 'RIFF' + ファイルサイズ(4) + 'WEBP' のあとに最初のチャンクが続く
  if (bytes.length < 20) return 'unknown'
  if (readFourCC(bytes, 0) !== 'RIFF' || readFourCC(bytes, 8) !== 'WEBP') {
    return 'unknown'
  }
  const chunkType = readFourCC(bytes, 12)
  const chunkSize = readUint32LE(bytes, 16)
  if (20 + chunkSize > bytes.length) return 'unknown'
  switch (chunkType) {
    case 'VP8X':
      // VP8X のデータはフラグ(1) + 予約(3) + 幅(3) + 高さ(3) の 10 バイト
      if (chunkSize < 10) return 'unknown'
      return (bytes[20] & 0x02) !== 0 ? 'animated' : 'static'
    case 'VP8 ':
    case 'VP8L':
      return 'static'
    default:
      return 'unknown'
  }
}

/**
 * ファイル全体のバイト列から、アニメーション画像かを判定する。
 *
 * 再エンコードすると最初の 1 コマだけになり動かなくなるので、animated と
 * unknown のときは圧縮しない。unknown も圧縮しないのは、アニメーション画像は
 * ブラウザで静止画として問題なく読み込めてしまい、圧縮の失敗では守れないため。
 *
 * 判定の対象は PNG と WebP。JPEG にはアニメーションがないので、PNG / WebP 以外の
 * MIME は static を返す（GIF はこの関数を通さず、常に圧縮しない）。
 * 壊れた・途中で切れたバイト列でも例外を出さず unknown を返す。
 */
export function detectAnimation(
  bytes: Uint8Array,
  mime: string,
): AnimationCheck {
  switch (mime) {
    case 'image/png':
      return detectPngAnimation(bytes)
    case 'image/webp':
      return detectWebpAnimation(bytes)
    default:
      return 'static'
  }
}

export type UploadSourceInput = {
  /** 長辺の上限に合わせて縮小したか */
  resized: boolean
  compressedSize: number
  originalSize: number
  /** アップロードできる上限のバイト数 */
  maxSize: number
}

/**
 * 圧縮後と元のファイルのどちらを送るかを決める。
 *
 * - 圧縮後が上限を超えるときは、縮小したかに関係なく元を送る。元は選んだ時点の
 *   確認で上限以下と分かっているので、圧縮したせいで断られることがなくなる
 * - 縮小したときは、上限以下なら元より大きくても圧縮後を送る（解像度を抑えるため）
 * - 縮小していないときは、圧縮後のほうが小さいときだけ圧縮後を送る
 */
export function chooseUploadSource({
  resized,
  compressedSize,
  originalSize,
  maxSize,
}: UploadSourceInput): 'compressed' | 'original' {
  if (compressedSize > maxSize) return 'original'
  if (resized) return 'compressed'
  return compressedSize < originalSize ? 'compressed' : 'original'
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * ファイル名の拡張子を、書き出した形式に合わせて付け替える。
 * 拡張子がなければ付け足し、名前が空なら image にする。
 */
export function renameForType(name: string, type: string): string {
  const ext = EXTENSION_BY_TYPE[type]
  if (!ext) return name
  const base = name.replace(/\.[^./\\]*$/, '') || 'image'
  return `${base}.${ext}`
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * canvas を指定の形式で書き出す。WebP で書き出せないブラウザ（結果の MIME が
 * image/webp にならない）では PNG で書き出す。期待した形式にならなければ
 * 例外にする。MIME と中身を一致させないと、サーバーの検証で断られるため。
 */
async function encodeCanvas(
  canvas: HTMLCanvasElement,
  type: CompressOutputType,
): Promise<Blob> {
  const blob = await canvasToBlob(canvas, type, IMAGE_COMPRESS_QUALITY)
  if (blob && blob.type === type) return blob
  if (type === 'image/webp') {
    // 対応していない形式を指定すると PNG で書き出す仕様なので、すでに PNG ならそれを使う
    if (blob && blob.type === 'image/png') return blob
    const png = await canvasToBlob(canvas, 'image/png')
    if (png && png.type === 'image/png') return png
  }
  throw new Error(`could not encode canvas as ${type}`)
}

/**
 * 画像のアップロード（POST /api/diaries/:id/image）の本文を作る。寸法は
 * 測れたときだけ width と height を組で足す。サーバーは片方だけの寸法を
 * 捨てるので、片方だけを送ることはしない
 */
export function buildImageUploadForm(
  file: File,
  size: ImageSize | null,
): FormData {
  const form = new FormData()
  form.append('file', file)
  if (size) {
    form.append('width', String(size.width))
    form.append('height', String(size.height))
  }
  return form
}

export type CompressResult = {
  /** アップロードするファイル（圧縮後、または元のまま） */
  file: File
  /**
   * file をブラウザが表示するときの幅と高さ（EXIF の向きを反映した値で、
   * <img> の naturalWidth / naturalHeight と一致する）。測れなかったときは null
   */
  size: ImageSize | null
}

/**
 * 寸法を知るためだけに画像をデコードする。圧縮しない画像（GIF、アニメーション、
 * 判定できなかったもの）に使い、送るファイルの選択には関わらない。
 * <img> と同じく EXIF の向きを反映した寸法にする。失敗したら null
 */
async function measureImage(file: File): Promise<ImageSize | null> {
  if (typeof createImageBitmap !== 'function') return null
  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { width: bitmap.width, height: bitmap.height }
  } catch {
    return null
  } finally {
    bitmap?.close()
  }
}

/**
 * アップロードするファイルと、その表示寸法を返す。圧縮後のほうがよければ、
 * 書き出した形式に合った MIME と拡張子の File を、そうでなければ元の File を
 * そのまま返す。寸法は返すファイルのもの（圧縮後なら縮めた後の大きさ、元の
 * ままならデコードした元の画像の大きさ）。
 *
 * 形式・大きさの確認は呼び出し側で済ませておく。途中で何が失敗しても例外は
 * 外へ出さず元の File を返し、今までどおりアップロードできることを優先する。
 * 寸法が測れなくても（null でも）送るファイルの選び方は変えない。
 */
export async function compressImageForUpload(
  file: File,
): Promise<CompressResult> {
  const outputType = chooseOutputType(file.type)
  if (!outputType) return { file, size: await measureImage(file) }

  let bitmap: ImageBitmap | undefined
  let canvas: HTMLCanvasElement | undefined
  // デコードできた元の画像の寸法。元のファイルを送るときにこの値を返す
  let originalSize: ImageSize | null = null
  try {
    if (file.type === 'image/png' || file.type === 'image/webp') {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (detectAnimation(bytes, file.type) !== 'static') {
        return { file, size: await measureImage(file) }
      }
    }

    if (typeof createImageBitmap !== 'function') return { file, size: null }
    // EXIF の向きを反映して描く。'from-image' を知らない古いブラウザでは、
    // 列挙値の変換で例外になり、元のファイルを送る側に倒れる
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    originalSize = { width: bitmap.width, height: bitmap.height }

    const size = computeResizedSize(
      bitmap.width,
      bitmap.height,
      IMAGE_COMPRESS_MAX_EDGE,
    )
    canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return { file, size: originalSize }
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)

    const blob = await encodeCanvas(canvas, outputType)
    const source = chooseUploadSource({
      resized: size.resized,
      compressedSize: blob.size,
      originalSize: file.size,
      maxSize: MAX_IMAGE_SIZE,
    })
    if (source === 'original') return { file, size: originalSize }

    return {
      file: new File([blob], renameForType(file.name, blob.type), {
        type: blob.type,
        lastModified: file.lastModified,
      }),
      // 書き出した画像には EXIF の向きが無く、描いた canvas の大きさがそのまま表示寸法になる
      size: { width: size.width, height: size.height },
    }
  } catch {
    return { file, size: originalSize }
  } finally {
    bitmap?.close()
    // iOS Safari は canvas の合計メモリに上限があるので、使い終えたらすぐ手放す
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
  }
}
