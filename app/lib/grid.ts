import { MAX_BODY_LENGTH } from './constants'

export const COLS = Math.sqrt(MAX_BODY_LENGTH)
export const ROWS = COLS

/** テキストが使う列数を計算する（改行で列が進む） */
export function countColumns(text: string): number {
  if (text.length === 0) return 0
  return text
    .split('\n')
    .reduce(
      (cols, line) => cols + Math.max(1, Math.ceil(line.length / ROWS)),
      0,
    )
}

/**
 * テキストが消費するマス数を計算する。
 * 改行で閉じられた行は、末尾の空きマスも含めて列単位（ceil(len/ROWS) 列 × ROWS マス）で
 * 消費済みと数える（原稿用紙で改行すると行の残りマスが使えなくなるのと同じ）。
 * 空行も1列（ROWS マス）を丸ごと消費する。
 * 最終行（まだ改行で閉じられていない行）だけは実際の文字数分のみ消費する。
 *
 * カウンターを文字数（body.length）で表示すると「文字数は余っているのに
 * 列を使い切って入力できない」という混乱が起きるため、表示にはこの値を使う。
 */
export function countUsedCells(text: string): number {
  if (text.length === 0) return 0
  const lines = text.split('\n')
  const openLine = lines.pop() ?? ''
  const closedCells = lines.reduce(
    (cells, line) => cells + Math.max(1, Math.ceil(line.length / ROWS)) * ROWS,
    0,
  )
  return closedCells + openLine.length
}

/** 文字数と列数の両方をグリッドに収まるよう切り詰める */
export function trimToGrid(text: string): string {
  let trimmed = text.slice(0, MAX_BODY_LENGTH)
  while (trimmed.length > 0 && countColumns(trimmed) > COLS) {
    trimmed = trimmed.slice(0, -1)
  }
  return trimmed
}

/**
 * 選択範囲へテキストを挿入し、グリッド制約で切り詰めた結果と
 * 挿入直後に置くべきカーソル位置を返す。
 */
export function insertAtSelection(
  prev: string,
  insert: string,
  start: number,
  end: number,
): { text: string; caret: number } {
  const clampedStart = Math.max(0, Math.min(start, prev.length))
  const clampedEnd = Math.max(clampedStart, Math.min(end, prev.length))
  const combined = prev.slice(0, clampedStart) + insert + prev.slice(clampedEnd)
  const trimmed = trimToGrid(combined)
  const caret = Math.min(clampedStart + insert.length, trimmed.length)
  return { text: trimmed, caret }
}
