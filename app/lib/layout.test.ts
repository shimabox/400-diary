import { describe, expect, it } from 'vitest'
import {
  adjustSlotsForDate,
  computeExtendedSlots,
  computeSlots,
} from './layout'

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

describe('computeExtendedSlots', () => {
  const obstacle = { x: 400, y: 0, width: 128, height: 150 }

  it('extraCols=0 なら computeSlots と同じ結果になる', () => {
    const { slots, delta } = computeExtendedSlots(
      container,
      fontSize,
      lineHeight,
      obstacle,
      0,
      null,
    )
    const base = computeSlots(container, fontSize, lineHeight, obstacle)
    expect(slots).toEqual(base)
    expect(delta).toBe(0)
  })

  it('拡張量 delta（px）を返す', () => {
    const { delta } = computeExtendedSlots(
      container,
      fontSize,
      lineHeight,
      obstacle,
      3,
      null,
    )
    expect(delta).toBeCloseTo(3 * colWidth, 6)
  })

  it('extraCols 列ぶんスロットが左に追加される', () => {
    const { slots: base } = computeExtendedSlots(
      container,
      fontSize,
      lineHeight,
      obstacle,
      0,
      null,
    )
    const { slots: extended } = computeExtendedSlots(
      container,
      fontSize,
      lineHeight,
      obstacle,
      3,
      null,
    )

    expect(extended).toHaveLength(base.length + 3)
    // 追加された列は全高スロット
    const addedCols = extended.filter((s) => s.x < colWidth * 3)
    expect(addedCols.length).toBeGreaterThanOrEqual(3)
  })

  it('障害物は右端からの距離を保つ（元のレイアウトが delta だけシフトする）', () => {
    const extraCols = 2
    const delta = extraCols * colWidth
    const base = computeSlots(container, fontSize, lineHeight, obstacle)
    const { slots: extended } = computeExtendedSlots(
      container,
      fontSize,
      lineHeight,
      obstacle,
      extraCols,
      null,
    )

    // 障害物で分割されたスロット（y > 0）の x が delta シフトで一致する
    const splitXs = (slots: { x: number; y: number }[]) =>
      slots.filter((s) => s.y > 0).map((s) => s.x)
    const shifted = splitXs(base).map((x) => x + delta)
    const actual = splitXs(extended)
    expect(actual).toHaveLength(shifted.length)
    for (let i = 0; i < shifted.length; i++) {
      expect(actual[i]).toBeCloseTo(shifted[i], 6)
    }
  })

  it('右寄せ日付は拡張後の右端に張り付く', () => {
    const extraCols = 2
    const delta = extraCols * colWidth
    const dateRect = { side: 'right' as const, width: 100, height: 40 }
    const { slots: extended } = computeExtendedSlots(
      container,
      fontSize,
      lineHeight,
      { x: 0, y: 0, width: 0, height: 0 },
      extraCols,
      dateRect,
    )

    // 拡張後の右端付近の列は日付ぶん上部が削られている
    const dateBottom = dateRect.height + fontSize * 2
    const rightmost = extended.reduce((a, b) => (a.x > b.x ? a : b))
    expect(rightmost.x + colWidth).toBeGreaterThan(
      container.width + delta - dateRect.width,
    )
    expect(rightmost.y).toBe(dateBottom)
  })

  it('左寄せ日付は拡張後も元のキャンバス左端（初期表示内）に留まる', () => {
    const extraCols = 5
    const delta = extraCols * colWidth
    const margin = fontSize * 2
    const dateRect = { side: 'left' as const, width: 100, height: 40 }
    const { slots } = computeExtendedSlots(
      container,
      fontSize,
      lineHeight,
      { x: 0, y: 0, width: 0, height: 0 },
      extraCols,
      dateRect,
    )

    const dateBottom = dateRect.height + margin

    // 元のキャンバス左端（x = delta）にある日付と重なる列は上部が削られる
    const dateCols = slots.filter(
      (s) =>
        s.x < delta + dateRect.width + margin &&
        s.x + colWidth > delta - margin,
    )
    expect(dateCols.length).toBeGreaterThan(0)
    for (const slot of dateCols) {
      expect(slot.y).toBe(dateBottom)
    }

    // 拡張で追加された日付より左の列は全高のまま
    // （= 日付は拡張後の左端へ移動せず、初期表示内に残る）
    const leftOfDate = slots.filter((s) => s.x + colWidth <= delta - margin)
    expect(leftOfDate.length).toBeGreaterThan(0)
    for (const slot of leftOfDate) {
      expect(slot.y).toBe(0)
      expect(slot.height).toBe(container.height)
    }
  })

  it('拡張により総スロット高さ（テキスト容量）が単調に増える', () => {
    const capacity = (extraCols: number) =>
      computeExtendedSlots(
        container,
        fontSize,
        lineHeight,
        obstacle,
        extraCols,
        null,
      ).slots.reduce((sum, s) => sum + s.height, 0)

    expect(capacity(1)).toBeGreaterThan(capacity(0))
    expect(capacity(5)).toBeGreaterThan(capacity(1))
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
