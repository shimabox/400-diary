import { createRoute } from '~/factory'
import CalendarView from '../islands/calendar-view'
import DiaryList from '../islands/diary-list'
import { DEFAULT_APP_NAME } from '../lib/constants'
import {
  getDiaryDateRange,
  listDiariesPage,
  listDiaryCalendarEntries,
  listPublishedCalendarEntries,
} from '../lib/db'
import { toDiaryListPage } from '../lib/diary-cards'

// 一覧は全件 SSR せず、無限スクロールの初回ページ分のみ描画する（残りは island が
// GET /api/diaries?limit=31&before_date=...&before_id=... で取得する）
const DIARY_LIST_PAGE_SIZE = 31

export default createRoute(async (c) => {
  const appName = c.env.APP_NAME || DEFAULT_APP_NAME
  const db = c.env.DB
  const yearParam = c.req.query('year')
  const year = yearParam
    ? Number.parseInt(yearParam, 10)
    : new Date().getFullYear()
  const isAuthenticated = c.get('isAuthenticated')
  const publishedOnly = !isAuthenticated

  const [diaryRows, calendarEntries, dateRange] = await Promise.all([
    listDiariesPage(db, { limit: DIARY_LIST_PAGE_SIZE, publishedOnly }),
    isAuthenticated
      ? listDiaryCalendarEntries(db, year)
      : listPublishedCalendarEntries(db, year),
    getDiaryDateRange(db, publishedOnly),
  ])

  const { items: diaryCards, next: initialNext } = toDiaryListPage(
    diaryRows,
    isAuthenticated,
    DIARY_LIST_PAGE_SIZE,
  )

  // 未認証時は公開済みのみの範囲になる点は従来（全件取得からのフィルタ）と同じ挙動
  const minYear = dateRange
    ? Number.parseInt(dateRange.min.slice(0, 4), 10)
    : year
  const maxYear = dateRange
    ? Number.parseInt(dateRange.max.slice(0, 4), 10)
    : year

  return c.render(
    <div
      class="home-shell"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        justifyContent: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div
        class="home-content"
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <a
                href="/api/export"
                style={{ color: '#595959', fontSize: '0.9rem' }}
              >
                エクスポート
              </a>
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
            </div>
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

        {diaryCards.length === 0 ? (
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
          <DiaryList
            initialItems={diaryCards}
            initialNext={initialNext}
            isAuthenticated={isAuthenticated}
          />
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
          <a href="/rss.xml" style={{ color: '#595959' }}>
            RSS
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
