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

// キャッチアップ取得1回あたりの上限。GET /api/diaries の limit クランプ上限（100）に合わせる。
// これを超える不足（101件以上深いスクロール位置からの復帰）は打ち切ってよい前提
// （現実のデータ規模では起きない）。
const CATCH_UP_MAX_LIMIT = 100

/**
 * SPA 遷移から戻った直後のキャッチアップ取得で使う limit を計算する。
 *
 * savedCount（遷移前に読み込み済みだった件数）が currentItemCount（戻った直後、
 * SSR 由来で今読み込まれている件数）より多い場合にだけ、その差分をキャッチアップ取得する。
 * - 不足が無い（savedCount <= currentItemCount）: null（取得不要、クランプ位置のままでよい）
 * - cursor が null（サーバー側で既に打ち止め）: null（これ以上取得できるページが無い）
 * - 不足が CATCH_UP_MAX_LIMIT を超える: CATCH_UP_MAX_LIMIT にクランプ（打ち切ってよい）
 */
export function computeCatchUpLimit(
  savedCount: number,
  currentItemCount: number,
  cursor: DiaryListCursor,
): number | null {
  if (cursor === null) return null
  const deficit = savedCount - currentItemCount
  if (deficit <= 0) return null
  return Math.min(CATCH_UP_MAX_LIMIT, deficit)
}
