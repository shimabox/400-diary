/**
 * Range ヘッダの解釈結果。
 * - none: Range を使わず 200 で全体を返す（ヘッダなし・書式不正・複数範囲）
 * - range: 206 で start〜end（両端を含む）を返す
 * - unsatisfiable: 416 を返す（範囲がファイルの外）
 */
export type ParsedRange =
  | { type: 'none' }
  | { type: 'range'; start: number; end: number }
  | { type: 'unsatisfiable' }

const SINGLE_RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/

/**
 * 単一範囲の `bytes=a-b`・`bytes=a-`・`bytes=-n` だけを扱う。
 * Safari / iOS は `bytes=0-1` の確認から始め、206 が返らないと再生しないことがあるため、
 * 音声の配信で使う。複数範囲は multipart で返す必要があり音声の再生では使われないので、
 * 無視して全体を返す（RFC 9110 でサーバは Range を無視してよい）。
 */
export function parseRange(
  header: string | null | undefined,
  size: number,
): ParsedRange {
  if (!header) return { type: 'none' }
  const match = SINGLE_RANGE_PATTERN.exec(header.trim())
  if (!match) return { type: 'none' }

  const [, startText, endText] = match
  if (startText === '' && endText === '') return { type: 'none' }

  if (startText === '') {
    // bytes=-n: 末尾 n バイト
    const suffixLength = Number(endText)
    if (suffixLength === 0 || size === 0) return { type: 'unsatisfiable' }
    return {
      type: 'range',
      start: Math.max(0, size - suffixLength),
      end: size - 1,
    }
  }

  const start = Number(startText)
  if (endText !== '' && Number(endText) < start) return { type: 'none' }
  if (start >= size) return { type: 'unsatisfiable' }

  const end = endText === '' ? size - 1 : Math.min(Number(endText), size - 1)
  return { type: 'range', start, end }
}
