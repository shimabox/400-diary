import type { D1Database } from '@cloudflare/workers-types/latest'
import { nanoid } from 'nanoid'

export type Diary = {
  id: string
  body: string
  image_key: string | null
  image_layout: 'left' | 'right'
  image_x: number | null
  image_y: number | null
  image_scale: number | null
  background_color: string
  mood: string | null
  diary_date: string
  published_snapshot_id: string | null
  created_at: string
  updated_at: string
}

export type DiarySnapshot = {
  id: string
  diary_id: string
  body: string
  image_key: string | null
  image_layout: 'left' | 'right'
  image_x: number | null
  image_y: number | null
  image_scale: number | null
  background_color: string
  mood: string | null
  published_at: string
}

/** 一覧表示用: 下書き + 公開情報 */
export type DiaryWithPublished = Diary & {
  published_at: string | null
  snapshot_body: string | null
  snapshot_background_color: string | null
  snapshot_image_key: string | null
  snapshot_image_layout: string | null
  snapshot_image_x: number | null
  snapshot_image_y: number | null
  snapshot_image_scale: number | null
  snapshot_mood: string | null
}

/** 公開ページ用: diary + snapshot */
export type DiaryWithSnapshot = Diary & {
  snapshot: DiarySnapshot
}

export type PublishedFeedItem = {
  id: string
  diary_date: string
  body: string
  published_at: string
}

