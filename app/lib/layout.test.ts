import { describe, expect, it } from 'vitest'
import { adjustSlotsForDate, computeSlots } from './layout'

const container = { width: 648, height: 500 }
const fontSize = 18
const lineHeight = 1.8
const colWidth = fontSize * lineHeight // 32.4

describe('computeSlots', () => {
  it('障害物なしでは全列が全高スロットになる', () => {
    const obstacle = { x: 0, y: 0, width: 0, height: 0 }
    const slots = computeSlots(container, fontSize, lineHeight, obstacle)

    const totalCols = Math.floor(container.width / colWidth)
    expect(slots).toHaveLength(totalCols)
    for (const slot of slots) {
      expect(slot.y).toBe(0)
      expect(slot.height).toBe(container.height)
    }
  })

  it('列は右から左に並ぶ', () => {
    const obstacle = { x: 0, y: 0, width: 0, height: 0 }
    const slots = computeSlots(container, fontSize, lineHeight, obstacle)

    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].x).toBeLessThan(slots[i - 1].x)
    }
  })

  it('障害物と重なる列は上下に分割される', () => {
    const obstacle = { x: 400, y: 150, width: 128, height: 150 }
    const slots = computeSlots(container, fontSize, lineHeight, obstacle)

    const margin = fontSize
    const obsLeft = obstacle.x - margin
    const obsRight = obstacle.x + obstacle.width + margin
    const obsBottom = obstacle.y + obstacle.height + margin

    const overlappingSlots = slots.filter((s) => {
      const colRight = s.x + colWidth
      return s.x < obsRight && colRight > obsLeft
    })

    const aboveSlots = overlappingSlots.filter((s) => s.y === 0)
    const belowSlots = overlappingSlots.filter((s) => s.y === obsBottom)
    expect(aboveSlots.length).toBeGreaterThan(0)
    expect(belowSlots.length).toBeGreaterThan(0)
  })

  it('上部の空きが1文字分以下ならスロットを作らない', () => {
    const obstacle = { x: 400, y: 5, width: 128, height: 150 }
    const slots = computeSlots(container, fontSize, lineHeight, obstacle)

    const margin = fontSize
    const obsLeft = obstacle.x - margin
    const obsRight = obstacle.x + obstacle.width + margin

    const overlappingAbove = slots.filter((s) => {
      const colRight = s.x + colWidth
      return s.x < obsRight && colRight > obsLeft && s.y === 0
    })

    expect(overlappingAbove).toHaveLength(0)
  })

  it('下部の空きが1文字分以下ならスロットを作らない', () => {
    const obstacle = { x: 400, y: 320, width: 128, height: 150 }
    const slots = computeSlots(container, fontSize, lineHeight, obstacle)

    const margin = fontSize
    const obsLeft = obstacle.x - margin
    const obsRight = obstacle.x + obstacle.width + margin
    const obsBottom = obstacle.y + obstacle.height + margin

    const overlappingBelow = slots.filter((s) => {
      const colRight = s.x + colWidth
      return s.x < obsRight && colRight > obsLeft && s.y === obsBottom
    })

    expect(overlappingBelow).toHaveLength(0)
  })

  it('コンテナサイズが0以下なら空配列を返す', () => {
    const obstacle = { x: 0, y: 0, width: 0, height: 0 }
    expect(
      computeSlots({ width: 0, height: 500 }, fontSize, lineHeight, obstacle),
    ).toEqual([])
    expect(
      computeSlots({ width: 500, height: 0 }, fontSize, lineHeight, obstacle),
    ).toEqual([])
    expect(
      computeSlots({ width: -1, height: -1 }, fontSize, lineHeight, obstacle),
    ).toEqual([])
  })

  it('障害物がコンテナ外なら全列が全高スロットになる', () => {
    const obstacle = { x: -200, y: -200, width: 128, height: 150 }
    const slots = computeSlots(container, fontSize, lineHeight, obstacle)

    for (const slot of slots) {
      expect(slot.y).toBe(0)
      expect(slot.height).toBe(container.height)
    }
  })
})

describe('adjustSlotsForDate', () => {
  it('日付領域と重なるスロットの上部を削る', () => {
    const slots = [
      { x: 600, y: 0, height: 500 },
      { x: 560, y: 0, height: 500 },
    ]
    const dateRect = { x: 550, width: 100, height: 40 }

    const adjusted = adjustSlotsForDate(slots, dateRect, colWidth, fontSize)

    const dateBottom = dateRect.height + fontSize * 2
    for (const slot of adjusted) {
      if (slot.x >= 550 && slot.x < 650) {
        expect(slot.y).toBeGreaterThanOrEqual(dateBottom)
      }
    }
  })

  it('日付領域と重ならないスロットは変更しない', () => {
    const slots = [
      { x: 100, y: 0, height: 500 },
      { x: 60, y: 0, height: 500 },
    ]
    const dateRect = { x: 550, width: 100, height: 40 }

    const adjusted = adjustSlotsForDate(slots, dateRect, colWidth, fontSize)

    expect(adjusted).toEqual(slots)
  })

  it('日付サイズが0なら何も変更しない', () => {
    const slots = [{ x: 600, y: 0, height: 500 }]
    const dateRect = { x: 550, width: 0, height: 0 }

    const adjusted = adjustSlotsForDate(slots, dateRect, colWidth, fontSize)

    expect(adjusted).toEqual(slots)
  })

  it('補正後の高さが1文字分以下ならスロットを除外する', () => {
    const slots = [{ x: 600, y: 0, height: 80 }]
    const dateRect = { x: 550, width: 100, height: 60 }

    const adjusted = adjustSlotsForDate(slots, dateRect, colWidth, fontSize)

    // dateBottom = 60 + 36 = 96, newHeight = 80 - 96 = -16 → 除外
    expect(adjusted).toHaveLength(0)
  })

  it('障害物で分割された下部スロットは日付の影響を受けない', () => {
    const slots = [{ x: 600, y: 200, height: 300 }]
    const dateRect = { x: 550, width: 100, height: 40 }

    const adjusted = adjustSlotsForDate(slots, dateRect, colWidth, fontSize)

    // slot.y(200) >= dateBottom(40+36=76) なので変更なし
    expect(adjusted).toEqual(slots)
  })
})
