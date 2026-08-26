import { describe, expect, test } from 'vitest'
import { hasContentBeyondLeft } from './scroll-fade'

describe('hasContentBeyondLeft', () => {
  test('本文も画像も無ければ続きは無い', () => {
    expect(hasContentBeyondLeft(56, [])).toBe(false)
  })

  test('すべての左端が表示領域の内側なら続きは無い（用紙が枠より広くても関係ない）', () => {
    expect(hasContentBeyondLeft(56, [900, 500, 56])).toBe(false)
  })

  test('丸め誤差の範囲（2px 以内）のはみ出しは続きとみなさない', () => {
    expect(hasContentBeyondLeft(56, [54])).toBe(false)
    expect(hasContentBeyondLeft(56, [53.9])).toBe(true)
  })

  test('ひとつでも表示領域より左にあれば続きがある', () => {
    expect(hasContentBeyondLeft(56, [900, 500, -100])).toBe(true)
  })

  test('左端までスクロールして左端が表示領域内に入れば続きは無い', () => {
    // scrollLeft が負に進むと本文の画面座標は右へ動く
    expect(hasContentBeyondLeft(56, [-100 + 200])).toBe(false)
  })

  test('許容幅は指定できる', () => {
    expect(hasContentBeyondLeft(56, [50], 10)).toBe(false)
    expect(hasContentBeyondLeft(56, [50], 0)).toBe(true)
  })
})