export async function createDiary(
  db: D1Database,
  params: {
    body: string
    diary_date: string
    background_color: string
    image_layout?: 'left' | 'right'
    mood?: string | null
    image_x?: number | null
    image_y?: number | null
    image_scale?: number | null
  },
): Promise<Diary> {
  const id = nanoid(12)
  const {
    body,
    diary_date,
    background_color,
    image_layout,
    mood,
    image_x,
    image_y,
    image_scale,
  } = params

  await db
    .prepare(
      `INSERT INTO diaries (id, body, background_color, image_layout, mood, diary_date, image_x, image_y, image_scale)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      body,
      background_color,
      image_layout ?? 'left',
      mood ?? null,
      diary_date,
      image_x ?? null,
      image_y ?? null,
      image_scale ?? null,
    )
    .run()

  return (await getDiary(db, id))!
}

export async function getDiary(
  db: D1Database,
  id: string,
): Promise<Diary | null> {
  return await db
    .prepare(
      `SELECT id, body, image_key, image_layout, image_x, image_y, image_scale, background_color, mood,
              diary_date, published_snapshot_id, created_at, updated_at
       FROM diaries
       WHERE id = ?`,
    )
    .bind(id)
    .first<Diary>()
}

export type DiaryPageCursor = { diaryDate: string; id: string }

/**
 * 一覧用: keyset pagination で1ページ分を取得する。
 * OFFSET 方式ではなく (diary_date, id) を境界にするのは、データ増加時に
 * ページが深くなるほど OFFSET 分の行を読み捨てるコストが線形に増えるのを避けるため。
 * 同日に複数件あり得るため id をタイブレークに使う（nanoid なので意味順ではないが、
 * 一意で安定していればカーソルとして十分）。
 */
export async function listDiariesPage(
  db: D1Database,
  params: {
    limit: number
    before?: DiaryPageCursor
    publishedOnly: boolean
  },
): Promise<DiaryWithPublished[]> {
  const { limit, before, publishedOnly } = params

  const conditions: string[] = []
  const values: unknown[] = []
  if (publishedOnly) {
    conditions.push('d.published_snapshot_id IS NOT NULL')
  }
  if (before) {
    conditions.push('(d.diary_date < ? OR (d.diary_date = ? AND d.id < ?))')
    values.push(before.diaryDate, before.diaryDate, before.id)
  }
  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const { results } = await db
    .prepare(
      `SELECT d.id, d.body, d.image_key, d.image_layout, d.image_x, d.image_y, d.image_scale,
              d.background_color, d.mood, d.diary_date, d.published_snapshot_id,
              d.created_at, d.updated_at,
              s.published_at,
              s.body AS snapshot_body,
              s.background_color AS snapshot_background_color,
              s.image_key AS snapshot_image_key,
              s.image_layout AS snapshot_image_layout,
              s.image_x AS snapshot_image_x,
              s.image_y AS snapshot_image_y,
              s.image_scale AS snapshot_image_scale,
              s.mood AS snapshot_mood
       FROM diaries d
       LEFT JOIN diary_snapshots s ON d.published_snapshot_id = s.id
       ${whereClause}
       ORDER BY d.diary_date DESC, d.id DESC
       LIMIT ?`,
    )
    .bind(...values, limit)
    .all<DiaryWithPublished>()
  return results
}

/** カレンダーの minYear/maxYear 導出用: 一覧に含まれる日付の範囲を取得する */
export async function getDiaryDateRange(
  db: D1Database,
  publishedOnly: boolean,
): Promise<{ min: string; max: string } | null> {
  const whereClause = publishedOnly
    ? 'WHERE published_snapshot_id IS NOT NULL'
    : ''
  const result = await db
    .prepare(
      `SELECT MIN(diary_date) AS min, MAX(diary_date) AS max FROM diaries ${whereClause}`,
    )
    .first<{ min: string | null; max: string | null }>()
  if (!result || result.min === null || result.max === null) return null
  return { min: result.min, max: result.max }
}

/** RSS用: 公開中の snapshot のみを日記の日付順で取得 */
export async function listPublishedFeedItems(
  db: D1Database,
  limit = 20,
): Promise<PublishedFeedItem[]> {
  const { results } = await db
    .prepare(
      `SELECT d.id, d.diary_date, s.body, s.published_at
       FROM diaries d
       JOIN diary_snapshots s ON d.published_snapshot_id = s.id
       ORDER BY d.diary_date DESC, s.published_at DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<PublishedFeedItem>()
  return results
}

export async function updateDiary(
  db: D1Database,
  id: string,
  params: {
    body?: string
    diary_date?: string
    background_color?: string
    image_layout?: 'left' | 'right'
    mood?: string | null
    image_key?: string | null
    image_x?: number | null
    image_y?: number | null
    image_scale?: number | null
  },
): Promise<Diary | null> {
  const existing = await getDiary(db, id)
  if (!existing) return null

  const setClauses: string[] = ["updated_at = datetime('now')"]
  const values: unknown[] = []

  if (params.body !== undefined) {
    setClauses.push('body = ?')
    values.push(params.body)
  }
  if (params.diary_date !== undefined) {
    setClauses.push('diary_date = ?')
    values.push(params.diary_date)
  }
  if (params.background_color !== undefined) {
    setClauses.push('background_color = ?')
    values.push(params.background_color)
  }
  if (params.image_layout !== undefined) {
    setClauses.push('image_layout = ?')
    values.push(params.image_layout)
  }
  if ('mood' in params) {
    setClauses.push('mood = ?')
    values.push(params.mood ?? null)
  }
  if ('image_key' in params) {
    setClauses.push('image_key = ?')
    values.push(params.image_key ?? null)
  }
  if ('image_x' in params) {
    setClauses.push('image_x = ?')
    values.push(params.image_x ?? null)
  }
  if ('image_y' in params) {
    setClauses.push('image_y = ?')
    values.push(params.image_y ?? null)
  }
  if ('image_scale' in params) {
    setClauses.push('image_scale = ?')
    values.push(params.image_scale ?? null)
  }

  values.push(id)

  await db
    .prepare(`UPDATE diaries SET ${setClauses.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run()

  return await getDiary(db, id)
}

/** 公開: diaries の現在の値を diary_snapshots に INSERT し、published_snapshot_id を更新 */
export async function publishDiary(
  db: D1Database,
  id: string,
): Promise<DiarySnapshot | null> {
  const diary = await getDiary(db, id)
  if (!diary) return null

  const snapshotId = nanoid(12)

  // snapshot の INSERT と published_snapshot_id の UPDATE を batch（D1 の暗黙トランザクション）で
  // 原子的に実行する。個別に run() すると 1 文目成功・2 文目失敗でどこからも参照されない
  // 孤児 snapshot が残り得るため。
  await db.batch([
    db
      .prepare(
        `INSERT INTO diary_snapshots (id, diary_id, body, image_key, image_layout, image_x, image_y, image_scale, background_color, mood)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        snapshotId,
        id,
        diary.body,
        diary.image_key,
        diary.image_layout,
        diary.image_x,
        diary.image_y,
        diary.image_scale,
        diary.background_color,
        diary.mood,
      ),
    db
      .prepare(
        "UPDATE diaries SET published_snapshot_id = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .bind(snapshotId, id),
  ])

  return await db
    .prepare(
      `SELECT id, diary_id, body, image_key, image_layout, image_x, image_y, image_scale,
              background_color, mood, published_at
       FROM diary_snapshots
       WHERE id = ?`,
    )
    .bind(snapshotId)
    .first<DiarySnapshot>()
}

