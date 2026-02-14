import { createRoute } from '~/factory'
import { getDiary } from '../../lib/db'
import { formatDiaryDate } from '../../lib/format'

export default createRoute(async (c) => {
  const id = c.req.param('id')!
  const db = c.env.DB
  const diary = await getDiary(db, id)

  if (!diary) {
    return c.render(
      <div
        style={{
          maxWidth: '720px',
          margin: '0 auto',
          padding: '3rem 1rem',
          textAlign: 'center',
        }}
      >
        <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
          日記が見つかりません
        </p>
        <a
          href="/"
          style={{
            padding: '0.4rem 1rem',
            border: '1px solid #333',
            borderRadius: '4px',
            fontSize: '0.9rem',
          }}
        >
          一覧に戻る
        </a>
      </div>,
      { title: 'Not Found — 256日記' },
    )
  }

  const description = diary.body.slice(0, 80)
  const dateLabel = formatDiaryDate(diary.diary_date)

  return c.render(
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div
        style={{
          background: diary.background_color,
          borderRadius: '12px',
          padding: '2rem',
          maxWidth: '960px',
          width: '100%',
          height: '480px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection:
              diary.image_layout === 'right' ? 'row-reverse' : 'row',
            gap: '2rem',
            alignItems: 'flex-start',
          }}
        >
          {diary.image_key && (
            <img
              src={`/api/images/${diary.image_key}`}
              alt="日記の写真"
              style={{
                width: '30%',
                borderRadius: '12px',
                objectFit: 'cover',
                flexShrink: 0,
                margin:
                  diary.image_layout === 'right'
                    ? '1rem 1rem 0 0'
                    : '1rem 0 0 1rem',
              }}
            />
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            <time
              style={{
                display: 'block',
                fontSize: '2rem',
                color: '#555',
                marginTop: '1rem',
                marginBottom: '3rem',
                textAlign: diary.image_layout === 'right' ? 'left' : 'right',
              }}
            >
              {dateLabel}
            </time>

            <div
              style={{
                writingMode: 'vertical-rl',
                whiteSpace: 'pre-wrap',
                width: '100%',
                maxHeight: '60vh',
                overflowX: 'auto',
                fontSize: '1.1rem',
                lineHeight: '2',
                fontWeight: 600,
              }}
            >
              {diary.body}
            </div>
          </div>
        </div>
      </div>

      <nav
        style={{
          maxWidth: '960px',
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '1.5rem',
        }}
      >
        <a href="/" style={{ fontSize: '0.9rem' }}>
          ← 一覧に戻る
        </a>
        <a
          href={`/edit/${diary.id}`}
          style={{
            padding: '0.3rem 0.8rem',
            border: '1px solid #333',
            borderRadius: '4px',
            fontSize: '0.85rem',
          }}
        >
          編集する
        </a>
      </nav>
    </div>,
    {
      title: `${dateLabel}の日記 — 256日記`,
      description,
    },
  )
})
