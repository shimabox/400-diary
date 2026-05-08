const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

/** "2025-02-14" → "2025/2/14 (金)" */
export function formatDiaryDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const weekday = WEEKDAYS[date.getDay()]
  return `${year}/${month}/${day} (${weekday})`
}

/**
 * Date を YYYY-MM-DD 形式で返す（JST 基準）。
 * Cloudflare Workers は UTC で動くため、timeZone を明示しないと
 * 日本時間の深夜帯で前日扱いになる。
 */
export function toLocalDateString(date: Date = new Date()): string {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}
