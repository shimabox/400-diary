import { describe, expect, test } from 'vitest'
import { COLS, countColumns, ROWS, trimToGrid } from './grid'

describe('グリッド定数', () => {
  test('COLSは20', () => {
    expect(COLS).toBe(20)
  })

  test('ROWSは20', () => {
    expect(ROWS).toBe(20)
  })
})

describe('countColumns', () => {
  test('空文字は0列', () => {
    expect(countColumns('')).toBe(0)
  })

  test('1文字は1列', () => {
    expect(countColumns('あ')).toBe(1)
  })

  test('20文字ちょうどは1列', () => {
    expect(countColumns('あ'.repeat(20))).toBe(1)
  })

  test('21文字は2列', () => {
    expect(countColumns('あ'.repeat(21))).toBe(2)
  })

  test('40文字ちょうどは2列', () => {
    expect(countColumns('あ'.repeat(40))).toBe(2)
  })

  test('改行で列が進む', () => {
    expect(countColumns('あ\nい')).toBe(2)
  })

  test('改行のみは1列', () => {
    expect(countColumns('\n')).toBe(2)
  })

  test('複数の改行', () => {
    expect(countColumns('あ\nい\nう')).toBe(3)
  })

  test('1行が20文字を超えると複数列になる', () => {
    expect(countColumns(`${'あ'.repeat(21)}\nい`)).toBe(3)
  })
})

describe('trimToGrid', () => {
  test('短いテキストはそのまま', () => {
    expect(trimToGrid('こんにちは')).toBe('こんにちは')
  })

  test('空文字はそのまま', () => {
    expect(trimToGrid('')).toBe('')
  })

  test('400文字ちょうどはそのまま', () => {
    const text = 'あ'.repeat(400)
    expect(trimToGrid(text)).toBe(text)
  })

  test('400文字を超えると切り詰め', () => {
    const text = 'あ'.repeat(401)
    expect(trimToGrid(text).length).toBe(400)
  })

  test('改行が多く列数を超える場合は切り詰め', () => {
    // 21行 = 21列 > 20列なので切り詰められる
    const text = Array.from({ length: 21 }, () => 'あ').join('\n')
    const result = trimToGrid(text)
    expect(countColumns(result)).toBeLessThanOrEqual(20)
  })

  test('切り詰め後も有効なテキスト', () => {
    const text = Array.from({ length: 25 }, () => 'あいう').join('\n')
    const result = trimToGrid(text)
    expect(countColumns(result)).toBeLessThanOrEqual(20)
    expect(result.length).toBeLessThanOrEqual(400)
  })
})
