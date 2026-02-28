const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const

/** "2025-02-14" → "2025年 2月14日（金）" */
export function formatDiaryDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const weekday = WEEKDAYS[date.getDay()]
  return `${year}/${month}/${day} (${weekday})`
}
