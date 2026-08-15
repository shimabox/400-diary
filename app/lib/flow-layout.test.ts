import { describe, expect, it } from 'vitest'
import { flowTextWithExtension, type LayoutLine } from './flow-layout'

// 実際のキャンバスと同じ寸法（DiaryScrollFrame 参照）
const container = { width: 880, height: 416 }
const fontSize = 17.6
const lineHeight = 2

/**
 * pretext の layoutNextLine を模した決定的なフェイク。
 * 1文字 = fontSize の高さで縦に積み、改行が来たらそこで列を終える。
 * テキストを消費し尽くしたら null を返す（pretext と同じ契約）。
 */
function makeCharLayouter(text: string): LayoutLine {
  return (cursor, maxHeight) => {
    let pos = cursor.segmentIndex
    if (pos >= text.length) return null
    const capacity = Math.floor(maxHeight / fontSize)
    let consumed = ''
    while (pos < text.length && consumed.length < capacity) {
      const ch = text[pos]
      pos++
      if (ch === '\n') break
      consumed += ch
    }
    return { text: consumed, end: { segmentIndex: pos, graphemeIndex: 0 } }
  }
}

describe('flowTextWithExtension', () => {
  it('障害物が無ければ拡張せず全文を流し込む', () => {
    const text = 'あ'.repeat(400)
    const { segments, extraWidth } = flowTextWithExtension(
      text,
      container,
      fontSize,
      lineHeight,
      { x: 0, y: 0, width: 0, height: 0 },
      null,
      makeCharLayouter(text),
    )

    expect(segments.map((s) => s.text).join('')).toBe(text)
    expect(extraWidth).toBe(0)
  })

  it('改行の多い本文＋最大サイズの画像でも末尾まで文字が欠けない', () => {
    // 正方形画像を150%にした最悪ケース: 384×384 の障害物が列の上下を
    // ほぼ塞ぎ、重なる列はスロットを1つも作れない（下の空きが1文字未満）
    const obstacle = { x: 0, y: 0, width: 384, height: 384 }
    // 1行1〜2文字 × 20行。強制改行が1つで列を1本消費するため、
    // 文字数ベースの容量見積もり（旧安全弁）では上限が小さすぎて
    // 末尾の複数行が黙って捨てられていた回帰ケース
    const text = `${'あ\n'.repeat(19)}あ`

    const { segments, extraWidth } = flowTextWithExtension(
      text,
      container,
      fontSize,
      lineHeight,
      obstacle,
      null,
      makeCharLayouter(text),
    )

    // 20行すべてが配置され、残りが無いこと
    expect(segments).toHaveLength(20)
    expect(segments.map((s) => s.text).join('')).toBe('あ'.repeat(20))
    // 全文を収めるために幅が拡張されていること
    expect(extraWidth).toBeGreaterThan(0)
  })

  it('拡張しても収まらない場合は上限で打ち切って部分結果を返す', () => {
    // layoutLine が常にテキストを残す（進捗しない）異常系でも
    // 無限ループせず、それまでの結果を返す
    const text = 'あああ'
    const stuck: LayoutLine = (cursor) => ({
      text: '',
      end: cursor,
    })

    const { segments } = flowTextWithExtension(
      text,
      container,
      fontSize,
      lineHeight,
      { x: 0, y: 0, width: 0, height: 0 },
      null,
      stuck,
    )

    expect(Array.isArray(segments)).toBe(true)
  })
})
