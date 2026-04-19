import { describe, expect, test } from 'vitest'
import { formatDiaryDate, toLocalDateString } from './format'

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

describe('toLocalDateString', () => {
  test('UTC 深夜帯でも JST で当日扱いになる(00:00 JST = 前日 15:00 UTC)', () => {
    // 2026-04-20 00:00 JST = 2026-04-19 15:00 UTC
    const date = new Date('2026-04-19T15:00:00.000Z')
    expect(toLocalDateString(date)).toBe('2026-04-20')
  })

  test('JST 23:59 は当日扱い', () => {
    // 2026-04-19 23:59 JST = 2026-04-19 14:59 UTC
    const date = new Date('2026-04-19T14:59:59.000Z')
    expect(toLocalDateString(date)).toBe('2026-04-19')
  })

  test('UTC で翌日になっても JST ではまだ当日', () => {
    // 2026-04-19 09:00 UTC = 2026-04-19 18:00 JST
    const date = new Date('2026-04-19T09:00:00.000Z')
    expect(toLocalDateString(date)).toBe('2026-04-19')
  })

  test('YYYY-MM-DD 形式(ゼロ埋め)で返す', () => {
    const date = new Date('2026-01-05T03:00:00.000Z')
    expect(toLocalDateString(date)).toBe('2026-01-05')
  })
})
