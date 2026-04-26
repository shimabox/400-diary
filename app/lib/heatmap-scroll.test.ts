import { describe, expect, test } from 'vitest'
import {
  computeInitialScrollLeft,
  decideScrollTarget,
  HEATMAP_COLUMN_PITCH_PX,
  HEATMAP_SCROLL_BUFFER_PX,
} from './heatmap-scroll'

describe('decideScrollTarget', () => {
  test('現在年は currentMonth を返す', () => {
    expect(decideScrollTarget(2026, 2026)).toBe('currentMonth')
  })

  test('過去年は rightEdge を返す', () => {
    expect(decideScrollTarget(2025, 2026)).toBe('rightEdge')
  })

  test('未来年は leftEdge を返す', () => {
    expect(decideScrollTarget(2027, 2026)).toBe('leftEdge')
  })
})

describe('computeInitialScrollLeft', () => {
  const monthStartCols = [0, 5, 9, 13, 17, 22, 26, 31, 35, 39, 44, 48]

  test('leftEdge は scrollWidth に関わらず 0 を返す', () => {
    expect(
      computeInitialScrollLeft({
        target: 'leftEdge',
        currentMonth: 6,
        monthStartCols,
        scrollWidth: 1234,
      }),
    ).toBe(0)
  })

  test('rightEdge は scrollWidth をそのまま返す(ブラウザがクランプする)', () => {
    expect(
      computeInitialScrollLeft({
        target: 'rightEdge',
        currentMonth: 0,
        monthStartCols,
        scrollWidth: 999,
      }),
    ).toBe(999)
  })

  test('currentMonth で月初列が 0 のときはバッファ分を引いても 0 にクランプされる', () => {
    expect(
      computeInitialScrollLeft({
        target: 'currentMonth',
        currentMonth: 0,
        monthStartCols,
        scrollWidth: 1000,
      }),
    ).toBe(0)
  })

  test('currentMonth で col=17 (5月相当) は 17*14 - 4 = 234 を返す', () => {
    expect(
      computeInitialScrollLeft({
        target: 'currentMonth',
        currentMonth: 4,
        monthStartCols,
        scrollWidth: 1000,
      }),
    ).toBe(17 * HEATMAP_COLUMN_PITCH_PX - HEATMAP_SCROLL_BUFFER_PX)
  })

  test('columnPitchPx と bufferPx の上書きが計算に反映される', () => {
    expect(
      computeInitialScrollLeft({
        target: 'currentMonth',
        currentMonth: 2,
        monthStartCols,
        scrollWidth: 1000,
        columnPitchPx: 10,
        bufferPx: 0,
      }),
    ).toBe(9 * 10)
  })
})
