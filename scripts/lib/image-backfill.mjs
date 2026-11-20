// 画像の一括パッチ（scripts/backfill-images.mjs）の判断を受け持つ純粋関数。
//
// 新しいアップロードの圧縮（app/lib/image-compress.ts）と同じ基準で、変換するか・
// どの大きさと形式に書き出すか・書き出した結果を採用するかを決める。スクリプトは
// node でそのまま動かすため TypeScript のモジュールは読み込めず、同じ規則をここに
// 書き直している。片方だけ変えると、scripts/lib/image-backfill.test.mjs の突き合わせの
// テストが落ちる。

/** 長辺の上限 (px)。app/lib/constants.ts の IMAGE_COMPRESS_MAX_EDGE と同じ値 */
export const IMAGE_COMPRESS_MAX_EDGE = 2000

/** 書き出しの品質 (0〜1)。app/lib/constants.ts の IMAGE_COMPRESS_QUALITY と同じ値 */
export const IMAGE_COMPRESS_QUALITY = 0.85

/** sharp に渡す品質 (1〜100)。IMAGE_COMPRESS_QUALITY を百分率にした値 */
export const SHARP_QUALITY = Math.round(IMAGE_COMPRESS_QUALITY * 100)

/** 保存できる画像の上限 (bytes)。app/lib/constants.ts の MAX_IMAGE_SIZE と同じ値 */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024

/** 保存する寸法の上限 (px)。app/lib/constants.ts の IMAGE_DIMENSION_MAX と同じ値 */
export const IMAGE_DIMENSION_MAX = 100000

/**
 * 長辺が maxEdge を超えるときだけ、縦横比を保って長辺を maxEdge に縮めた幅・高さを返す。
 * 拡大はしない。app/lib/image-compress.ts の computeResizedSize と同じ結果になる
 */
export function computeResizedSize(width, height, maxEdge) {
  const longEdge = Math.max(width, height)
  if (longEdge <= maxEdge) {
    return { width, height, resized: false }
  }
  const scale = maxEdge / longEdge
  return {
    width: width >= height ? maxEdge : Math.max(1, Math.round(width * scale)),
    height: height >= width ? maxEdge : Math.max(1, Math.round(height * scale)),
    resized: true,
  }
}

/**
 * 入力の MIME から書き出しの形式を選ぶ。圧縮しない形式（GIF など）は null。
 * app/lib/image-compress.ts の chooseOutputType と同じ結果になる。ブラウザは WebP で
 * 書き出せないときだけ PNG に切り替えるが、それは書き出しの都合なので、ここでは
 * 常にこの形式で書き出す
 */
export function chooseOutputType(inputType) {
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

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function startsWith(bytes, signature, offset = 0) {
  if (bytes.length < offset + signature.length) return false
  return signature.every((byte, i) => bytes[offset + i] === byte)
}

function readFourCC(bytes, offset) {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  )
}

function readUint32BE(bytes, offset) {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  )
}

function readUint32LE(bytes, offset) {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  )
}

/** 最初の IDAT より前に acTL があれば APNG。壊れている・途中で切れていれば unknown */
function detectPngAnimation(bytes) {
  if (!startsWith(bytes, PNG_SIGNATURE)) return 'unknown'
  let offset = PNG_SIGNATURE.length
  while (offset + 8 <= bytes.length) {
    const length = readUint32BE(bytes, offset)
    if (length > 0x7fffffff) return 'unknown'
    const type = readFourCC(bytes, offset + 4)
    const next = offset + 12 + length
    if (next > bytes.length) return 'unknown'
    if (type === 'acTL') return 'animated'
    if (type === 'IDAT') return 'static'
    offset = next
  }
  return 'unknown'
}

