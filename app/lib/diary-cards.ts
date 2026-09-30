import type { DiaryWithPublished } from './db'

/**
 * 一覧カード表示用に正規化した DTO。
 * snapshot_* などの生フィールドを island props / API レスポンスにそのまま渡さないことで、
 * 未認証時に下書きデータが混入する事故を構造的に防ぐ。
 */
export type DiaryCard = {
  id: string
  diary_date: string
  body: string
  background_color: string
  is_draft: boolean
  has_unpublished_changes: boolean
  speech: CardSpeech
}

/**
 * 一覧カードの「声」ラベルの状態。
 * - 'public': 公開ページで誰でも声で聞ける
 * - 'private': 音声はあるが訪問者には出していない（書き手にだけ見せる）
 * - null: 音声が無い
 */
export type CardSpeech = 'public' | 'private' | null

export type DiaryListCursor = { before_date: string; before_id: string } | null

export type DiaryListPage = {
  items: DiaryCard[]
  next: DiaryListCursor
}

/**
 * DiaryWithPublished 行を DiaryCard に正規化する。
 * 未認証時は publishedOnly のクエリ結果が渡される前提だが、防御的に
 * snapshot が無い行（= 未公開）は throw ではなく null を返して除外できるようにする。
 */
export function toDiaryCard(
  row: DiaryWithPublished,
  isAuthenticated: boolean,
): DiaryCard | null {
  if (!isAuthenticated && !row.published_snapshot_id) {
    return null
  }

  const body = row.snapshot_body ?? row.body
  const backgroundColor = row.snapshot_background_color ?? row.background_color
  const isDraft = isAuthenticated && !row.published_snapshot_id

  // 「未公開の変更」バッジ判定。index.tsx にあった下書きとスナップショットのフィールド比較を移植。
  const hasUnpublishedChanges =
    isAuthenticated &&
    !!row.published_snapshot_id &&
    (row.body !== row.snapshot_body ||
      row.background_color !== row.snapshot_background_color ||
      row.image_key !== row.snapshot_image_key ||
      row.image_layout !== row.snapshot_image_layout ||
      row.image_x !== row.snapshot_image_x ||
      row.image_y !== row.snapshot_image_y ||
      // image_scale の null は 1.0、image_rotation の null は 0 と表示上等価のため、
      // 正規化してから比較する (見た目が同じ組み合わせを変更扱いにしない)
      (row.image_scale ?? 1) !== (row.snapshot_image_scale ?? 1) ||
      (row.image_rotation ?? 0) !== (row.snapshot_image_rotation ?? 0) ||
      row.mood !== row.snapshot_mood ||
      // 「訪問者も声で聞ける」も公開したときに反映される設定なので差分に含める
      row.speech_public !== (row.snapshot_speech_public ?? 0))

  return {
    id: row.id,
    diary_date: row.diary_date,
    body,
    background_color: backgroundColor,
    is_draft: isDraft,
    has_unpublished_changes: hasUnpublishedChanges,
    speech: toCardSpeech(row, isAuthenticated),
  }
}

/**
 * 一覧カードの「声」ラベルの状態を決める。
 * 'public' は公開ページに「声で聞く」が出る条件（公開版に音声があり speech_public = 1）と揃える。
 * 未認証時は 'private' を返さない。下書きの音声や非公開の設定の有無を訪問者に漏らさないため。
 */
export function toCardSpeech(
  row: Pick<
    DiaryWithPublished,
    'speech_key' | 'snapshot_speech_key' | 'snapshot_speech_public'
  >,
  isAuthenticated: boolean,
): CardSpeech {
  if (row.snapshot_speech_key && row.snapshot_speech_public === 1) {
    return 'public'
  }
  if (!isAuthenticated) return null
  return row.speech_key || row.snapshot_speech_key ? 'private' : null
}

/**
 * listDiariesPage の1ページ分の行を DiaryCard 配列 + next カーソルに変換する。
 * index.tsx (SSR) と GET /api/diaries の両方から使う共通ロジック。
 * next は「取得件数 == limit」のときのみ最終行から生成する（それ未満なら打ち止め）。
 */
export function toDiaryListPage(
  rows: DiaryWithPublished[],
  isAuthenticated: boolean,
  limit: number,
): DiaryListPage {
  const items = rows
    .map((row) => toDiaryCard(row, isAuthenticated))
    .filter((card): card is DiaryCard => card !== null)

  const lastRow = rows.at(-1)
  const next: DiaryListCursor =
    rows.length === limit && lastRow
      ? { before_date: lastRow.diary_date, before_id: lastRow.id }
      : null

  return { items, next }
}
