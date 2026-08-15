import type { LayoutCursor } from '@chenglou/pretext'
import {
  computeExtendedSlots,
  type DateRect,
  type ObstacleRect,
  type Slot,
} from './layout'

export type FlowSegment = {
  text: string
} & Slot

/**
 * 1スロットぶんのテキストを取り出す関数。FlowText では pretext の
 * layoutNextLine（canvas 計測が必要）を渡し、テストでは決定的な
 * フェイクを渡せるよう注入にしている。
 */
export type LayoutLine = (
  cursor: LayoutCursor,
  maxHeight: number,
) => { text: string; end: LayoutCursor } | null

/**
 * スロットにテキストを流し込み、全文が収まらなければ収まるまで列を
 * 左へ追加してキャンバス幅を拡張する（FlowText から切り出した純ロジック）。
 *
 * 返り値の extraWidth は拡張量（px）。truncated が true の場合は安全弁に
 * 到達して全文を配置できておらず、segments は部分結果。
 */
export function flowTextWithExtension(
  text: string,
  containerSize: { width: number; height: number },
  fontSize: number,
  lineHeight: number,
  obstacleRect: ObstacleRect,
  dateRect: DateRect | null,
  layoutLine: LayoutLine,
): { segments: FlowSegment[]; extraWidth: number; truncated: boolean } {
  // 無限ループ保険。1スロットには最低1文字置けるため「文字数 + 改行数」が
  // 必要スロット数の真の上限になる。改行は1つで列を1本消費し、語単位の
  // 折返しがあるため文字数ベースの列容量見積もりは上限にならない。
  // 全文が収まる幅には必ず到達するので、成功条件は exhausted のみ
  const lineBreaks = (text.match(/\n/g) ?? []).length
  const maxExtraCols = text.length + lineBreaks + 1

  for (let extraCols = 0; ; extraCols++) {
    const { slots, delta } = computeExtendedSlots(
      containerSize,
      fontSize,
      lineHeight,
      obstacleRect,
      extraCols,
      dateRect,
    )

    const result: FlowSegment[] = []
    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
    for (const slot of slots) {
      const line = layoutLine(cursor, slot.height)
      if (!line) break
      result.push({ text: line.text, ...slot })
      cursor = line.end
    }
    // 残りテキストが無ければ全文が収まっている
    const exhausted = layoutLine(cursor, containerSize.height) === null

    if (exhausted) {
      return { segments: result, extraWidth: delta, truncated: false }
    }
    // ここに来るのは「1スロット最低1文字」の不変条件が崩れたときだけ。
    // 描画を止めるより部分結果を出す方が読者にはましなので返しはするが、
    // 正常結果と区別できるよう truncated を立てて呼び出し側に検知させる
    if (extraCols >= maxExtraCols) {
      return { segments: result, extraWidth: delta, truncated: true }
    }
  }
}
