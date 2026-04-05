import { createRoute } from '~/factory'
import CalendarView from '../islands/calendar-view'
import { listDiaryCalendarEntries } from '../lib/db'

export default createRoute(async (c) => {
  const db = c.env.DB
  const yearParam = c.req.query('year')
  const year = yearParam
    ? Number.parseInt(yearParam, 10)
    : new Date().getFullYear()

  const entries = await listDiaryCalendarEntries(db, year)

  return c.render(
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        justifyContent: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div
        style={{
          maxWidth: '960px',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 0.5rem 1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <a href="/" style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>
              256日記
            </a>
            <span style={{ fontSize: '1.1rem', color: '#666' }}>{year}年</span>
          </div>
        </div>

        <CalendarView year={year} entries={entries} />
      </div>
    </div>,
    { title: `${year}年 カレンダー | 256日記` },
  )
})
