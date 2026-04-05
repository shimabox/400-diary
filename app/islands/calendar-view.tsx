import { useState } from 'hono/jsx'
import { getMoodByKey } from '../lib/mood'

type Entry = {
  id: string
  diary_date: string
  mood: string | null
}

type Props = {
  year: number
  entries: Entry[]
}

const MONTH_LABELS = [
  '1月',
  '2月',
  '3月',
  '4月',
  '5月',
  '6月',
  '7月',
  '8月',
  '9月',
  '10月',
  '11月',
  '12月',
]

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function formatDateKey(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

function getCellColor(entry: Entry | undefined): string {
  if (!entry) return '#ebedf0'
  const mood = getMoodByKey(entry.mood)
  if (mood) return mood.color
  return '#c6e48b'
}

export default function CalendarView({ year, entries }: Props) {
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)

  const entryMap = new Map<string, Entry>()
  for (const entry of entries) {
    entryMap.set(entry.diary_date, entry)
  }

  if (selectedMonth !== null) {
    return (
      <MonthView
        year={year}
        month={selectedMonth}
        entryMap={entryMap}
        onBack={() => setSelectedMonth(null)}
        onPrevMonth={() =>
          setSelectedMonth((prev) =>
            prev !== null && prev > 0 ? prev - 1 : prev,
          )
        }
        onNextMonth={() =>
          setSelectedMonth((prev) =>
            prev !== null && prev < 11 ? prev + 1 : prev,
          )
        }
      />
    )
  }

  return (
    <HeatmapView
      year={year}
      entryMap={entryMap}
      onMonthClick={setSelectedMonth}
    />
  )
}

