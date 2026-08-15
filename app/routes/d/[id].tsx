import { createRoute } from '~/factory'
import DiaryScrollFrame from '../../islands/diary-scroll-frame'
import MoodMarker from '../../islands/mood-marker'
import { DEFAULT_APP_NAME } from '../../lib/constants'
import { getDiaryWithSnapshot } from '../../lib/db'
import { formatDiaryDate } from '../../lib/format'

export default createRoute(async (c) => {
  const appName = c.env.APP_NAME || DEFAULT_APP_NAME
  const id = c.req.param('id')!
  const db = c.env.DB
  const result = await getDiaryWithSnapshot(db, id)

  if (!result) {
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
      { title: `Not Found — ${appName}` },
    )
  }

  const isAuthenticated = c.get('isAuthenticated')
  const { snapshot, ...diary } = result
  const pubBody = snapshot.body
  const pubImageKey = snapshot.image_key
  const pubImageLayout = snapshot.image_layout as 'left' | 'right'
  const pubImageX = snapshot.image_x
  const pubImageY = snapshot.image_y
  const pubImageScale = snapshot.image_scale
  const pubImageRotation = snapshot.image_rotation
  const pubBgColor = snapshot.background_color
  const pubMood = snapshot.mood
  const description = pubBody.slice(0, 80)
  const dateLabel = formatDiaryDate(diary.diary_date)
  // スナップショット ID をクエリに載せることで、再公開時に og:image URL 自体が
  // 変わり、ブラウザや SNS のキャッシュが自動で迂回される。
  const ogImageUrl = `/api/og/${diary.id}?v=${snapshot.id}`

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
          <h1
            style={{
              fontSize: '1.3rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <a href="/">{appName}</a>
            <MoodMarker moodKey={pubMood} />
          </h1>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {isAuthenticated && (
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
            )}
          </div>
        </div>
      </div>

      <DiaryScrollFrame
        bgColor={pubBgColor}
        text={pubBody}
        imageLayout={pubImageLayout}
        imageSrc={pubImageKey ? `/api/images/${pubImageKey}` : null}
        dateLabel={dateLabel}
        imagePosition={
          pubImageX != null && pubImageY != null
            ? { x: pubImageX, y: pubImageY }
            : null
        }
        imageScale={pubImageScale}
        imageRotation={pubImageRotation}
      />
    </div>,
    {
      title: `${dateLabel} の日記 — ${appName}`,
      description,
      ogImage: ogImageUrl,
      preloadImage: pubImageKey ? `/api/images/${pubImageKey}` : undefined,
    },
  )
})
