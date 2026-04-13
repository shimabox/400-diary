import { createRoute } from '~/factory'
import DeleteDiaryButton from '../../islands/delete-diary-button'
import VerticalEditor from '../../islands/vertical-editor'
import { getDiaryWithPublished } from '../../lib/db'

export default createRoute(async (c) => {
  const appName = c.env.APP_NAME || '400字日記'
  if (!c.get('isAuthenticated')) {
    return c.redirect('/')
  }

  const id = c.req.param('id')!
  const db = c.env.DB
  const diary = await getDiaryWithPublished(db, id)

  if (!diary) {
    return c.render(
      <div
        style={{
          maxWidth: '960px',
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
      <div style={{ maxWidth: '960px', width: '100%' }}>
        <VerticalEditor
          title="日記を編集"
          initialBody={diary.body}
          initialDate={diary.diary_date}
          initialColor={diary.background_color}
          initialImageLayout={diary.image_layout}
          initialMood={diary.mood}
          initialImageKey={diary.image_key}
          initialImageX={diary.image_x}
          initialImageY={diary.image_y}
          diaryId={diary.id}
          publishedAt={diary.published_at}
        />
        <div style={{ padding: '0 1rem 2rem', textAlign: 'right' }}>
          <DeleteDiaryButton diaryId={diary.id} />
        </div>
      </div>
    </div>,
    { title: `日記を編集 — ${appName}` },
  )
})