function HeatmapView({
  year,
  entryMap,
  onMonthClick,
}: {
  year: number
  entryMap: Map<string, Entry>
  onMonthClick: (month: number) => void
}) {
  const startDate = new Date(year, 0, 1)
  const endDate = new Date(year, 11, 31)
  const startDow = startDate.getDay()

  // Build cells for the whole year
  const cells: { date: string; entry: Entry | undefined }[] = []
  const current = new Date(year, 0, 1)
  while (current <= endDate) {
    const key = formatDateKey(
      current.getFullYear(),
      current.getMonth(),
      current.getDate(),
    )
    cells.push({ date: key, entry: entryMap.get(key) })
    current.setDate(current.getDate() + 1)
  }

  // Calculate month label positions (which column each month starts in)
  const monthPositions: { label: string; col: number }[] = []
  let dayIndex = 0
  for (let m = 0; m < 12; m++) {
    const daysInMonth = getDaysInMonth(year, m)
    const col = Math.floor((dayIndex + startDow) / 7)
    monthPositions.push({ label: MONTH_LABELS[m], col })
    dayIndex += daysInMonth
  }

  return (
    <div>
      {/* Year navigation */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <a
          href={`/calendar?year=${year - 1}`}
          style={{
            padding: '0.3rem 0.8rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '0.9rem',
            color: '#666',
          }}
        >
          {year - 1}
        </a>
        <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{year}</span>
        <a
          href={`/calendar?year=${year + 1}`}
          style={{
            padding: '0.3rem 0.8rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '0.9rem',
            color: '#666',
          }}
        >
          {year + 1}
        </a>
      </div>

      {/* Heatmap */}
      <div
        class="hide-scrollbar"
        style={{ overflowX: 'auto', padding: '0 0.5rem' }}
      >
        {/* Month labels */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '30px repeat(53, 12px)',
            gap: '2px',
            marginBottom: '4px',
          }}
        >
          <div />
          {monthPositions.map((mp) => (
            <button
              type="button"
              key={mp.label}
              onClick={() => {
                const monthIndex = MONTH_LABELS.indexOf(mp.label)
                onMonthClick(monthIndex)
              }}
              style={{
                gridColumnStart: mp.col + 2,
                fontSize: '10px',
                color: '#666',
                background: 'none',
                border: 'none',
                padding: 0,
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {mp.label}
            </button>
          ))}
        </div>

        {/* Day labels + grid */}
        <div style={{ display: 'flex', gap: '2px' }}>
          {/* Day of week labels */}
          <div
            style={{
              display: 'grid',
              gridTemplateRows: 'repeat(7, 12px)',
              gap: '2px',
              width: '30px',
              flexShrink: 0,
            }}
          >
            {DAY_LABELS.map((label) => (
              <div
                key={label}
                style={{
                  fontSize: '9px',
                  color: '#999',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  paddingRight: '4px',
                }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Heatmap grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateRows: 'repeat(7, 12px)',
              gridAutoFlow: 'column',
              gridAutoColumns: '12px',
              gap: '2px',
            }}
          >
            {/* Empty cells for offset */}
            {Array.from({ length: startDow }).map((_, i) => (
              <div
                key={`empty-${i}`}
                style={{ width: '12px', height: '12px' }}
              />
            ))}

            {/* Day cells */}
            {cells.map((cell) => {
              const color = getCellColor(cell.entry)
              if (cell.entry) {
                const entryId = cell.entry.id
                return (
                  <button
                    type="button"
                    key={cell.date}
                    onClick={() => {
                      window.location.href = `/d/${entryId}`
                    }}
                    title={cell.date}
                    style={{
                      width: '12px',
                      height: '12px',
                      background: color,
                      borderRadius: '2px',
                      cursor: 'pointer',
                      border: 'none',
                      padding: 0,
                    }}
                  />
                )
              }
              return (
                <div
                  key={cell.date}
                  title={cell.date}
                  style={{
                    width: '12px',
                    height: '12px',
                    background: color,
                    borderRadius: '2px',
                  }}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '4px',
          marginTop: '0.75rem',
          padding: '0 0.5rem',
          fontSize: '10px',
          color: '#999',
        }}
      >
        <span>なし</span>
        <div
          style={{
            width: '12px',
            height: '12px',
            background: '#ebedf0',
            borderRadius: '2px',
          }}
        />
        <div
          style={{
            width: '12px',
            height: '12px',
            background: '#c6e48b',
            borderRadius: '2px',
          }}
        />
        <span>あり</span>
      </div>
    </div>
  )
}

function MonthView({
  year,
  month,
  entryMap,
  onBack,
  onPrevMonth,
  onNextMonth,
}: {
  year: number
  month: number
  entryMap: Map<string, Entry>
  onBack: () => void
  onPrevMonth: () => void
  onNextMonth: () => void
}) {
  const daysInMonth = getDaysInMonth(year, month)
  const firstDow = new Date(year, month, 1).getDay()

  const days: { day: number; entry: Entry | undefined }[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const key = formatDateKey(year, month, d)
    days.push({ day: d, entry: entryMap.get(key) })
  }

  return (
    <div>
      {/* Month navigation */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '1.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <button
          type="button"
          onClick={onPrevMonth}
          disabled={month === 0}
          style={{
            padding: '0.3rem 0.8rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '0.9rem',
            color: month === 0 ? '#ccc' : '#666',
            background: 'none',
            cursor: month === 0 ? 'default' : 'pointer',
          }}
        >
          {month > 0 ? MONTH_LABELS[month - 1] : ''}
        </button>
        <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
          {MONTH_LABELS[month]}
        </span>
        <button
          type="button"
          onClick={onNextMonth}
          disabled={month === 11}
          style={{
            padding: '0.3rem 0.8rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '0.9rem',
            color: month === 11 ? '#ccc' : '#666',
            background: 'none',
            cursor: month === 11 ? 'default' : 'pointer',
          }}
        >
          {month < 11 ? MONTH_LABELS[month + 1] : ''}
        </button>
      </div>

      {/* Calendar grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '2px',
          maxWidth: '400px',
          margin: '0 auto',
        }}
      >
        {/* Day of week headers */}
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            style={{
              textAlign: 'center',
              fontSize: '0.8rem',
              color: '#999',
              padding: '0.3rem 0',
            }}
          >
            {label}
          </div>
        ))}

        {/* Empty cells before first day */}
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {/* Day cells */}
        {days.map(({ day, entry }) => {
          if (entry) {
            const entryId = entry.id
            const bgColor = getCellColor(entry)
            return (
              <button
                type="button"
                key={day}
                onClick={() => {
                  window.location.href = `/d/${entryId}`
                }}
                style={{
                  textAlign: 'center',
                  padding: '0.5rem 0.2rem',
                  borderRadius: '4px',
                  background: bgColor,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  color: '#333',
                  fontWeight: 'bold',
                  border: 'none',
                  fontFamily: 'inherit',
                }}
              >
                {day}
              </button>
            )
          }
          return (
            <div
              key={day}
              style={{
                textAlign: 'center',
                padding: '0.5rem 0.2rem',
                borderRadius: '4px',
                background: 'transparent',
                fontSize: '0.9rem',
                color: '#999',
              }}
            >
              {day}
            </div>
          )
        })}
      </div>

      {/* Back button */}
      <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '0.4rem 1rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '0.9rem',
            color: '#666',
            background: 'none',
            cursor: 'pointer',
          }}
        >
          年間に戻る
        </button>
      </div>
    </div>
  )
}
