import type { Diary } from './db'

export type ExportFile = {
  filename: string
  content: string
}

/** YAML の flow scalar として安全な二重引用符付き文字列にする（# や : などの特殊文字対策） */
function yamlQuote(value: string): string {
  return JSON.stringify(value)
}

/**
 * 1件の Diary を frontmatter 付き markdown に変換する。
 * 本文は常に diaries.body（現行値）を正とする。下書きも公開済みも同じロジックで、
 * 公開スナップショットの本文は使わない（エクスポートは「今の自分のデータ」を対象とするため）。
 */
function diaryToMarkdown(diary: Diary): string {
  const lines: string[] = ['---', `date: ${yamlQuote(diary.diary_date)}`]

  if (diary.mood !== null) {
    lines.push(`mood: ${yamlQuote(diary.mood)}`)
  }

  // published_snapshot_id が無い = 未公開（下書き）
  const isDraft = diary.published_snapshot_id === null
  lines.push(`draft: ${isDraft}`)

  lines.push(`background_color: ${yamlQuote(diary.background_color)}`)

  if (diary.image_key !== null) {
    lines.push(`image_key: ${yamlQuote(diary.image_key)}`)
  }

  lines.push('---', '', diary.body)

  return lines.join('\n')
}

/**
 * ファイル名: diary_date ベースの YYYY-MM-DD.md。同日に複数件ある場合は
 * 日付昇順・id昇順で2件目以降を YYYY-MM-DD-2.md, YYYY-MM-DD-3.md ... と採番する。
 * 呼び出し元（listAllDiaries）は既にこの順で返す前提だが、純関数として単体でも
 * 正しく動くよう、ここでも同じ基準でソートし直す。
 */
export function buildExportFiles(diaries: Diary[]): ExportFile[] {
  const sorted = [...diaries].sort((a, b) => {
    if (a.diary_date !== b.diary_date) {
      return a.diary_date < b.diary_date ? -1 : 1
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  const countByDate = new Map<string, number>()

  return sorted.map((diary) => {
    const seq = (countByDate.get(diary.diary_date) ?? 0) + 1
    countByDate.set(diary.diary_date, seq)

    const filename =
      seq === 1 ? `${diary.diary_date}.md` : `${diary.diary_date}-${seq}.md`

    return { filename, content: diaryToMarkdown(diary) }
  })
}
