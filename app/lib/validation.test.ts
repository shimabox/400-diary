import { describe, expect, test } from 'vitest'
import { MAX_BODY_LENGTH } from './constants'
import {
  isDiaryDate,
  isHexColor,
  isImageCoord,
  isImageLayout,
  isMood,
  validateDiaryInput,
} from './validation'

describe('isHexColor', () => {
  test('#RRGGBB 形式は true', () => {
    expect(isHexColor('#FFE4E1')).toBe(true)
    expect(isHexColor('#000000')).toBe(true)
  })

  test('短縮形・不正な文字・スクリプト混入は false', () => {
    expect(isHexColor('#FFF')).toBe(false)
    expect(isHexColor('FFE4E1')).toBe(false)
    expect(isHexColor('"/><script>')).toBe(false)
    expect(isHexColor(123)).toBe(false)
    expect(isHexColor(null)).toBe(false)
  })
})

describe('isDiaryDate', () => {
  test('実在する日付は true', () => {
    expect(isDiaryDate('2026-04-12')).toBe(true)
    expect(isDiaryDate('2024-02-29')).toBe(true) // うるう年
  })

  test('存在しない日付は false', () => {
    expect(isDiaryDate('2026-02-30')).toBe(false)
    expect(isDiaryDate('2025-02-29')).toBe(false) // うるう年でない
    expect(isDiaryDate('2026-13-01')).toBe(false)
  })

  test('形式が違う値・文字列以外は false', () => {
    expect(isDiaryDate('abc')).toBe(false)
    expect(isDiaryDate('2026/04/12')).toBe(false)
    expect(isDiaryDate(20260412)).toBe(false)
    expect(isDiaryDate(null)).toBe(false)
  })
})

describe('isImageLayout', () => {
  test('left / right は true', () => {
    expect(isImageLayout('left')).toBe(true)
    expect(isImageLayout('right')).toBe(true)
  })

  test('それ以外は false', () => {
    expect(isImageLayout('center')).toBe(false)
    expect(isImageLayout('')).toBe(false)
    expect(isImageLayout(null)).toBe(false)
  })
})

describe('isMood', () => {
  test('MOODS のキーと null は true', () => {
    expect(isMood('happy')).toBe(true)
    expect(isMood('calm')).toBe(true)
    expect(isMood(null)).toBe(true)
  })

  test('未知の値・空文字・undefined は false', () => {
    expect(isMood('invalid')).toBe(false)
    expect(isMood('')).toBe(false)
    expect(isMood(undefined)).toBe(false)
  })
})

describe('isImageCoord', () => {
  test('有限数値・null は true', () => {
    expect(isImageCoord(0)).toBe(true)
    expect(isImageCoord(-12.5)).toBe(true)
    expect(isImageCoord(null)).toBe(true)
  })

  test('NaN・Infinity・数値以外は false', () => {
    expect(isImageCoord(Number.NaN)).toBe(false)
    expect(isImageCoord(Number.POSITIVE_INFINITY)).toBe(false)
    expect(isImageCoord('10')).toBe(false)
    expect(isImageCoord('NaN文字列')).toBe(false)
    expect(isImageCoord(undefined)).toBe(false)
  })
})

describe('validateDiaryInput', () => {
  test('オブジェクト以外は不正なリクエストとして400相当を返す', () => {
    expect(validateDiaryInput(null).ok).toBe(false)
    expect(validateDiaryInput('文字列').ok).toBe(false)
    expect(validateDiaryInput(42).ok).toBe(false)
  })

  test('requireBody: true で本文がないと失敗する', () => {
    const result = validateDiaryInput(
      { diary_date: '2026-04-12' },
      { requireBody: true },
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('本文')
  })

  test('requireBody: false なら本文省略を許可する(PUT の部分更新)', () => {
    const result = validateDiaryInput(
      { background_color: '#FFE4E1' },
      { requireBody: false },
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.body).toBeUndefined()
  })

  test('本文が空文字は失敗する', () => {
    const result = validateDiaryInput({ body: '' })
    expect(result.ok).toBe(false)
  })

  test(`本文が${MAX_BODY_LENGTH}文字を超えると失敗する`, () => {
    const result = validateDiaryInput({
      body: 'あ'.repeat(MAX_BODY_LENGTH + 1),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(`${MAX_BODY_LENGTH}文字`)
  })

  test(`本文が${MAX_BODY_LENGTH}文字ちょうどは許可される`, () => {
    const result = validateDiaryInput({ body: 'あ'.repeat(MAX_BODY_LENGTH) })
    expect(result.ok).toBe(true)
  })

  test('requireDate: true で日付がないと失敗する', () => {
    const result = validateDiaryInput({ body: 'テスト' }, { requireDate: true })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('日付')
  })

  test('日付の形式が不正だと失敗する', () => {
    const result = validateDiaryInput({ diary_date: 'abc' })
    expect(result.ok).toBe(false)
  })

  test('存在しない日付(2月30日)は失敗する', () => {
    const result = validateDiaryInput({ diary_date: '2026-02-30' })
    expect(result.ok).toBe(false)
  })

  test('background_color に不正な値(XSS 混入含む)を渡すと失敗する', () => {
    const result = validateDiaryInput({
      background_color: '"/><script>alert(1)</script>',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('背景色')
  })

  test('background_color が空文字は未指定として許可される', () => {
    const result = validateDiaryInput({ background_color: '' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.background_color).toBeUndefined()
  })

  test('image_layout に left/right 以外を渡すと失敗する', () => {
    const result = validateDiaryInput({ image_layout: 'center' })
    expect(result.ok).toBe(false)
  })

  test('mood に未知の値を渡すと失敗する', () => {
    const result = validateDiaryInput({ mood: 'invalid' })
    expect(result.ok).toBe(false)
  })

  test('mood に null を渡すと明示的なクリアとして許可される', () => {
    const result = validateDiaryInput({ mood: null })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.mood).toBeNull()
      expect('mood' in result.value).toBe(true)
    }
  })

  test('mood を指定しなければ value にキー自体を含めない(部分更新を壊さない)', () => {
    const result = validateDiaryInput({ body: 'テスト' })
    expect(result.ok).toBe(true)
    if (result.ok) expect('mood' in result.value).toBe(false)
  })

  test('image_x / image_y に数値以外の文字列を渡すと失敗する', () => {
    expect(validateDiaryInput({ image_x: 'NaN文字列' }).ok).toBe(false)
    expect(validateDiaryInput({ image_y: 'NaN文字列' }).ok).toBe(false)
  })

  test('image_x / image_y に null を渡すと許可される', () => {
    const result = validateDiaryInput({ image_x: null, image_y: null })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.image_x).toBeNull()
      expect(result.value.image_y).toBeNull()
    }
  })

  test('全フィールドが正しい値なら成功する', () => {
    const result = validateDiaryInput(
      {
        body: 'テスト日記',
        diary_date: '2026-04-12',
        background_color: '#FFE4E1',
        image_layout: 'left',
        mood: 'happy',
        image_x: 10,
        image_y: -5.5,
      },
      { requireBody: true, requireDate: true },
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        body: 'テスト日記',
        diary_date: '2026-04-12',
        background_color: '#FFE4E1',
        image_layout: 'left',
        mood: 'happy',
        image_x: 10,
        image_y: -5.5,
      })
    }
  })
})
