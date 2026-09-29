import type { D1Database } from '@cloudflare/workers-types/latest'
import { nanoid } from 'nanoid'
import { expectedSpeechKey } from './speech'

export type Diary = {
  id: string
  body: string
  image_key: string | null
  image_layout: 'left' | 'right'
  image_x: number | null
  image_y: number | null
  image_scale: number | null
  image_rotation: number | null
  background_color: string
  mood: string | null
  /** 下書き側の読み上げ音声の R2 キー。最後に作った音声を指す */
  speech_key: string | null
  /** 訪問者も声で聞けるか（1 / 0）。公開したときにスナップショットへ写す */
  speech_public: number
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
  image_rotation: number | null
  background_color: string
  mood: string | null
  /** 公開中の読み上げ音声の R2 キー。本文・気分に合う音声が無ければ null */
  speech_key: string | null
  /** 公開時点の「訪問者も声で聞ける」（1 / 0） */
  speech_public: number
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
  snapshot_image_rotation: number | null
  snapshot_mood: string | null
  snapshot_speech_key: string | null
  snapshot_speech_public: number | null
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

export class DiaryDateConflictError extends Error {
  constructor(public readonly existingDiaryId: string | null) {
    super('この日の日記はすでにあります。日記は1日1つまでです。')
    this.name = 'DiaryDateConflictError'
  }
}

export async function getDiaryIdByDate(
  db: D1Database,
  date: string,
): Promise<string | null> {
  const diary = await db
    .prepare('SELECT id FROM diaries WHERE diary_date = ? LIMIT 1')
    .bind(date)
    .first<{ id: string }>()
  return diary?.id ?? null
}

async function rethrowDiaryWriteError(
  db: D1Database,
  date: string | undefined,
  error: unknown,
): Promise<never> {
  if (
    date !== undefined &&
    error instanceof Error &&
    error.message.includes('UNIQUE constraint failed: diaries.diary_date')
  ) {
    let existingDiaryId: string | null = null
    try {
      existingDiaryId = await getDiaryIdByDate(db, date)
    } catch {
      // リンク先を取得できなくても、書き込みが日付の重複で拒否されたことは確定している。
    }
    throw new DiaryDateConflictError(existingDiaryId)
  }
  throw error
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
    image_rotation?: number | null
    speech_public?: boolean
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
    image_rotation,
    speech_public,
  } = params

  await db
    .prepare(
      `INSERT INTO diaries (id, body, background_color, image_layout, mood, diary_date, image_x, image_y, image_scale, image_rotation, speech_public)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      image_rotation ?? null,
      speech_public ? 1 : 0,
    )
    .run()
    .catch((error: unknown) => rethrowDiaryWriteError(db, diary_date, error))

  return (await getDiary(db, id))!
}

export async function getDiary(
  db: D1Database,
  id: string,
): Promise<Diary | null> {
  return await db
    .prepare(
      `SELECT id, body, image_key, image_layout, image_x, image_y, image_scale, image_rotation, background_color, mood,
              speech_key, speech_public, diary_date, published_snapshot_id, created_at, updated_at
       FROM diaries
       WHERE id = ?`,
    )
    .bind(id)
    .first<Diary>()
}

export type DiaryPageCursor = { diaryDate: string; id: string }

/**
 * 一覧用: keyset pagination で1ページ分を取得する。
 * OFFSET 方式ではなく一意な diary_date を境界にするのは、データ増加時に
 * ページが深くなるほど OFFSET 分の行を読み捨てるコストが線形に増えるのを避けるため。
 * 既存のカーソル形式との互換性を保つため id も受け取るが、検索条件には使わない。
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
    conditions.push('d.diary_date < ?')
    values.push(before.diaryDate)
  }
  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const { results } = await db
    .prepare(
      `SELECT d.id, d.body, d.image_key, d.image_layout, d.image_x, d.image_y, d.image_scale, d.image_rotation,
              d.background_color, d.mood, d.speech_key, d.speech_public, d.diary_date, d.published_snapshot_id,
              d.created_at, d.updated_at,
              s.published_at,
              s.body AS snapshot_body,
              s.background_color AS snapshot_background_color,
              s.image_key AS snapshot_image_key,
              s.image_layout AS snapshot_image_layout,
              s.image_x AS snapshot_image_x,
              s.image_y AS snapshot_image_y,
              s.image_scale AS snapshot_image_scale,
              s.image_rotation AS snapshot_image_rotation,
              s.mood AS snapshot_mood,
              s.speech_key AS snapshot_speech_key,
              s.speech_public AS snapshot_speech_public
       FROM diaries d
       LEFT JOIN diary_snapshots s ON d.published_snapshot_id = s.id
       ${whereClause}
       ORDER BY d.diary_date DESC
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
    image_rotation?: number | null
    speech_public?: boolean
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
  if ('image_rotation' in params) {
    setClauses.push('image_rotation = ?')
    values.push(params.image_rotation ?? null)
  }
  if (params.speech_public !== undefined) {
    setClauses.push('speech_public = ?')
    values.push(params.speech_public ? 1 : 0)
  }

  values.push(id)

  await db
    .prepare(`UPDATE diaries SET ${setClauses.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run()
    .catch((error: unknown) =>
      rethrowDiaryWriteError(db, params.diary_date, error),
    )

  return await getDiary(db, id)
}

/**
 * 公開: diaries の現在の値を diary_snapshots に INSERT し、published_snapshot_id を更新。
 * 読み上げ音声は次の順で決める。
 * 1. 下書きの音声が保存済みの本文と気分に合う（期待キーと一致する）なら、それを写す
 * 2. そうでなく、直前の公開版の本文が今回と同じで音声があれば、その音声を引き継ぐ。
 *    気分や声 ID だけが変わった音声は話し方が前のままでも内容は正しいので、作り直すまで残す
 * 3. それ以外は NULL にして、内容の違う古い音声を公開しない
 * 声 ID が未設定で期待キーを計算できないときは 1 を飛ばす。
 */
export async function publishDiary(
  db: D1Database,
  id: string,
  options: { voiceId?: string } = {},
): Promise<DiarySnapshot | null> {
  const diary = await getDiary(db, id)
  if (!diary) return null

  const snapshotId = nanoid(12)
  const speechKey = await speechKeyToPublish(db, diary, options.voiceId)

  // snapshot の INSERT と published_snapshot_id の UPDATE を batch（D1 の暗黙トランザクション）で
  // 原子的に実行する。個別に run() すると 1 文目成功・2 文目失敗でどこからも参照されない
  // 孤児 snapshot が残り得るため。
  await db.batch([
    db
      .prepare(
        `INSERT INTO diary_snapshots (id, diary_id, body, image_key, image_layout, image_x, image_y, image_scale, image_rotation, background_color, mood, speech_key, speech_public)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        diary.image_rotation,
        diary.background_color,
        diary.mood,
        speechKey,
        diary.speech_public ? 1 : 0,
      ),
    db
      .prepare(
        "UPDATE diaries SET published_snapshot_id = ?, updated_at = datetime('now') WHERE id = ?",
      )
      .bind(snapshotId, id),
  ])

  return await db
    .prepare(
      `SELECT id, diary_id, body, image_key, image_layout, image_x, image_y, image_scale, image_rotation,
              background_color, mood, speech_key, speech_public, published_at
       FROM diary_snapshots
       WHERE id = ?`,
    )
    .bind(snapshotId)
    .first<DiarySnapshot>()
}

