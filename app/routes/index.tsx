import { createRoute } from '~/factory'
import { listDiaries } from '../lib/db'
import { formatDiaryDate } from '../lib/format'

export default createRoute(async (c) => {
  const db = c.env.DB
  const diaries = await listDiaries(db)

  return c.render(
    <div
      style={{
        maxWidth: '960px',
        margin: '0 auto',
        padding: '2rem 1rem',
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
        <h1 style={{ fontSize: '1.3rem' }}>256日記</h1>
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
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            padding: '0 0.5rem',
          }}
        >
          {diaries.map((diary) => (
            <a
              key={diary.id}
              href={`/d/${diary.id}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                height: '80px',
                background: diary.background_color,
                borderRadius: '6px',
                padding: '0.8rem',
                transition: 'transform 0.15s',
                overflow: 'hidden',
              }}
              class="diary-card"
            >
              <time
                style={{
                  fontSize: '1rem',
                  color: '#666',
                  lineHeight: 1.5,
                  marginBottom: '0.3rem',
                }}
              >
                {formatDiaryDate(diary.diary_date)}
              </time>
              <div
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    writingMode: 'vertical-rl',
                    textOrientation: 'upright',
                    whiteSpace: 'nowrap',
                    fontSize: '1.25rem',
                    fontWeight: 600,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    transform: 'rotate(-90deg) translateX(-100%)',
                    transformOrigin: 'top left',
                  }}
                >
                  {diary.body}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      <style>{`
        .diary-card:hover {
          transform: translateY(-2px);
        }
      `}</style>
    </div>,
    { title: '256日記' },
  )
})
