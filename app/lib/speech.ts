import type { R2Bucket } from '@cloudflare/workers-types/latest'
import { speechStyleForMood } from './speech-style'

const INTERACTIONS_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/interactions'
export const SPEECH_MODEL = 'gemini-3.8-flash-tts'
export const SPEECH_MIME_TYPE = 'audio/wav'
// API は現在 24kHz 固定で、16000 などを指定しても 24kHz で返る。
// 実際に返る形式に合わせ、キャッシュキーに含める値もこれにする
export const SPEECH_SAMPLE_RATE = 24000
// 400 字をゆっくり読んでも 1〜2 分の音声なので、生成が止まったとみなす上限は余裕をもたせる
const SYNTHESIZE_TIMEOUT_MS = 90_000
// RIFF(4) + size(4) + WAVE(4) + fmt チャンク(24) + data チャンクヘッダ(8)
const WAV_HEADER_LENGTH = 44

export type SpeechSynthesisErrorKind =
  | 'http'
  | 'no_audio'
  | 'invalid_audio'
  | 'timeout'
  | 'network'

/**
 * 音声生成の失敗。メッセージには種別と HTTP ステータスだけを入れ、
 * API キー・声 ID・本文・応答本文は含めない（ログに残るため）。
 */
export class SpeechSynthesisError extends Error {
  constructor(
    public readonly kind: SpeechSynthesisErrorKind,
    public readonly status: number | null = null,
  ) {
    super(
      status === null
        ? `Gemini TTS failed: ${kind}`
        : `Gemini TTS failed: ${kind} ${status}`,
    )
    this.name = 'SpeechSynthesisError'
  }
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  )
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function speechCachePrefix(diaryId: string): string {
  return `speech/${diaryId}/`
}

/**
 * 読み上げ音声の R2 キー。本文・話し方・声・モデル・音声形式のどれかが変われば
 * 別のキーになるため、キーの一致で「音声が今の日記に合っているか」を判定できる。
 * スナップショット ID ではなく内容で決めるのは、背景色や画像だけを変えた
 * 再公開で音声を作り直す費用をかけないため。
 * 区切り文字の衝突（本文に改行を含むなど）で別の入力が同じハッシュにならないよう、
 * JSON の配列にしてからハッシュする。声 ID はハッシュの入力にだけ使い、キーには出さない。
 */
export async function speechCacheKey(
  diaryId: string,
  params: { body: string; style: string; voiceId: string },
): Promise<string> {
  const hash = await sha256Hex(
    JSON.stringify([
      SPEECH_MODEL,
      params.style,
      params.voiceId,
      SPEECH_MIME_TYPE,
      SPEECH_SAMPLE_RATE,
      params.body,
    ]),
  )
  return `${speechCachePrefix(diaryId)}${hash}.wav`
}

/**
 * 保存済みの本文と気分に対応する音声のキー。声 ID が未設定なら計算できないので null。
 * 生成 API と、公開時に下書きの音声を引き継いでよいかの判定で使う。
 */
export async function expectedSpeechKey(
  diary: { id: string; body: string; mood: string | null },
  voiceId: string | undefined,
): Promise<string | null> {
  if (!voiceId) return null
  return speechCacheKey(diary.id, {
    body: diary.body,
    style: speechStyleForMood(diary.mood).instruction,
    voiceId,
  })
}

type Base64Decoder = (data: string) => Uint8Array

function decodeBase64(data: string): Uint8Array {
  // 5MB 前後の音声を 1 バイトずつ戻すループは Workers の CPU 時間を食うため、
  // ランタイムにネイティブ実装があればそちらを使う
  const fromBase64 = (Uint8Array as unknown as { fromBase64?: Base64Decoder })
    .fromBase64
  if (typeof fromBase64 === 'function') {
    return fromBase64(data)
  }
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function matchesAscii(bytes: Uint8Array, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false
  }
  return true
}

/** 先頭が RIFF、8 バイト目から WAVE で、ヘッダ以上の長さがあるか */
export function isWav(bytes: Uint8Array): boolean {
  return (
    bytes.length >= WAV_HEADER_LENGTH &&
    matchesAscii(bytes, 0, 'RIFF') &&
    matchesAscii(bytes, 8, 'WAVE')
  )
}

