import { createRoute } from '~/factory'
import CalendarView from '../islands/calendar-view'
import {
  listDiaries,
  listDiaryCalendarEntries,
  listPublishedCalendarEntries,
} from '../lib/db'
import { formatDiaryDate } from '../lib/format'

export default createRoute(async (c) => {
  const appName = c.env.APP_NAME || '400字日記'
  const db = c.env.DB
  const yearParam = c.req.query('year')
  const year = yearParam
    ? Number.parseInt(yearParam, 10)
    : new Date().getFullYear()
  const isAuthenticated = c.get('isAuthenticated')
  const [allDiaries, calendarEntries] = await Promise.all([
    listDiaries(db),
    isAuthenticated
      ? listDiaryCalendarEntries(db, year)
      : listPublishedCalendarEntries(db, year),
  ])
  const diaries = isAuthenticated
    ? allDiaries
    : allDiaries.filter((d) => d.published_snapshot_id)

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
        alignItems: 'flex-start',
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
          <h1 style={{ fontSize: '1.3rem' }}>{appName}</h1>
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
            entries={calendarEntries}
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
            data-scroll-restore="diary-list"
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
              const cardBody = diary.snapshot_body ?? diary.body
              const cardColor =
                diary.snapshot_background_color ?? diary.background_color
              const hasDraft =
                isAuthenticated &&
                diary.published_snapshot_id &&
                (diary.body !== diary.snapshot_body ||
                  diary.background_color !== diary.snapshot_background_color ||
                  diary.image_key !== diary.snapshot_image_key ||
                  diary.image_layout !== diary.snapshot_image_layout ||
                  diary.image_x !== diary.snapshot_image_x ||
                  diary.image_y !== diary.snapshot_image_y ||
                  diary.mood !== diary.snapshot_mood)
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
                    backgroundImage: 'url(/images/background.webp)',
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
                  {isAuthenticated && !diary.published_snapshot_id && (
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
                  {hasDraft && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '0.4rem',
                        left: '0.4rem',
                        fontSize: '0.65rem',
                        background: 'rgba(180,100,0,0.7)',
                        color: '#fff',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '3px',
                      }}
                    >
                      未公開の変更
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

        <footer
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '1.5rem',
            padding: '2rem 0 0',
            fontSize: '0.85rem',
          }}
        >
          <a
            href="https://x.com/shimabox"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#595959' }}
          >
            X
          </a>
          <a
            href="https://github.com/shimabox/400-diary"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#595959' }}
          >
            GitHub
          </a>
        </footer>
      </div>
    </div>,
    {
      title: appName,
      description: 'しまぶが400文字で綴る日記',
      ogImage: '/api/og',
    },
  )
})
