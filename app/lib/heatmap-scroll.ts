export const HEATMAP_COLUMN_PITCH_PX = 14
export const HEATMAP_SCROLL_BUFFER_PX = 4

export type ScrollTarget = 'currentMonth' | 'rightEdge' | 'leftEdge'

export function decideScrollTarget(
  viewYear: number,
  currentYear: number,
): ScrollTarget {
  if (viewYear === currentYear) return 'currentMonth'
  if (viewYear < currentYear) return 'rightEdge'
  return 'leftEdge'
}

export function computeInitialScrollLeft(params: {
  target: ScrollTarget
  currentMonth: number
  monthStartCols: number[]
  scrollWidth: number
  columnPitchPx?: number
  bufferPx?: number
}): number {
  const {
    target,
    currentMonth,
    monthStartCols,
    scrollWidth,
    columnPitchPx = HEATMAP_COLUMN_PITCH_PX,
    bufferPx = HEATMAP_SCROLL_BUFFER_PX,
  } = params

  if (target === 'leftEdge') return 0
  if (target === 'rightEdge') return scrollWidth

  const col = monthStartCols[currentMonth] ?? 0
  return Math.max(0, col * columnPitchPx - bufferPx)
}

/**
 * ヒートマップ scroll コンテナ直下に埋めるインラインスクリプトと等価な計算。
 * インラインスクリプトはバンドル外の JS 文字列なので、ここで TS の純粋関数と
 * 等価性テストすることで、両者の式がズレた場合にテストで気づけるようにする。
 */
export function computeInlineScrollLeft(
  year: number,
  currentYear: number,
  currentMonth: number,
  monthStartCols: number[],
  scrollWidth: number,
): number {
  if (year < currentYear) return scrollWidth
  if (year === currentYear) {
    return Math.max(
      0,
      (monthStartCols[currentMonth] ?? 0) * HEATMAP_COLUMN_PITCH_PX -
        HEATMAP_SCROLL_BUFFER_PX,
    )
  }
  return 0
}