/** 公開するスナップショットへ写す speech_key（決め方は publishDiary を参照） */
async function speechKeyToPublish(
  db: D1Database,
  diary: Diary,
  voiceId: string | undefined,
): Promise<string | null> {
  if (
    diary.speech_key &&
    diary.speech_key === (await expectedSpeechKey(diary, voiceId))
  ) {
    return diary.speech_key
  }
  if (!diary.published_snapshot_id) return null

  const previous = await db
    .prepare('SELECT body, speech_key FROM diary_snapshots WHERE id = ?')
    .bind(diary.published_snapshot_id)
    .first<Pick<DiarySnapshot, 'body' | 'speech_key'>>()
  return previous?.body === diary.body ? previous.speech_key : null
}

/** 編集ページ用: diary + published_at を取得 */
export async function getDiaryWithPublished(
  db: D1Database,
  id: string,
): Promise<DiaryWithPublished | null> {
  return await db
    .prepare(
      `SELECT d.id, d.body, d.image_key, d.image_layout, d.image_x, d.image_y, d.image_scale, d.image_rotation,
              d.background_color, d.mood, d.speech_key, d.speech_public, d.diary_date, d.published_snapshot_id,
              d.created_at, d.updated_at,
              s.published_at,
              s.body AS snapshot_body,
              s.background_color AS snapshot_background_color,
              s.image_key AS snapshot_image_key,
              s.image_layout AS snapshot_image_layout,
              s.image_x AS snapshot_image_x,
              s.image_y AS snapshot_image_y,
              s.image_scale AS snapshot_image_scale,
              s.image_rotation AS snapshot_image_rotation,
              s.mood AS snapshot_mood,
              s.speech_key AS snapshot_speech_key,
              s.speech_public AS snapshot_speech_public
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
      `SELECT id, diary_id, body, image_key, image_layout, image_x, image_y, image_scale, image_rotation,
              background_color, mood, speech_key, speech_public, published_at
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

/**
 * 下書きの読み上げ音声のキーを記録する。保存 API からは書き換えさせず、
 * 音声の生成 API だけが呼ぶ。本文の編集ではないので updated_at は変えない。
 * 生成を始めたときの updated_at から変わっていれば（生成中に本文の保存や
 * 音声の削除があれば）記録せず false を返す。
 */
export async function setDiarySpeechKey(
  db: D1Database,
  id: string,
  speechKey: string,
  expectedUpdatedAt: string,
): Promise<boolean> {
  const result = await db
    .prepare(
      'UPDATE diaries SET speech_key = ? WHERE id = ? AND updated_at = ?',
    )
    .bind(speechKey, id, expectedUpdatedAt)
    .run()
  return result.meta.changes > 0
}

/**
 * 日記の読み上げ音声への参照を下書きとスナップショットの両方から外す。
 * R2 の音声を全削除するときに呼び、公開ページからもすぐに聞けなくする。
 * updated_at も進め、削除の前に始まっていた生成が後から音声を記録しないようにする。
 * updated_at はミリ秒まで書く。datetime('now') は秒単位なので、生成開始と同じ秒に
 * 削除すると値が変わらず、生成が削除した音声を記録し直してしまう。保存・公開が書く
 * 秒単位の値とも文字列として必ず異なるので、削除は生成の記録条件を必ず外す。
 */
export async function clearDiarySpeechKeys(
  db: D1Database,
  id: string,
): Promise<void> {
  await db.batch([
    db
      .prepare(
        "UPDATE diaries SET speech_key = NULL, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?",
      )
      .bind(id),
    db
      .prepare(
        'UPDATE diary_snapshots SET speech_key = NULL WHERE diary_id = ?',
      )
      .bind(id),
  ])
}

/**
 * 残しておく読み上げ音声のキー（下書きと公開中スナップショットが指すもの。最大 2 つ）。
 * それ以外の speech/{diaryId}/ 配下は使われていないので削除してよい。
 */
export async function listSpeechKeysInUse(
  db: D1Database,
  id: string,
): Promise<string[]> {
  const row = await db
    .prepare(
      `SELECT d.speech_key AS draft_key, s.speech_key AS published_key
       FROM diaries d
       LEFT JOIN diary_snapshots s ON d.published_snapshot_id = s.id
       WHERE d.id = ?`,
    )
    .bind(id)
    .first<{ draft_key: string | null; published_key: string | null }>()
  if (!row) return []
  return [row.draft_key, row.published_key].filter(
    (key): key is string => !!key,
  )
}

/** エクスポート用: 全日記を日付昇順で取得（JOIN 不要、下書き・本文は diaries の現行値をそのまま返す） */
export async function listAllDiaries(db: D1Database): Promise<Diary[]> {
  const { results } = await db
    .prepare(
      `SELECT id, body, image_key, image_layout, image_x, image_y, image_scale, image_rotation, background_color, mood,
              speech_key, speech_public, diary_date, published_snapshot_id, created_at, updated_at
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
