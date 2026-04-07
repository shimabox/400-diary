import { createRoute } from '~/factory'
import VerticalEditor from '../../islands/vertical-editor'
import { getDiary } from '../../lib/db'

export default createRoute(async (c) => {
  if (!c.get('isAuthenticated')) {
    return c.redirect('/')
  }

  const id = c.req.param('id')!
  const db = c.env.DB
  const diary = await getDiary(db, id)

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
      { title: 'Not Found — しまぶ日記' },
    )
  }

  return c.render(
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
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
          diaryId={diary.id}
          publishedAt={diary.published_at}
        />
        <div style={{ padding: '0 1rem 2rem', textAlign: 'right' }}>
          <button
            type="button"
            id="delete-btn"
            style={{
              padding: '0.4rem 1rem',
              background: 'transparent',
              color: '#c0392b',
              border: '1px solid #c0392b',
              borderRadius: '4px',
              fontSize: '0.85rem',
            }}
          >
            この日記を削除
          </button>
          <script
            dangerouslySetInnerHTML={{
              __html: `
              document.getElementById('delete-btn').addEventListener('click', async function() {
                if (!confirm('この日記を削除しますか？')) return;
                const res = await fetch('/api/diaries/${diary.id}', { method: 'DELETE' });
                if (res.ok) window.location.href = '/';
                else alert('削除に失敗しました');
              });
            `,
            }}
          />
        </div>
      </div>
    </div>,
    { title: '日記を編集 — しまぶ日記' },
  )
})
