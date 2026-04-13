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

/** 文字数と列数の両方をグリッドに収まるよう切り詰める */
export function trimToGrid(text: string): string {
  let trimmed = text.slice(0, MAX_BODY_LENGTH)
  while (trimmed.length > 0 && countColumns(trimmed) > COLS) {
    trimmed = trimmed.slice(0, -1)
  }
  return trimmed
}
