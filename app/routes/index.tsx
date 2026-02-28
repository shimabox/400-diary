import { createRoute } from '~/factory'
import { listDiaries } from '../lib/db'
import { formatDiaryDate } from '../lib/format'

export default createRoute(async (c) => {
  const db = c.env.DB
  const diaries = await listDiaries(db)

  return c.render(
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
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
            {diaries.map((diary) => (
              <a
                key={diary.id}
                href={`/d/${diary.id}`}
                style={{
                  direction: 'ltr',
                  display: 'flex',
                  flexDirection: 'column',
                  flexShrink: 0,
                  width: '168px',
                  background: diary.background_color,
                  backgroundImage: 'url(/images/background.png)',
                  backgroundRepeat: 'repeat',
                  backgroundBlendMode: 'luminosity',
                  borderRadius: '8px',
                  padding: '1rem 0.8rem',
                  transition: 'transform 0.15s',
                  overflow: 'hidden',
                }}
                class="diary-card"
              >
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
                  {diary.body}
                </div>
              </a>
            ))}
          </div>
        )}

        <style>{`
        .diary-card:hover {
          transform: translateY(-4px);
        }
      `}</style>
      </div>
    </div>,
    { title: '256日記' },
  )
})
