import { describe, expect, test } from 'vitest'
import { formatDiaryDate } from './format'

describe('formatDiaryDate', () => {
  test('平日の日付をフォーマットする', () => {
    expect(formatDiaryDate('2026-04-13')).toBe('2026/4/13 (月)')
  })

  test('日曜日の日付をフォーマットする', () => {
    expect(formatDiaryDate('2026-04-12')).toBe('2026/4/12 (日)')
  })

  test('土曜日の日付をフォーマットする', () => {
    expect(formatDiaryDate('2026-04-11')).toBe('2026/4/11 (土)')
  })

  test('月初の日付をフォーマットする', () => {
    expect(formatDiaryDate('2026-01-01')).toBe('2026/1/1 (木)')
  })

  test('月末の日付をフォーマットする', () => {
    expect(formatDiaryDate('2026-12-31')).toBe('2026/12/31 (木)')
  })
})
