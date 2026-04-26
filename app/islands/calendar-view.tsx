import { useEffect, useRef, useState } from 'hono/jsx'
import { toLocalDateString } from '../lib/format'
import {
  computeInitialScrollLeft,
  decideScrollTarget,
} from '../lib/heatmap-scroll'
import { getMoodByKey, MOODS } from '../lib/mood'

type Entry = {
  id: string
  diary_date: string
  mood: string | null
}

type Props = {
  year: number
  entries: Entry[]
  isAuthenticated?: boolean
  minYear?: number
  maxYear?: number
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
  return '#bdbdbd'
}

export default function CalendarView({
  year,
  entries,
  isAuthenticated,
  minYear,
  maxYear,
}: Props) {
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
        isAuthenticated={isAuthenticated}
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
      isAuthenticated={isAuthenticated}
      minYear={minYear}
      maxYear={maxYear}
      onMonthClick={setSelectedMonth}
    />
  )
}

function HeatmapView({
  year,
  entryMap,
  isAuthenticated,
  minYear,
  maxYear,
  onMonthClick,
}: {
  year: number
  entryMap: Map<string, Entry>
  isAuthenticated?: boolean
  minYear?: number
  maxYear?: number
  onMonthClick: (month: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  const startDate = new Date(year, 0, 1)
  const endDate = new Date(year, 11, 31)
  const startDow = startDate.getDay()
  const totalDays =
    Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1
  const totalWeeks = Math.ceil((startDow + totalDays) / 7)

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

  useEffect(() => {
    const el = scrollRef.current
    if (!el) {
      setReady(true)
      return
    }
    // PC（横スクロール余地が無い）でも fade in だけは走らせる
    if (el.scrollWidth > el.clientWidth) {
      const today = toLocalDateString()
      const currentYear = Number(today.slice(0, 4))
      const currentMonth = Number(today.slice(5, 7)) - 1

      // monthPositions を依存に入れず year 変化時のみ再計算する
      const cols: number[] = []
      let acc = 0
      const dow = new Date(year, 0, 1).getDay()
      for (let m = 0; m < 12; m++) {
        cols.push(Math.floor((acc + dow) / 7))
        acc += getDaysInMonth(year, m)
      }

      el.scrollLeft = computeInitialScrollLeft({
        target: decideScrollTarget(year, currentYear),
        currentMonth,
        monthStartCols: cols,
        scrollWidth: el.scrollWidth,
      })
    }
    setReady(true)
  }, [year])

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
        {minYear != null && year > minYear ? (
          <a
            href={`/?year=${year - 1}`}
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
        ) : (
          <span style={{ width: '4rem' }} />
        )}
        <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{year}</span>
        {maxYear != null && year < maxYear ? (
          <a
            href={`/?year=${year + 1}`}
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
        ) : (
          <span style={{ width: '4rem' }} />
        )}
      </div>

      {/* Heatmap */}
      <div
        ref={scrollRef}
        class="hide-scrollbar"
        style={{
          overflowX: 'auto',
          padding: '0 0.5rem',
          opacity: ready ? 1 : 0,
          transition: 'opacity 0.2s ease-in',
        }}
      >
        <div
          style={{
            display: 'grid',
            width: 'fit-content',
            margin: '0 auto',
            gridTemplateRows: 'auto repeat(7, 12px)',
            gridTemplateColumns: `repeat(${totalWeeks}, 12px) 30px`,
            gap: '2px',
          }}
        >
          {/* Row 1: month labels */}
          {monthPositions.map((mp) => (
            <button
              type="button"
              key={mp.label}
              onClick={() => {
                const monthIndex = MONTH_LABELS.indexOf(mp.label)
                onMonthClick(monthIndex)
              }}
              style={{
                gridRow: 1,
                gridColumn: mp.col + 1,
                fontSize: '10px',
                color: '#666',
                background: 'none',
                border: 'none',
                padding: '0 0 4px',
                textAlign: 'left',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              {mp.label}
            </button>
          ))}

          {/* Last column, rows 2-8: day labels */}
          {DAY_LABELS.map((label, i) => (
            <div
              key={label}
              style={{
                gridRow: i + 2,
                gridColumn: totalWeeks + 1,
                fontSize: '9px',
                color: '#999',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                paddingLeft: '4px',
              }}
            >
              {label}
            </div>
          ))}

          {/* Heatmap cells: explicitly placed */}
          {cells.map((cell, index) => {
            const pos = startDow + index
            const col = Math.floor(pos / 7) + 1
            const row = (pos % 7) + 2
            const color = getCellColor(cell.entry)
            if (cell.entry) {
              const href = isAuthenticated
                ? `/edit/${cell.entry.id}`
                : `/d/${cell.entry.id}`
              return (
                <a
                  key={cell.date}
                  href={href}
                  title={cell.date}
                  style={{
                    gridRow: row,
                    gridColumn: col,
                    height: '12px',
                    background: color,
                    borderRadius: '2px',
                    display: 'block',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      width: '1px',
                      height: '1px',
                      overflow: 'hidden',
                      clip: 'rect(0,0,0,0)',
                    }}
                  >
                    {cell.date}
                  </span>
                </a>
              )
            }
            return (
              <div
                key={cell.date}
                title={cell.date}
                style={{
                  gridRow: row,
                  gridColumn: col,
                  height: '12px',
                  background: color,
                  borderRadius: '2px',
                }}
              />
            )
          })}
        </div>
      </div>

      {/* Mood legend */}
      <MoodLegend />
    </div>
  )
}

function MoodLegend() {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const items = MOODS.map((m) => ({
    key: m.key,
    color: m.color,
    label: m.label,
  }))

  useEffect(() => {
    if (!activeKey) return
    const dismiss = () => setActiveKey(null)
    document.addEventListener('click', dismiss)
    const timer = setTimeout(dismiss, 1000)
    return () => {
      document.removeEventListener('click', dismiss)
      clearTimeout(timer)
    }
  }, [activeKey])

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '16px',
        marginTop: '0.75rem',
      }}
    >
      {items.map((item) => (
        <button
          type="button"
          key={item.key}
          class="mood-legend-item"
          onClick={(e) => {
            e.stopPropagation()
            setActiveKey((prev) => (prev === item.key ? null : item.key))
          }}
          style={{
            position: 'relative',
            width: '12px',
            height: '12px',
            borderRadius: '2px',
            background: item.color,
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span
            class={`mood-legend-label${activeKey === item.key ? ' is-active' : ''}`}
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: '4px',
              padding: '2px 6px',
              background: '#333',
              color: '#fff',
              borderRadius: '3px',
              fontSize: '0.7rem',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {item.label}
          </span>
        </button>
      ))}
    </div>
  )
}

function MonthView({
  year,
  month,
  entryMap,
  isAuthenticated,
  onBack,
  onPrevMonth,
  onNextMonth,
}: {
  year: number
  month: number
  entryMap: Map<string, Entry>
  isAuthenticated?: boolean
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
          const bgColor = entry ? getCellColor(entry) : 'transparent'
          if (entry) {
            const href = isAuthenticated
              ? `/edit/${entry.id}`
              : `/d/${entry.id}`
            return (
              <a
                key={day}
                href={href}
                style={{
                  textAlign: 'center',
                  padding: '0.5rem 0.2rem',
                  borderRadius: '4px',
                  background: bgColor,
                  fontSize: '0.9rem',
                  color: '#333',
                  fontWeight: 'bold',
                }}
              >
                {day}
              </a>
            )
          }
          return (
            <div
              key={day}
              style={{
                textAlign: 'center',
                padding: '0.5rem 0.2rem',
                borderRadius: '4px',
                background: bgColor,
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
