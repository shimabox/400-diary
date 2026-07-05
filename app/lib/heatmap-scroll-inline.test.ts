import { describe, expect, test } from 'vitest'
import {
  HEATMAP_SCROLL_INLINE_SCRIPT,
  HEATMAP_SCROLL_INLINE_SCRIPT_HASH,
} from './heatmap-scroll-inline'

describe('HEATMAP_SCROLL_INLINE_SCRIPT_HASH', () => {
  test('スクリプト本体の SHA-256 とハッシュ定数が一致する', async () => {
    // スクリプトを変更したのにハッシュを更新し忘れると、本番では CSP に
    // ブロックされて静かに壊れる。ここで再計算して不一致を CI で検知する。
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(HEATMAP_SCROLL_INLINE_SCRIPT),
    )
    const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
    const expected = `'sha256-${base64}'`

    expect(HEATMAP_SCROLL_INLINE_SCRIPT_HASH).toBe(expected)
  })
})
