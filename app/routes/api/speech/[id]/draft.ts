import { createRoute, requireAuth } from '~/factory'
import { getDiary } from '../../../../lib/db'
import { serveSpeechAudio } from '../../../../lib/speech-response'

/** 下書き側の読み上げ音声。編集画面で書き手が作った音声を確かめるためのもの */
export const GET = createRoute(requireAuth, async (c) => {
  const id = c.req.param('id')!
  const diary = await getDiary(c.env.DB, id)
  if (!diary) return c.body(null, 404)

  return serveSpeechAudio({
    bucket: c.env.BUCKET,
    key: diary.speech_key,
    request: c.req.raw,
    cacheControl: 'private, no-store',
  })
})
