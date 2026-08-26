/**
 * レイアウトは小数 px で、getBoundingClientRect の値は丸めで 1〜2px の差が
 * 出ることがあるため、その分は「はみ出していない」とみなす
 */
export const SCROLL_FADE_TOLERANCE_PX = 2

/**
 * 横スクロールフレームの左端に「まだ続きがある」フェードを出すべきか。
 *
 * 用紙（キャンバス）が枠より広くてもそれだけでは続きとは言えないため、
 * スクロール余地ではなく本文・画像そのものの左端で判定する。
 *
 * @param visibleLeft 枠の表示領域（padding の内側）の左端の画面座標
 * @param contentLefts 本文の列や画像それぞれの左端の画面座標
 */
export function hasContentBeyondLeft(
  visibleLeft: number,
  contentLefts: readonly number[],
  tolerancePx: number = SCROLL_FADE_TOLERANCE_PX,
): boolean {
  let contentLeft = Number.POSITIVE_INFINITY
  for (const left of contentLefts) {
    contentLeft = Math.min(contentLeft, left)
  }
  return contentLeft < visibleLeft - tolerancePx
}

/**
 * 横スクロールフレームで、ユーザーがスクロールして到達できる幅。
 *
 * 用紙（キャンバス）の右端（文頭）から、本文の列・画像・日付のうち最も
 * 左にあるものの左端までの距離。用紙の残りの余白はスクロール対象にしない。
 * 本文も画像も無ければ 0。
 *
 * @param canvasRight 用紙の右端の画面座標
 * @param contentLefts 本文の列や画像それぞれの左端の画面座標
 */
export function computeContentExtent(
  canvasRight: number,
  contentLefts: readonly number[],
): number {
  let extent = 0
  for (const left of contentLefts) {
    extent = Math.max(extent, canvasRight - left)
  }
  return extent
}
