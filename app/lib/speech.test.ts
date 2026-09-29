import type { R2Bucket } from '@cloudflare/workers-types/latest'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  deleteDiarySpeech,
  expectedSpeechKey,
  isWav,
  SPEECH_MODEL,
  SpeechSynthesisError,
  speechCacheKey,
  synthesizeSpeech,
} from './speech'
import { speechStyleForMood } from './speech-style'

const STYLE = '日記を読み聞かせるように、落ち着いて自然なペースで'

/** RIFF/WAVE ヘッダを持つ最小限の WAV バイト列 */
function makeWav(dataLength = 4): Uint8Array {
  const bytes = new Uint8Array(44 + dataLength)
  bytes.set(new TextEncoder().encode('RIFF'), 0)
  bytes.set(new TextEncoder().encode('WAVE'), 8)
  return bytes
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

describe('speechStyleForMood', () => {
  test.each([
    ['happy', '明るく弾んだ声で', '嬉しい'],
    ['fun', '楽しそうに、はずむように', '楽しい'],
    ['calm', '落ち着いて、やわらかく', '穏やか'],
    ['sad', '静かに、少しゆっくり、悲しそうに', '悲しい'],
    ['angry', '少し強い口調で、感情を込めて', '怒り'],
    ['anxious', '不安そうに、ためらいがちに', '不安'],
  ])('気分 %s は対応表どおりの話し方になる', (mood, label, moodLabel) => {
    expect(speechStyleForMood(mood)).toEqual({
      instruction: `日記を読み聞かせるように、${label}`,
      label,
      moodLabel,
    })
  })

  test.each([
    null,
    'unknown',
  ])('気分なし・不明（%s）は既定の話し方になる', (mood) => {
    expect(speechStyleForMood(mood)).toEqual({
      instruction: STYLE,
      label: '落ち着いて自然なペースで',
      moodLabel: null,
    })
  })
})

describe('speechCacheKey', () => {
  const base = { body: '本文', style: STYLE, voiceId: 'voice_a' }

  test('speech/{diaryId}/ 配下の wav キーを返し、声 ID を含めない', async () => {
    const key = await speechCacheKey('diary-1', base)
    expect(key).toMatch(/^speech\/diary-1\/[0-9a-f]{64}\.wav$/)
    expect(key).not.toContain('voice_a')
  })

  test('同じ本文・話し方・声なら同じキーになる（作り直さずに済む）', async () => {
    const a = await speechCacheKey('diary-1', base)
    const b = await speechCacheKey('diary-1', { ...base })
    expect(a).toBe(b)
  })

  test.each([
    ['本文', { body: '本文を直した' }],
    ['話し方', { style: '日記を読み聞かせるように、明るく弾んだ声で' }],
    ['声', { voiceId: 'voice_b' }],
  ])('%sが変わればキーも変わる', async (_label, change) => {
    const a = await speechCacheKey('diary-1', base)
    const b = await speechCacheKey('diary-1', { ...base, ...change })
    expect(a).not.toBe(b)
  })

  test('区切り文字をまたいだ入力でも別のキーになる', async () => {
    const a = await speechCacheKey('diary-1', {
      body: 'b',
      style: 's\nx',
      voiceId: 'v',
    })
    const b = await speechCacheKey('diary-1', {
      body: 'b',
      style: 's',
      voiceId: 'x\nv',
    })
    expect(a).not.toBe(b)
  })

  test('音声形式が変わればキーも変わる', async () => {
    const a = await speechCacheKey('diary-1', base)
    // 形式はモジュールの定数なので、ハッシュの入力に含まれていることを
    // 形式だけを変えた JSON 配列のハッシュと比べて確かめる
    const digest = async (input: unknown[]) => {
      const buf = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(input)),
      )
      return [...new Uint8Array(buf)]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    }
    const withFormat = await digest([
      SPEECH_MODEL,
      STYLE,
      'voice_a',
      'audio/wav',
      24000,
      '本文',
    ])
    const otherRate = await digest([
      SPEECH_MODEL,
      STYLE,
      'voice_a',
      'audio/wav',
      16000,
      '本文',
    ])
    expect(a).toBe(`speech/diary-1/${withFormat}.wav`)
    expect(a).not.toBe(`speech/diary-1/${otherRate}.wav`)
  })
})

