import { createRoute } from '~/factory'
import CalendarView from '../islands/calendar-view'
import { listDiaries, listDiaryCalendarEntries } from '../lib/db'
import { formatDiaryDate } from '../lib/format'

export default createRoute(async (c) => {
  const db = c.env.DB
  const yearParam = c.req.query('year')
  const year = yearParam
    ? Number.parseInt(yearParam, 10)
    : new Date().getFullYear()
  const isAuthenticated = c.get('isAuthenticated')
  const [allDiaries, calendarEntries] = await Promise.all([
    listDiaries(db),
    listDiaryCalendarEntries(db, year),
  ])
  const diaries = isAuthenticated
    ? allDiaries
    : allDiaries.filter((d) => d.published_at)
  const pubCalendarEntries = isAuthenticated
    ? calendarEntries
    : calendarEntries.filter((e) => {
        const diary = allDiaries.find((d) => d.id === e.id)
        return diary?.published_at
      })

  const diaryYears = diaries.map((d) =>
    Number.parseInt(d.diary_date.slice(0, 4), 10),
  )
  const minYear = diaryYears.length > 0 ? Math.min(...diaryYears) : year
  const maxYear = diaryYears.length > 0 ? Math.max(...diaryYears) : year

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
          <h1 style={{ fontSize: '1.3rem' }}>しまぶ日記</h1>
          {isAuthenticated && (
            <a
              href="/new"
              style={{
                padding: '0.4rem 1rem',
                border: '1px solid #333',
                borderRadius: '4px',
                fontSize: '0.9rem',
              }}
            >
              日記を書く
            </a>
          )}
        </div>

        <div style={{ padding: '0 0.5rem 1.5rem' }}>
          <CalendarView
            year={year}
            entries={pubCalendarEntries}
            isAuthenticated={isAuthenticated}
            minYear={minYear}
            maxYear={maxYear}
          />
        </div>

        {diaries.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              color: '#999',
            }}
          >
            <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
              まだ日記がありません
            </p>
            <p style={{ fontSize: '0.9rem' }}>
              「日記を書く」から最初の一枚を書いてみましょう
            </p>
          </div>
        ) : (
          <div
            class="hide-scrollbar"
            style={{
              height: '480px',
              overflowX: 'auto',
              overflowY: 'hidden',
              direction: 'rtl',
              display: 'flex',
              alignItems: 'stretch',
              gap: '1rem',
              padding: '0 0.5rem',
            }}
          >
            {diaries.map((diary) => {
              const cardBody = isAuthenticated
                ? diary.body
                : (diary.published_body ?? diary.body)
              const cardColor = isAuthenticated
                ? diary.background_color
                : (diary.published_background_color ?? diary.background_color)
              const cardHref = isAuthenticated
                ? `/edit/${diary.id}`
                : `/d/${diary.id}`
              return (
                <a
                  key={diary.id}
                  href={cardHref}
                  style={{
                    direction: 'ltr',
                    display: 'flex',
                    flexDirection: 'column',
                    flexShrink: 0,
                    width: '168px',
                    background: cardColor,
                    backgroundImage: 'url(/images/background.png)',
                    backgroundRepeat: 'repeat',
                    backgroundBlendMode: 'luminosity',
                    borderRadius: '8px',
                    padding: '1rem 0.8rem',
                    transition: 'transform 0.15s',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                  class="diary-card"
                >
                  {isAuthenticated && !diary.published_at && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '0.4rem',
                        left: '0.4rem',
                        fontSize: '0.65rem',
                        background: 'rgba(0,0,0,0.45)',
                        color: '#fff',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '3px',
                      }}
                    >
                      下書き
                    </span>
                  )}
                  <time
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      fontSize: '1rem',
                      color: '#666',
                      marginBottom: '0.8rem',
                      flexShrink: 0,
                    }}
                  >
                    {formatDiaryDate(diary.diary_date)}
                  </time>
                  <div
                    style={{
                      flex: 1,
                      writingMode: 'vertical-rl',
                      fontSize: '1.25rem',
                      lineHeight: '1.8',
                      overflow: 'hidden',
                      fontWeight: 600,
                      maskImage:
                        'radial-gradient(circle at bottom left, transparent 0%, black 3.5rem)',
                      WebkitMaskImage:
                        'radial-gradient(circle at bottom left, transparent 0%, black 3.5rem)',
                    }}
                  >
                    {cardBody}
                  </div>
                </a>
              )
            })}
          </div>
        )}

        <style>{`
        .diary-card:hover {
          transform: translateY(-4px);
        }
      `}</style>
      </div>
    </div>,
    { title: 'しまぶ日記' },
  )
})
