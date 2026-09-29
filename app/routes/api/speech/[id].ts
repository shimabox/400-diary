import { createRoute } from '~/factory'
import { getDiaryWithSnapshot } from '../../../lib/db'
import { serveSpeechAudio } from '../../../lib/speech-response'

/**
 * 公開中スナップショットの読み上げ音声。「訪問者も声で聞ける」が公開されているときだけ
 * 誰でも聞ける。オフなら公開ページにボタンを出さないのと揃え、認証の有無にかかわらず
 * 存在自体を伏せて 404 を返す（書き手は編集画面で下書きの音声を聞く）。
 * no-cache にして、非公開化や削除がブラウザのキャッシュに邪魔されずにすぐ効くようにする。
 */
export const GET = createRoute(async (c) => {
  const id = c.req.param('id')!
  const published = await getDiaryWithSnapshot(c.env.DB, id)
  if (!published) return c.body(null, 404)

  const { snapshot } = published
  if (!snapshot.speech_public) return c.body(null, 404)

  return serveSpeechAudio({
    bucket: c.env.BUCKET,
    key: snapshot.speech_key,
    request: c.req.raw,
    cacheControl: 'no-cache',
  })
})