describe('expectedSpeechKey', () => {
  test('保存済みの本文と気分の話し方からキーを計算する', async () => {
    const key = await expectedSpeechKey(
      { id: 'diary-1', body: '本文', mood: 'happy' },
      'voice_a',
    )
    expect(key).toBe(
      await speechCacheKey('diary-1', {
        body: '本文',
        style: speechStyleForMood('happy').instruction,
        voiceId: 'voice_a',
      }),
    )
  })

  test('気分が変わればキーも変わる（音声が古くなる）', async () => {
    const a = await expectedSpeechKey(
      { id: 'diary-1', body: '本文', mood: 'happy' },
      'voice_a',
    )
    const b = await expectedSpeechKey(
      { id: 'diary-1', body: '本文', mood: 'sad' },
      'voice_a',
    )
    expect(a).not.toBe(b)
  })

  test('声 ID が未設定なら null', async () => {
    await expect(
      expectedSpeechKey({ id: 'diary-1', body: '本文', mood: null }, undefined),
    ).resolves.toBeNull()
  })
})

describe('isWav', () => {
  test('RIFF / WAVE のヘッダを持つ 44 バイト以上なら true', () => {
    expect(isWav(makeWav(0))).toBe(true)
  })

  test('ヘッダより短いものは false', () => {
    expect(isWav(makeWav(0).slice(0, 43))).toBe(false)
  })

  test('WAVE でないものは false', () => {
    const bytes = makeWav()
    bytes.set(new TextEncoder().encode('AVI '), 8)
    expect(isWav(bytes)).toBe(false)
  })
})

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function audioResponse(data: string): Response {
  return jsonResponse({
    steps: [
      { type: 'user_input', content: [{ type: 'text', text: '本文' }] },
      { type: 'model_output', content: [{ type: 'audio', data }] },
    ],
  })
}

const SECRET_OPTIONS = {
  apiKey: 'secret-key',
  voiceId: 'secret-voice',
  text: '秘密の本文',
  style: STYLE,
}

async function expectSynthesisError(
  promise: Promise<unknown>,
  kind: string,
  status: number | null = null,
) {
  const error = await promise.then(
    () => {
      throw new Error('例外にならなかった')
    },
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(SpeechSynthesisError)
  expect(error).toMatchObject({ kind, status })
  const message = (error as Error).message
  expect(message).not.toMatch(/secret-key|secret-voice|秘密の本文/)
}

describe('synthesizeSpeech', () => {
  afterEach(() => {
    delete (Uint8Array as unknown as { fromBase64?: unknown }).fromBase64
  })

  test('モデル・声・話し方・形式を指定して Interactions API を呼び、音声を base64 から戻す', async () => {
    const wav = makeWav()
    const fetchFn = vi.fn().mockResolvedValue(audioResponse(toBase64(wav)))

    const audio = await synthesizeSpeech({
      apiKey: 'key',
      voiceId: 'voice_a',
      text: '本文',
      style: STYLE,
      fetchFn,
    })

    expect(audio).toEqual(wav)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
    )
    expect(init.method).toBe('POST')
    expect(init.headers['x-goog-api-key']).toBe('key')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    const body = JSON.parse(init.body)
    expect(body.model).toBe(SPEECH_MODEL)
    expect(body.model).toBe('gemini-3.8-flash-tts')
    expect(body.input).toEqual([
      {
        type: 'user_input',
        content: [
          {
            type: 'text',
            text: '本文',
            annotations: [{ type: 'speech_metadata', style: STYLE }],
          },
        ],
      },
    ])
    expect(body.response_format).toEqual({
      type: 'audio',
      mime_type: 'audio/wav',
      sample_rate: 24000,
    })
    expect(body.generation_config.speech_config).toEqual([{ voice: 'voice_a' }])
  })

  test('音声が複数あれば最後のものを使う', async () => {
    const first = makeWav(1)
    const last = makeWav(2)
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        steps: [
          {
            type: 'model_output',
            content: [{ type: 'audio', data: toBase64(first) }],
          },
          {
            type: 'model_output',
            content: [{ type: 'audio', data: toBase64(last) }],
          },
        ],
      }),
    )

    const audio = await synthesizeSpeech({ ...SECRET_OPTIONS, fetchFn })
    expect(audio).toEqual(last)
  })

  test('Uint8Array.fromBase64 があればそれで復号する', async () => {
    const wav = makeWav()
    const fromBase64 = vi.fn().mockReturnValue(wav)
    ;(Uint8Array as unknown as { fromBase64: unknown }).fromBase64 = fromBase64
    const fetchFn = vi.fn().mockResolvedValue(audioResponse('AAAA'))

    const audio = await synthesizeSpeech({ ...SECRET_OPTIONS, fetchFn })

    expect(fromBase64).toHaveBeenCalledWith('AAAA')
    expect(audio).toBe(wav)
  })

  test('API がエラーを返したら http 種別とステータスの例外にする', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'secret-voice denied' }, 403))

    const promise = synthesizeSpeech({ ...SECRET_OPTIONS, fetchFn })

    await expectSynthesisError(promise, 'http', 403)
    await expect(promise).rejects.toThrow('403')
  })

  test('応答に音声が無ければ no_audio', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        steps: [{ type: 'model_output', content: [{ type: 'text' }] }],
      }),
    )

    await expectSynthesisError(
      synthesizeSpeech({ ...SECRET_OPTIONS, fetchFn }),
      'no_audio',
    )
  })

  test('応答が JSON でなければ no_audio', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('not json'))

    await expectSynthesisError(
      synthesizeSpeech({ ...SECRET_OPTIONS, fetchFn }),
      'no_audio',
    )
  })

  test('WAV として不正な音声は invalid_audio', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(audioResponse(btoa('RIFF0000MP3 not a wav')))

    await expectSynthesisError(
      synthesizeSpeech({ ...SECRET_OPTIONS, fetchFn }),
      'invalid_audio',
    )
  })

  test('base64 として不正な音声は invalid_audio', async () => {
    const fetchFn = vi.fn().mockResolvedValue(audioResponse('%%%'))

    await expectSynthesisError(
      synthesizeSpeech({ ...SECRET_OPTIONS, fetchFn }),
      'invalid_audio',
    )
  })

  test('タイムアウトは timeout', async () => {
    const fetchFn = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason),
          )
        }),
    )

    await expectSynthesisError(
      synthesizeSpeech({
        ...SECRET_OPTIONS,
        fetchFn: fetchFn as unknown as typeof fetch,
        timeoutMs: 1,
      }),
      'timeout',
    )
  })

  test('通信失敗は network', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(new TypeError('fetch failed: secret-key'))

    await expectSynthesisError(
      synthesizeSpeech({ ...SECRET_OPTIONS, fetchFn }),
      'network',
    )
  })
})

