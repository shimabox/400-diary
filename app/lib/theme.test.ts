import { describe, expect, test } from 'vitest'
import { isTheme, THEME_INLINE_SCRIPT, THEME_INLINE_SCRIPT_HASH } from './theme'

describe('THEME_INLINE_SCRIPT_HASH', () => {
  test('スクリプト本体の SHA-256 とハッシュ定数が一致する', async () => {
    // スクリプトを変更したのにハッシュを更新し忘れると、本番では CSP に
    // ブロックされて保存した配色が初回描画に反映されなくなる。再計算して検知する
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(THEME_INLINE_SCRIPT),
    )
    const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
    expect(THEME_INLINE_SCRIPT_HASH).toBe(`'sha256-${base64}'`)
  })
})

describe('isTheme', () => {
  test("'light' と 'dark' だけを配色として認める", () => {
    expect(isTheme('light')).toBe(true)
    expect(isTheme('dark')).toBe(true)
    expect(isTheme('auto')).toBe(false)
    expect(isTheme(null)).toBe(false)
  })
})