type InteractionResponse = {
  steps?: {
    type?: string
    content?: { type?: string; data?: string }[]
  }[]
}

function extractAudioData(json: InteractionResponse): string | null {
  const audioParts = (json.steps ?? [])
    .filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content ?? [])
    .filter((part) => part.type === 'audio' && typeof part.data === 'string')
  return audioParts.at(-1)?.data ?? null
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  )
}

/**
 * Gemini TTS で本文を指定の声・話し方の WAV（24kHz / mono / 16bit）に変換する。
 * 失敗はすべて種別付きの SpeechSynthesisError にする。
 */
export async function synthesizeSpeech(options: {
  apiKey: string
  voiceId: string
  text: string
  style: string
  fetchFn?: typeof fetch
  timeoutMs?: number
}): Promise<Uint8Array> {
  const {
    apiKey,
    voiceId,
    text,
    style,
    fetchFn = fetch,
    timeoutMs = SYNTHESIZE_TIMEOUT_MS,
  } = options

  let res: Response
  try {
    res = await fetchFn(INTERACTIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        model: SPEECH_MODEL,
        input: [
          {
            type: 'user_input',
            content: [
              {
                type: 'text',
                text,
                annotations: [{ type: 'speech_metadata', style }],
              },
            ],
          },
        ],
        response_format: {
          type: 'audio',
          mime_type: SPEECH_MIME_TYPE,
          sample_rate: SPEECH_SAMPLE_RATE,
        },
        generation_config: { speech_config: [{ voice: voiceId }] },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw new SpeechSynthesisError(
      isTimeoutError(error) ? 'timeout' : 'network',
    )
  }

  if (!res.ok) {
    throw new SpeechSynthesisError('http', res.status)
  }

  let json: InteractionResponse
  try {
    json = (await res.json()) as InteractionResponse
  } catch (error) {
    // 本文の受信中にも打ち切り・切断は起こる。JSON として読めない応答は音声なしとして扱う
    if (isTimeoutError(error)) throw new SpeechSynthesisError('timeout')
    if (error instanceof SyntaxError) throw new SpeechSynthesisError('no_audio')
    throw new SpeechSynthesisError('network')
  }

  const data = extractAudioData(json)
  if (!data) {
    throw new SpeechSynthesisError('no_audio')
  }

  let audio: Uint8Array
  try {
    audio = decodeBase64(data)
  } catch {
    throw new SpeechSynthesisError('invalid_audio')
  }
  if (!isWav(audio)) {
    throw new SpeechSynthesisError('invalid_audio')
  }
  return audio
}

/**
 * 読み上げまわりの失敗をログに残す。API キー・声 ID・本文・Gemini の応答本文が
 * 混ざらないよう、種別と HTTP ステータス（それ以外の例外は名前）だけを出す。
 */
export function logSpeechError(context: string, error: unknown): void {
  if (error instanceof SpeechSynthesisError) {
    console.error(`[speech] ${context}:`, error.kind, error.status ?? '-')
    return
  }
  console.error(
    `[speech] ${context}:`,
    error instanceof Error ? error.name : 'unknown',
  )
}

/**
 * 日記に紐づく読み上げ音声を R2 から削除する。keepKeys に渡したキーは残す。
 * 下書き・公開中のどちらからも参照されなくなった古い音声や、日記削除時の孤児を
 * 残さないための best-effort 掃除。
 */
export async function deleteDiarySpeech(
  bucket: R2Bucket,
  diaryId: string,
  keepKeys: readonly (string | null | undefined)[] = [],
): Promise<void> {
  const keep = new Set(keepKeys.filter((key): key is string => !!key))
  const keys: string[] = []
  let cursor: string | undefined
  do {
    const listed = await bucket.list({
      prefix: speechCachePrefix(diaryId),
      ...(cursor ? { cursor } : {}),
    })
    keys.push(...listed.objects.map((obj) => obj.key))
    cursor = listed.truncated ? listed.cursor : undefined
  } while (cursor)

  await Promise.all(
    keys.filter((key) => !keep.has(key)).map((key) => bucket.delete(key)),
  )
}
