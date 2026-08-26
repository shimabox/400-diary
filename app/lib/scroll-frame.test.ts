import { describe, expect, test } from 'vitest'
import { computeContentExtent, hasContentBeyondLeft } from './scroll-frame'

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

describe('computeContentExtent', () => {
  test('本文も画像も無ければ 0', () => {
    expect(computeContentExtent(1000, [])).toBe(0)
  })

  test('最も左にある要素の左端までの距離になる', () => {
    expect(computeContentExtent(1000, [900, 296, 500])).toBe(704)
  })

  test('用紙の右端より右にある要素は 0 として扱う', () => {
    expect(computeContentExtent(1000, [1200])).toBe(0)
  })

  test('キャンバス拡張で用紙の左端より左に列があればその分も含む', () => {
    expect(computeContentExtent(1000, [-140])).toBe(1140)
  })
})
