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