/** RIFF の最初のチャンクが VP8X なら、そのアニメーションのフラグ (0x02) で決める */
function detectWebpAnimation(bytes) {
  if (bytes.length < 20) return 'unknown'
  if (readFourCC(bytes, 0) !== 'RIFF' || readFourCC(bytes, 8) !== 'WEBP') {
    return 'unknown'
  }
  const chunkType = readFourCC(bytes, 12)
  const chunkSize = readUint32LE(bytes, 16)
  if (20 + chunkSize > bytes.length) return 'unknown'
  switch (chunkType) {
    case 'VP8X':
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
 * アニメーション画像かを判定する（animated / static / unknown）。
 * app/lib/image-compress.ts の detectAnimation と同じ規則で、PNG と WebP だけを
 * バイト列から判定し、それ以外の MIME は static を返す（GIF はこの関数を通さず、
 * 常に変換しない）。sharp のフレーム数（metadata.pages）は APNG を数えないので使わない
 */
export function detectAnimation(bytes, mime) {
  switch (mime) {
    case 'image/png':
      return detectPngAnimation(bytes)
    case 'image/webp':
      return detectWebpAnimation(bytes)
    default:
      return 'static'
  }
}

/**
 * 書き出した結果と元のどちらを残すかを決める。app/lib/image-compress.ts の
 * chooseUploadSource と同じ規則: 上限を超える結果は採用しない。縮小したときは
 * 元より大きくても採用し、縮小していないときは元より小さいときだけ採用する
 */
export function chooseUploadSource({
  resized,
  compressedSize,
  originalSize,
  maxSize,
}) {
  if (compressedSize > maxSize) return 'original'
  if (resized) return 'compressed'
  return compressedSize < originalSize ? 'compressed' : 'original'
}

/**
 * 先頭のバイト列から画像の形式を判定する（app/lib/storage.ts の
 * validateImageBytes と同じシグネチャ）。対応していなければ null
 */
export function sniffImageType(bytes) {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png'
  if (
    bytes.length >= 12 &&
    readFourCC(bytes, 0) === 'RIFF' &&
    readFourCC(bytes, 8) === 'WEBP'
  ) {
    return 'image/webp'
  }
  if (readFourCC(bytes, 0) === 'GIF8') return 'image/gif'
  return null
}

/**
 * 変換するかを決める。GIF、アニメーション（APNG・アニメーション WebP）、
 * アニメーションか判定できないものは、再エンコードすると 1 コマ目だけになり得るので
 * 変換せず、寸法だけを記録する
 */
export function decideConversion(bytes, mime) {
  const outputType = chooseOutputType(mime)
  if (!outputType) return { convert: false, reason: 'not-compressible' }
  const animation = detectAnimation(bytes, mime)
  if (animation === 'animated') return { convert: false, reason: 'animated' }
  if (animation === 'unknown') {
    return { convert: false, reason: 'animation-unknown' }
  }
  return { convert: true, outputType }
}

/**
 * EXIF の向き（1〜8）を反映した表示寸法。5〜8 は 90 度回転を含むので縦横を入れ替える。
 * ブラウザの <img> の naturalWidth / naturalHeight と同じ向きにそろえる
 */
export function orientedSize(width, height, orientation) {
  return orientation >= 5 && orientation <= 8
    ? { width: height, height: width }
    : { width, height }
}

/** 保存できる寸法か（1 以上 IMAGE_DIMENSION_MAX 以下の整数の組） */
export function isStorableSize(size) {
  return (
    size != null &&
    [size.width, size.height].every(
      (v) => Number.isInteger(v) && v >= 1 && v <= IMAGE_DIMENSION_MAX,
    )
  )
}

const IMAGE_KEY_PATTERN = /^diaries\/([A-Za-z0-9_-]+)\/[A-Za-z0-9._-]+$/

/**
 * 処理してよい画像キーか。SQL の文字列やコマンドの引数に安全に埋め込めるよう、
 * diaries/<英数字・ハイフン・アンダースコア>/<英数字・ドット・ハイフン・アンダースコア>
 * の形だけを受け付ける
 */
export function isSafeImageKey(key) {
  return typeof key === 'string' && IMAGE_KEY_PATTERN.test(key)
}

const EXTENSION_BY_TYPE = { 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/**
 * 差し替え先の新しいキー。元のキーと同じ diaries/<日記 ID>/ の下に、新規アップロード
 * （app/lib/storage.ts の generateImageKey）と同じ形のファイル名を付ける。
 * 画像は 1 年の immutable キャッシュで配信されるので、既存のキーには上書きしない
 */
export function newImageKey(oldKey, outputType, { now, suffix }) {
  const match = IMAGE_KEY_PATTERN.exec(oldKey)
  if (!match) throw new Error(`unsafe image key: ${oldKey}`)
  const ext = EXTENSION_BY_TYPE[outputType]
  if (!ext) throw new Error(`unsupported output type: ${outputType}`)
  return `diaries/${match[1]}/${now}-${suffix}.${ext}`
}

/** 寸法が無い行が参照している画像キー（重複なし）。diaries と diary_snapshots の両方から集める */
export const TARGET_KEYS_SQL = [
  'SELECT image_key FROM diaries',
  'WHERE image_key IS NOT NULL AND (image_width IS NULL OR image_height IS NULL)',
  'UNION',
  'SELECT image_key FROM diary_snapshots',
  'WHERE image_key IS NOT NULL AND (image_width IS NULL OR image_height IS NULL)',
  'ORDER BY image_key',
].join(' ')

/** 寸法を書く対象のテーブル。片方だけ成功することがあるので、1 文ずつ実行する */
export const IMAGE_TABLES = ['diaries', 'diary_snapshots']

function assertSafeKey(key) {
  if (!isSafeImageKey(key)) throw new Error(`unsafe image key: ${key}`)
}

function assertStorableSize(size) {
  if (!isStorableSize(size)) {
    throw new Error(`invalid image size: ${JSON.stringify(size)}`)
  }
}

/**
 * image_key が oldKey の行に寸法を入れる UPDATE。newKey を渡すとキーも差し替える。
 * updated_at などほかの列は変えない。キーと寸法は検証済みの値だけを埋め込む
 */
export function buildUpdateSql(table, oldKey, newKey, size) {
  if (!IMAGE_TABLES.includes(table)) throw new Error(`unknown table: ${table}`)
  assertSafeKey(oldKey)
  if (newKey !== null) assertSafeKey(newKey)
  assertStorableSize(size)
  const sets = [`image_width = ${size.width}`, `image_height = ${size.height}`]
  if (newKey !== null) sets.unshift(`image_key = '${newKey}'`)
  return `UPDATE ${table} SET ${sets.join(', ')} WHERE image_key = '${oldKey}'`
}

/** key を image_key に持つ行の数を、diaries と diary_snapshots のそれぞれで数える */
export function buildReferenceCountSql(key) {
  assertSafeKey(key)
  return [
    `SELECT (SELECT COUNT(*) FROM diaries WHERE image_key = '${key}') AS diaries,`,
    `(SELECT COUNT(*) FROM diary_snapshots WHERE image_key = '${key}') AS snapshots`,
  ].join(' ')
}

/**
 * wrangler.toml の本文から、DB バインディングの database_name と BUCKET バインディングの
 * bucket_name を読む。見つからなければ null
 */
export function readWranglerNames(toml) {
  const sections = []
  let current = null
  for (const rawLine of toml.split('\n')) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const header = /^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(line)
    if (header) {
      current = { name: header[1], values: {} }
      sections.push(current)
      continue
    }
    const pair = /^([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"$/.exec(line)
    if (pair && current) current.values[pair[1]] = pair[2]
  }
  const find = (name, binding, key) =>
    sections.find((s) => s.name === name && s.values.binding === binding)
      ?.values[key] ?? null
  return {
    databaseName: find('d1_databases', 'DB', 'database_name'),
    bucketName: find('r2_buckets', 'BUCKET', 'bucket_name'),
  }
}