describe('deleteDiarySpeech', () => {
  function mockBucket(keys: string[]) {
    const list = vi.fn().mockResolvedValue({
      objects: keys.map((key) => ({ key })),
      truncated: false,
    })
    const del = vi.fn().mockResolvedValue(undefined)
    return { bucket: { list, delete: del } as unknown as R2Bucket, list, del }
  }

  test('speech/{diaryId}/ 配下を全て削除する', async () => {
    const { bucket, list, del } = mockBucket([
      'speech/diary-1/a.wav',
      'speech/diary-1/b.wav',
    ])

    await deleteDiarySpeech(bucket, 'diary-1')

    expect(list).toHaveBeenCalledWith({ prefix: 'speech/diary-1/' })
    expect(del).toHaveBeenCalledTimes(2)
  })

  test('残すキーの集合に含まれるものは消さない', async () => {
    const { bucket, del } = mockBucket([
      'speech/diary-1/old.wav',
      'speech/diary-1/draft.wav',
      'speech/diary-1/published.wav',
    ])

    await deleteDiarySpeech(bucket, 'diary-1', [
      'speech/diary-1/draft.wav',
      'speech/diary-1/published.wav',
      null,
    ])

    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith('speech/diary-1/old.wav')
  })

  test('一覧が複数ページに分かれていても全て削除する', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        objects: [{ key: 'speech/diary-1/a.wav' }],
        truncated: true,
        cursor: 'next',
      })
      .mockResolvedValueOnce({
        objects: [{ key: 'speech/diary-1/b.wav' }],
        truncated: false,
      })
    const del = vi.fn().mockResolvedValue(undefined)
    const bucket = { list, delete: del } as unknown as R2Bucket

    await deleteDiarySpeech(bucket, 'diary-1')

    expect(list).toHaveBeenLastCalledWith({
      prefix: 'speech/diary-1/',
      cursor: 'next',
    })
    expect(del).toHaveBeenCalledWith('speech/diary-1/a.wav')
    expect(del).toHaveBeenCalledWith('speech/diary-1/b.wav')
  })
})
