import type { ImageSize } from './image-layout'

/**
 * 表示に使う画像の寸法の選び方。
 *
 * 寸法は「いま表示している画像」のものでなければならない。別の画像の寸法で
 * 組むと、読み込み後に組み直されて文章が動くだけでなく、読み込みまでの間の
 * 表示が崩れる。合わない寸法を渡すくらいなら寸法なし（null）にする。
 */

/**
 * DB の image_width / image_height を寸法の組にする。両方が正の有限数のときだけ
 * 寸法として扱い、片方でも欠けていれば null（寸法なし）
 */
export function toImageSize(
  width: number | null | undefined,
  height: number | null | undefined,
): ImageSize | null {
  if (typeof width !== 'number' || typeof height !== 'number') return null
  return isUsableLength(width) && isUsableLength(height)
    ? { width, height }
    : null
}

function isUsableLength(v: number): boolean {
  return Number.isFinite(v) && v > 0
}

/** 読み込みが終わった画像の実寸。どの src の画像を測ったかを一緒に持つ */
export type LoadedImageSize = ImageSize & { src: string }

/**
 * FlowText が配置の計算に使う寸法を決める。
 *
 * 1. いま表示している画像（currentSrc）の読み込みが終わっていれば、その実寸
 * 2. まだなら、渡された寸法（保存済みの寸法やプレビューの寸法）
 * 3. どちらも無ければ null（画像なしで組み、読み込み後に組み直す）
 *
 * 実寸を優先するので、渡された寸法が間違っていても読み込み後は実寸で組まれる。
 * 前の画像を測った実寸は src が違うので使わない。
 */
export function chooseLayoutImageSize(
  loaded: LoadedImageSize | null,
  currentSrc: string | null,
  given: ImageSize | null | undefined,
): ImageSize | null {
  if (currentSrc === null) return null
  if (loaded && loaded.src === currentSrc) {
    return { width: loaded.width, height: loaded.height }
  }
  return given ? toImageSize(given.width, given.height) : null
}

/** 保存済みの画像（R2 のキーと、アップロード時に保存した寸法） */
export type SavedImage = { key: string; size: ImageSize | null }

/** アップロード中に表示するプレビュー（選んだ画像の data URL と、その寸法） */
export type ImagePreview = { src: string; size: ImageSize | null }

/**
 * 編集画面で表示する画像の src と寸法を決める。プレビューがあればプレビューの
 * 画像と寸法、無ければ保存済みの画像と寸法。プレビューを取り消せば（null に
 * すれば）保存済みの寸法に戻る。どちらの場合も、src と寸法は同じ画像のもの
 */
export function resolveEditorImage(
  preview: ImagePreview | null,
  saved: SavedImage | null,
): { src: string | null; size: ImageSize | null } {
  if (preview) return { src: preview.src, size: preview.size }
  if (saved) return { src: `/api/images/${saved.key}`, size: saved.size }
  return { src: null, size: null }
}