/** 編集ページ用: diary + published_at を取得 */
export async function getDiaryWithPublished(
  db: D1Database,
  id: string,
): Promise<DiaryWithPublished | null> {
  return await db
    .prepare(
      `SELECT d.id, d.body, d.image_key, d.image_layout, d.image_x, d.image_y, d.image_scale,
              d.background_color, d.mood, d.diary_date, d.published_snapshot_id,
              d.created_at, d.updated_at,
              s.published_at,
              s.body AS snapshot_body,
              s.background_color AS snapshot_background_color,
              s.image_key AS snapshot_image_key,
              s.image_layout AS snapshot_image_layout,
              s.image_x AS snapshot_image_x,
              s.image_y AS snapshot_image_y,
              s.image_scale AS snapshot_image_scale,
              s.mood AS snapshot_mood
       FROM diaries d
       LEFT JOIN diary_snapshots s ON d.published_snapshot_id = s.id
       WHERE d.id = ?`,
    )
    .bind(id)
    .first<DiaryWithPublished>()
}

/** 公開ページ用: diary + 公開中の snapshot を取得 */
export async function getDiaryWithSnapshot(
  db: D1Database,
  id: string,
): Promise<DiaryWithSnapshot | null> {
  const diary = await getDiary(db, id)
  if (!diary || !diary.published_snapshot_id) return null

  const snapshot = await db
    .prepare(
      `SELECT id, diary_id, body, image_key, image_layout, image_x, image_y, image_scale,
              background_color, mood, published_at
       FROM diary_snapshots
       WHERE id = ?`,
    )
    .bind(diary.published_snapshot_id)
    .first<DiarySnapshot>()

  if (!snapshot) return null

  return { ...diary, snapshot }
}

/** カレンダー用 */
export async function listDiaryCalendarEntries(
  db: D1Database,
  year: number,
): Promise<{ id: string; diary_date: string; mood: string | null }[]> {
  const { results } = await db
    .prepare(
      'SELECT id, diary_date, mood FROM diaries WHERE diary_date >= ? AND diary_date < ? ORDER BY diary_date',
    )
    .bind(`${year}-01-01`, `${year + 1}-01-01`)
    .all<{ id: string; diary_date: string; mood: string | null }>()
  return results
}

/** カレンダー用（未認証: 公開済みのみ、snapshot の mood を使用） */
export async function listPublishedCalendarEntries(
  db: D1Database,
  year: number,
): Promise<{ id: string; diary_date: string; mood: string | null }[]> {
  const { results } = await db
    .prepare(
      `SELECT d.id, d.diary_date, s.mood
       FROM diaries d
       JOIN diary_snapshots s ON d.published_snapshot_id = s.id
       WHERE d.diary_date >= ? AND d.diary_date < ?
       ORDER BY d.diary_date`,
    )
    .bind(`${year}-01-01`, `${year + 1}-01-01`)
    .all<{ id: string; diary_date: string; mood: string | null }>()
  return results
}

/** image_key を参照している snapshot 件数を返す（R2 孤児判定用） */
export async function countSnapshotsWithImageKey(
  db: D1Database,
  imageKey: string,
): Promise<number> {
  const result = await db
    .prepare(
      'SELECT COUNT(*) AS count FROM diary_snapshots WHERE image_key = ?',
    )
    .bind(imageKey)
    .first<{ count: number }>()
  return result?.count ?? 0
}

/** diary に紐づく全 snapshot の image_key を取得（削除時に R2 からも消すため） */
export async function listSnapshotImageKeys(
  db: D1Database,
  diaryId: string,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      'SELECT DISTINCT image_key FROM diary_snapshots WHERE diary_id = ? AND image_key IS NOT NULL',
    )
    .bind(diaryId)
    .all<{ image_key: string }>()
  return results.map((r) => r.image_key)
}

/** エクスポート用: 全日記を日付昇順で取得（JOIN 不要、下書き・本文は diaries の現行値をそのまま返す） */
export async function listAllDiaries(db: D1Database): Promise<Diary[]> {
  const { results } = await db
    .prepare(
      `SELECT id, body, image_key, image_layout, image_x, image_y, image_scale, background_color, mood,
              diary_date, published_snapshot_id, created_at, updated_at
       FROM diaries
       ORDER BY diary_date ASC, id ASC`,
    )
    .all<Diary>()
  return results
}

export async function deleteDiary(
  db: D1Database,
  id: string,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM diaries WHERE id = ?')
    .bind(id)
    .run()
  return result.meta.changes > 0
}
