import type { R2Bucket } from '@cloudflare/workers-types/latest'
import type { Context } from 'hono'
import { type AppEnv, createRoute, requireAuth } from '~/factory'
import { MAX_BODY_LENGTH } from '../../../../lib/constants'
import {
  clearDiarySpeechKeys,
  getDiary,
  listSpeechKeysInUse,
  setDiarySpeechKey,
} from '../../../../lib/db'
import {
  deleteDiarySpeech,
  logSpeechError,
  SPEECH_MIME_TYPE,
  SpeechSynthesisError,
  speechCacheKey,
  synthesizeSpeech,
} from '../../../../lib/speech'
import { deleteUnusedDiarySpeech } from '../../../../lib/speech-cleanup'
import { speechStyleForMood } from '../../../../lib/speech-style'

const GENERATION_FAILED = '音声を作れませんでした'
const DIARY_CHANGED =
  '作成中に日記が保存または音声が削除されたため、音声を記録しませんでした'

type GenerationResult =
  | { ok: true; created: boolean; speechKey: string }
  | { ok: false; status: 502 | 504 | 409 }

/**
 * 記録できなかった音声を R2 から消す。ほかの音声は消さず、同じキーを別の生成が
 * 記録済みなら残す。best-effort なので失敗はログに残すだけにする。
 */
async function discardUnrecordedSpeech(
  c: Context<AppEnv>,
  diaryId: string,
  speechKey: string,
): Promise<void> {
  try {
    const inUse = await listSpeechKeysInUse(c.env.DB, diaryId)
    if (!inUse.includes(speechKey)) {
      await c.env.BUCKET.delete(speechKey)
    }
  } catch (error) {
    logSpeechError('failed to delete unrecorded audio', error)
  }
}

async function generate(
  c: Context<AppEnv>,
  params: {
    diaryId: string
    body: string
    mood: string | null
    updatedAt: string
    apiKey: string
    voiceId: string
  },
): Promise<GenerationResult> {
  const { diaryId, body, mood, updatedAt, apiKey, voiceId } = params
  const bucket: R2Bucket = c.env.BUCKET
  const style = speechStyleForMood(mood).instruction
  const speechKey = await speechCacheKey(diaryId, { body, style, voiceId })

  // 同じ本文・話し方・声・形式の音声がすでにあれば、Gemini を呼ばずにそれを使う
  const existing = await bucket.head(speechKey)
  if (existing) {
    if (!(await setDiarySpeechKey(c.env.DB, diaryId, speechKey, updatedAt))) {
      return { ok: false, status: 409 }
    }
    await deleteUnusedDiarySpeech(c.env.DB, bucket, diaryId)
    return { ok: true, created: false, speechKey }
  }

  let audio: Uint8Array
  try {
    audio = await synthesizeSpeech({ apiKey, voiceId, text: body, style })
  } catch (error) {
    if (!(error instanceof SpeechSynthesisError)) throw error
    logSpeechError('synthesis failed', error)
    return { ok: false, status: error.kind === 'timeout' ? 504 : 502 }
  }

  await bucket.put(speechKey, audio, {
    httpMetadata: { contentType: SPEECH_MIME_TYPE },
  })
  // 生成中に本文が保存されたり音声が削除されたりしていたら、この音声は記録しない
  // （古い本文の音声になるうえ、削除した音声を後から復活させてしまうため）
  if (!(await setDiarySpeechKey(c.env.DB, diaryId, speechKey, updatedAt))) {
    await discardUnrecordedSpeech(c, diaryId, speechKey)
    return { ok: false, status: 409 }
  }
  await deleteUnusedDiarySpeech(c.env.DB, bucket, diaryId)
  return { ok: true, created: true, speechKey }
}

/**
 * 保存済みの本文と気分から、書き手本人の声の音声を作る。
 * 生成は数十秒かかるので応答はその間待たせる。画面を離れて接続が切れても
 * R2 と D1 への記録まで進むよう、同じ処理を waitUntil にも渡す。
 */
export const POST = createRoute(requireAuth, async (c) => {
  const id = c.req.param('id')!
  const diary = await getDiary(c.env.DB, id)
  if (!diary) {
    return c.json({ error: '日記が見つかりません' }, 404)
  }

  if (!diary.body.trim()) {
    return c.json({ error: '本文を保存してから作ってください' }, 422)
  }
  if (diary.body.length > MAX_BODY_LENGTH) {
    return c.json(
      { error: `本文は${MAX_BODY_LENGTH}文字以内にしてください` },
      422,
    )
  }

  const apiKey = c.env.GEMINI_API_KEY
  const voiceId = c.env.GEMINI_VOICE_ID
  if (!apiKey || !voiceId) {
    return c.json({ error: '音声を作る設定がありません' }, 503)
  }

  const work = generate(c, {
    diaryId: id,
    body: diary.body,
    mood: diary.mood,
    updatedAt: diary.updated_at,
    apiKey,
    voiceId,
  })
  try {
    // 失敗は下の await で扱うので、waitUntil 側では握りつぶす
    c.executionCtx.waitUntil(work.catch(() => {}))
  } catch {
    // テストなど ExecutionContext が無い環境では素通しする
  }

  const result = await work
  if (!result.ok) {
    const error = result.status === 409 ? DIARY_CHANGED : GENERATION_FAILED
    return c.json({ error }, result.status)
  }
  return c.json({ created: result.created, speech_key: result.speechKey })
})

/**
 * 日記の音声をすべて削除する。D1 の参照を先に外して公開ページからすぐに消し、
 * R2 の削除は best-effort にする（失敗しても参照されない音声が残るだけ）。
 */
export const DELETE = createRoute(requireAuth, async (c) => {
  const id = c.req.param('id')!
  const diary = await getDiary(c.env.DB, id)
  if (!diary) {
    return c.json({ error: '日記が見つかりません' }, 404)
  }

  await clearDiarySpeechKeys(c.env.DB, id)
  try {
    await deleteDiarySpeech(c.env.BUCKET, id)
  } catch (error) {
    logSpeechError('failed to delete audio', error)
  }

  return c.body(null, 204)
})
