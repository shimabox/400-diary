import { describe, expect, test } from 'vitest'
import { PASTEL_COLORS, randomPastelColor } from './colors'

describe('PASTEL_COLORS', () => {
  test('12色が定義されている', () => {
    expect(PASTEL_COLORS).toHaveLength(12)
  })

  test('すべて有効なHEXカラーコード', () => {
    for (const color of PASTEL_COLORS) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    }
  })
})

describe('randomPastelColor', () => {
  test('PASTEL_COLORSの中から返す', () => {
    for (let i = 0; i < 50; i++) {
      const color = randomPastelColor()
      expect(PASTEL_COLORS).toContain(color)
    }
  })
})
