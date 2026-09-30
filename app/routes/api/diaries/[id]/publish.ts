import { createRoute, requireAuth } from '~/factory'
import { publishDiary } from '../../../../lib/db'
import { deleteUnusedDiarySpeech } from '../../../../lib/speech-cleanup'

export const POST = createRoute(requireAuth, async (c) => {
  const id = c.req.param('id')!
  const db = c.env.DB
  // 声 ID は、下書きの音声が保存済みの本文・気分に合っているかの判定にだけ使う。
  // 合わなくても、本文が同じなら直前の公開版の音声を引き継ぐ
  const snapshot = await publishDiary(db, id, {
    voiceId: c.env.GEMINI_VOICE_ID,
  })

  if (!snapshot) {
    return c.json({ error: '日記が見つかりません' }, 404)
  }

  // OGP の R2 キャッシュキーには snapshot.id が含まれるため、再公開すれば
  // 自動的に別キーになり、旧 PNG を取り違える心配がない。
  // よってここでの明示的な無効化は不要。

  // 再公開で前の公開版からも参照されなくなった読み上げ音声を消す。失敗しても公開は成功させる
  await deleteUnusedDiarySpeech(db, c.env.BUCKET, id)

  // speech_key は公開版に写した音声のキー（下書きの音声か前の公開版の音声。無ければ null）。編集画面が
  // 「公開すれば反映される音声」の案内を消すかどうかを、読み直さずに判定するため返す
  return c.json({
    published_at: snapshot.published_at,
    speech_key: snapshot.speech_key,
  })
})
