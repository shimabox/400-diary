export type Slot = {
  x: number
  y: number
  height: number
}

export type ObstacleRect = {
  x: number
  y: number
  width: number
  height: number
}

type ContainerSize = {
  width: number
  height: number
}

/**
 * 各列の空きスペース（スロット）を計算する。
 * 障害物と重なる列は上下に分割し、十分な高さがあるスロットのみ返す。
 */
export function computeSlots(
  containerSize: ContainerSize,
  fontSize: number,
  lineHeight: number,
  obstacleRect: ObstacleRect,
): Slot[] {
  if (containerSize.width <= 0 || containerSize.height <= 0) return []

  const colWidth = fontSize * lineHeight
  // 880 / (17.6 * 2) = 24.999... のように、数学上ちょうど収まる割り算が
  // 浮動小数点の丸めで 1 列少なく floor される。微小な許容値を足して
  // 「ぴったり収まる」列を取りこぼさないようにする
  const totalCols = Math.floor(containerSize.width / colWidth + 1e-6)
  const margin = fontSize

  const obs = {
    left: obstacleRect.x - margin,
    right: obstacleRect.x + obstacleRect.width + margin,
    top: obstacleRect.y - margin,
    bottom: obstacleRect.y + obstacleRect.height + margin,
  }
  const hasObstacle = obstacleRect.width > 0 && obstacleRect.height > 0

  const slots: Slot[] = []
  for (let i = 0; i < totalCols; i++) {
    const colX = containerSize.width - (i + 1) * colWidth
    const colRight = colX + colWidth
    const overlaps = hasObstacle && colX < obs.right && colRight > obs.left

    if (overlaps) {
      const above = Math.max(0, obs.top)
      const below = Math.max(0, containerSize.height - obs.bottom)
      if (above > fontSize) slots.push({ x: colX, y: 0, height: above })
      if (below > fontSize)
        slots.push({ x: colX, y: obs.bottom, height: below })
    } else {
      slots.push({ x: colX, y: 0, height: containerSize.height })
    }
  }

  return slots
}

export type DateRect = {
  side: 'left' | 'right'
  width: number
  height: number
}

/**
 * 幅を extraCols 列ぶん左へ拡張した状態のスロットを計算する。
 *
 * 縦書きテキストは右端が読み始めなので、拡張後も右端を基準に保つ必要がある。
 * そのため障害物（画像）と右寄せ日付は拡張量 delta だけ x をずらして右端からの
 * 距離を維持する。左寄せ日付は拡張後も元のキャンバス左端（x = delta）に留め、
 * 拡張してもスクロールなしで日付が見えることを保つ。
 *
 * 返り値の delta は拡張量（px）。描画側のキャンバス幅計算と式を共有するために
 * ここで一緒に返す。
 */
export function computeExtendedSlots(
  containerSize: ContainerSize,
  fontSize: number,
  lineHeight: number,
  obstacleRect: ObstacleRect,
  extraCols: number,
  dateRect: DateRect | null,
): { slots: Slot[]; delta: number } {
  const colWidth = fontSize * lineHeight
  const delta = extraCols * colWidth
  const width = containerSize.width + delta

  let slots = computeSlots(
    { width, height: containerSize.height },
    fontSize,
    lineHeight,
    { ...obstacleRect, x: obstacleRect.x + delta },
  )

  if (dateRect) {
    const dateX = dateRect.side === 'right' ? width - dateRect.width : delta
    slots = adjustSlotsForDate(
      slots,
      { x: dateX, width: dateRect.width, height: dateRect.height },
      colWidth,
      fontSize,
    )
  }

  return { slots, delta }
}

/**
 * 日付ラベル領域と重なるスロットを補正する。
 * 日付は常に y=0 のコーナーにあるため、重なるスロットの上部を削る。
 */
export function adjustSlotsForDate(
  slots: Slot[],
  dateRect: { x: number; width: number; height: number },
  colWidth: number,
  fontSize: number,
): Slot[] {
  if (dateRect.width <= 0 || dateRect.height <= 0) return slots

  const margin = fontSize * 2
  const dateLeft = dateRect.x - margin
  const dateRight = dateRect.x + dateRect.width + margin
  const dateBottom = dateRect.height + margin

  return slots
    .map((slot) => {
      const colRight = slot.x + colWidth
      const overlaps = slot.x < dateRight && colRight > dateLeft

      if (!overlaps || slot.y >= dateBottom) return slot

      // 上部を日付分だけ削る
      const newY = dateBottom
      const newHeight = slot.height - (newY - slot.y)
      if (newHeight <= fontSize) return null
      return { x: slot.x, y: newY, height: newHeight }
    })
    .filter((slot): slot is Slot => slot !== null)
}
