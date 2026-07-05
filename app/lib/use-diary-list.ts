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

// diary-list island がセッション中の一覧スクロール状態（読み込み済み件数と scrollLeft）を
// 保存する sessionStorage のキー。history.state ベースの復元（popstate 専用）と異なり、
// 同一タブ内であればヘッダーリンク等の前進ナビゲーションで戻っても復元できるようにするため
// タブスコープの sessionStorage を使う。
export const SCROLL_STORAGE_KEY = 'diary-list-scroll'

export type ScrollRestoreState = {
  /** 保存時点で読み込み済みだった件数（items.length） */
  count: number
  /** 保存時点の scrollLeft */
  x: number
}

/**
 * sessionStorage から読み出した生の文字列（未パース）を ScrollRestoreState に変換する。
 * JSON として壊れている、形式が想定と異なる（count が有限数でない/x が数値でない）場合は
 * すべて null を返し、呼び出し側は「保存データなし」として扱う。
 * 旧バージョンが保存した将来のフォーマット変更や、手動で書き換えられた値からも
 * 安全側に倒すためのガード。
 */
export function parseScrollRestoreState(
  raw: string | null,
): ScrollRestoreState | null {
  if (raw === null) return null

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }

  if (!value || typeof value !== 'object') return null
  const v = value as Partial<ScrollRestoreState>
  if (!Number.isFinite(v.count) || typeof v.x !== 'number') return null

  return { count: v.count as number, x: v.x }
}

/**
 * キャッチアップ復元に使う状態（読み込み済み件数と scrollLeft）を、history.state 由来
 * （popstate 復帰）と sessionStorage 由来（同一タブ内の前進ナビゲーション復帰）のどちらから
 * 採用するか決める。
 *
 * history.state に count が入っているのは popstate で戻ってきた場合のみ（PR #56 時点の
 * 挙動）なので、それがあれば従来通り最優先で使う（挙動変更なし）。無い場合
 * （初回訪問、または history.state はあっても count が無い旧形式/非対応コンテナ）は
 * sessionStorage 側の値にフォールバックする。両方無ければ null（何もしない＝初回訪問）。
 */
export function resolveCatchUpSource(
  historyState: { x: number; count?: number } | null,
  sessionState: ScrollRestoreState | null,
): ScrollRestoreState | null {
  if (historyState && historyState.count !== undefined) {
    return { count: historyState.count, x: historyState.x }
  }
  return sessionState
}
