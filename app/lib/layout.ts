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
  const totalCols = Math.floor(containerSize.width / colWidth)
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
