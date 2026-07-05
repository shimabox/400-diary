import type { DiaryCard, DiaryListCursor } from './diary-cards'

/** GET /api/diaries のクエリ文字列を組み立てる（カーソル指定時のみ before_* を付与） */
export function buildDiaryListRequestUrl(
  cursor: DiaryListCursor,
  limit: number,
): string {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) {
    params.set('before_date', cursor.before_date)
    params.set('before_id', cursor.before_id)
  }
  return `/api/diaries?${params.toString()}`
}

/**
 * 取得済みリストに新しいページを追記する。
 * fetch の多重発火やリトライで同じ id が重複して届く可能性があるため、
 * 既存 id は除外してから連結する。
 */
export function appendDiaryPage(
  current: DiaryCard[],
  incoming: DiaryCard[],
): DiaryCard[] {
  const existingIds = new Set(current.map((item) => item.id))
  const deduped = incoming.filter((item) => !existingIds.has(item.id))
  return [...current, ...deduped]
}

/** サーバーが返した next が null なら打ち止め（以降フェッチしない） */
export function hasNextPage(next: DiaryListCursor): boolean {
  return next !== null
}
