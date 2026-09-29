import { createRoute } from '~/factory'
import DeleteDiaryButton from '../../islands/delete-diary-button'
import VerticalEditor from '../../islands/vertical-editor'
import { DEFAULT_APP_NAME } from '../../lib/constants'
import { getDiaryWithPublished } from '../../lib/db'
import { expectedSpeechKey } from '../../lib/speech'

export default createRoute(async (c) => {
  const appName = c.env.APP_NAME || DEFAULT_APP_NAME
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
            border: '1px solid var(--fg)',
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

  // 音声が保存済みの本文と気分に合っているかは声 ID を使うのでサーバで判定し、
  // 結果だけを渡す（声 ID は画面に出さない）
  const expectedKey = await expectedSpeechKey(diary, c.env.GEMINI_VOICE_ID)
  const speech = {
    available: !!(c.env.GEMINI_API_KEY && c.env.GEMINI_VOICE_ID),
    key: diary.speech_key,
    matches: !!diary.speech_key && diary.speech_key === expectedKey,
    isPublic: !!diary.speech_public,
    // 「公開すれば反映される音声」の案内の判定に使う
    publishedKey: diary.snapshot_speech_key,
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
          initialImageScale={diary.image_scale}
          initialImageRotation={diary.image_rotation}
          diaryId={diary.id}
          publishedAt={diary.published_at}
          speech={speech}
        />
        <div style={{ padding: '0 1rem 2rem', textAlign: 'right' }}>
          <DeleteDiaryButton diaryId={diary.id} />
        </div>
      </div>
    </div>,
    { title: `日記を編集 — ${appName}` },
  )
})
