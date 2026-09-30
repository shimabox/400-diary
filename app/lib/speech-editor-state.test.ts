import { describe, expect, test } from 'vitest'
import {
  deriveSpeechView,
  GENERATE_LABEL,
  GENERATING_NOTICE,
  initialSpeechState,
  PUBLISH_TO_REFLECT_NOTICE,
  REGENERATE_LABEL,
  SAVE_FIRST_NOTICE,
  type SpeechBasis,
  type SpeechState,
  STALE_NOTICE,
  speechDraftSrc,
} from './speech-editor-state'

const SAVED: SpeechBasis = { body: '本文', mood: 'happy' }
const KEY = 'speech/abc/0123456789abcdef0123.wav'

function view(overrides: Partial<Parameters<typeof deriveSpeechView>[0]> = {}) {
  return deriveSpeechView({
    state: { key: null, basis: null },
    available: true,
    saved: SAVED,
    current: SAVED,
    publishedKey: undefined,
    generating: false,
    deleting: false,
    error: '',
    ...overrides,
  })
}

const FRESH: SpeechState = { key: KEY, basis: SAVED }

describe('initialSpeechState', () => {
  test('サーバで合っていると判定された音声は、開いた時点の本文と気分から作られたものとする', () => {
    expect(initialSpeechState({ key: KEY, matches: true, ...SAVED })).toEqual({
      key: KEY,
      basis: SAVED,
    })
  })

  test('合っていない・音声が無いなら basis は null', () => {
    expect(
      initialSpeechState({ key: KEY, matches: false, ...SAVED }).basis,
    ).toBeNull()
    expect(
      initialSpeechState({ key: null, matches: true, ...SAVED }).basis,
    ).toBeNull()
  })
})

describe('deriveSpeechView', () => {
  test('音声が無ければ「音声を作る」を出す', () => {
    const v = view()
    expect(v.showGenerate).toBe(true)
    expect(v.generateLabel).toBe(GENERATE_LABEL)
    expect(v.generateDisabled).toBe(false)
    expect(v.hasSpeech).toBe(false)
    expect(v.notice).toBeNull()
  })

  test('設定が無ければ「音声を作る」を出さない', () => {
    expect(view({ available: false }).showGenerate).toBe(false)
  })

  test('設定が無くても既存の音声があれば聞く・削除はできる（古い表示はしない）', () => {
    const v = view({ available: false, state: { key: KEY, basis: null } })
    expect(v.hasSpeech).toBe(true)
    expect(v.showGenerate).toBe(false)
    expect(v.deleteDisabled).toBe(false)
    expect(v.notice).toBeNull()
  })

  test('本文か気分に未保存の変更があれば案内して「音声を作る」を無効にする', () => {
    for (const current of [
      { ...SAVED, body: '書きかけ' },
      { ...SAVED, mood: 'sad' },
    ]) {
      const v = view({ current })
      expect(v.generateDisabled).toBe(true)
      expect(v.notice).toBe(SAVE_FIRST_NOTICE)
    }
  })

  test('一度も保存していなければ作れない', () => {
    expect(view({ saved: null }).generateDisabled).toBe(true)
  })

  test('音声が今の日記に合っていれば、作り直しは出さず削除だけにする', () => {
    const v = view({ state: FRESH })
    expect(v.hasSpeech).toBe(true)
    expect(v.isStale).toBe(false)
    expect(v.showGenerate).toBe(false)
    expect(v.notice).toBeNull()
  })

  test('保存済みの本文や気分が変わったら古い表示にし、「音声を作り直す」を出す', () => {
    for (const saved of [
      { ...SAVED, body: '直した本文' },
      { ...SAVED, mood: 'calm' },
    ]) {
      const v = view({ state: FRESH, saved, current: saved })
      expect(v.isStale).toBe(true)
      expect(v.showGenerate).toBe(true)
      expect(v.generateLabel).toBe(REGENERATE_LABEL)
      expect(v.generateDisabled).toBe(false)
      expect(v.notice).toBe(STALE_NOTICE)
    }
  })

  test('生成中は案内を出し、ボタンを無効にする', () => {
    const v = view({ generating: true })
    expect(v.notice).toBe(GENERATING_NOTICE)
    expect(v.generateDisabled).toBe(true)
    expect(v.deleteDisabled).toBe(true)
  })

  test('失敗したらメッセージを出し、再試行できる', () => {
    const v = view({ error: '音声を作れませんでした' })
    expect(v.notice).toBe('音声を作れませんでした')
    expect(v.generateDisabled).toBe(false)
  })
})

describe('deriveSpeechView の「公開する」の案内', () => {
  const OLD_KEY = 'speech/abc/fedcba9876543210ffff.wav'

  test('公開済みで、今の本文と気分に合う音声が公開版に無ければ案内する', () => {
    for (const publishedKey of [null, OLD_KEY]) {
      const v = view({ state: FRESH, publishedKey })
      expect(v.awaitingPublish).toBe(true)
      expect(v.notice).toBe(PUBLISH_TO_REFLECT_NOTICE)
    }
  })

  test('設定が無くても、合っている音声なら案内する（公開時の引き継ぎは声 ID だけで決まる）', () => {
    const v = view({ state: FRESH, publishedKey: null, available: false })
    expect(v.awaitingPublish).toBe(true)
  })

  test('公開版と同じ音声なら案内しない', () => {
    const v = view({ state: FRESH, publishedKey: KEY })
    expect(v.awaitingPublish).toBe(false)
    expect(v.notice).toBeNull()
  })

  test('音声が古いなら、公開しても下書きの音声は公開版に写らないので案内しない', () => {
    const saved = { ...SAVED, body: '直した本文' }
    const v = view({ state: FRESH, saved, current: saved, publishedKey: null })
    expect(v.awaitingPublish).toBe(false)
    expect(v.notice).toBe(STALE_NOTICE)
    expect(
      view({ state: { key: KEY, basis: null }, publishedKey: null })
        .awaitingPublish,
    ).toBe(false)
  })

  test('気分だけ変えて公開し、公開版に前の音声が残っても、古い音声には「作り直す」側の案内だけを出す', () => {
    const saved = { ...SAVED, mood: 'calm' }
    // 本文が同じなので、公開 API は前の公開版の音声（下書きと同じキー）を返す
    for (const publishedKey of [KEY, OLD_KEY]) {
      const v = view({ state: FRESH, saved, current: saved, publishedKey })
      expect(v.awaitingPublish).toBe(false)
      expect(v.notice).toBe(STALE_NOTICE)
    }
  })

  test('本文か気分に未保存の変更があれば、公開時に音声が古くなるので案内しない', () => {
    for (const current of [
      { ...SAVED, body: '書きかけ' },
      { ...SAVED, mood: 'sad' },
    ]) {
      const v = view({ state: FRESH, current, publishedKey: null })
      expect(v.awaitingPublish).toBe(false)
      expect(v.notice).toBeNull()
    }
  })

  test('未公開の日記・音声が無い日記では案内しない', () => {
    expect(view({ state: FRESH }).awaitingPublish).toBe(false)
    expect(view({ publishedKey: null }).awaitingPublish).toBe(false)
  })

  test('生成中・失敗時はそちらの案内を優先する', () => {
    expect(
      view({ state: FRESH, publishedKey: null, generating: true }).notice,
    ).toBe(GENERATING_NOTICE)
    expect(
      view({
        state: FRESH,
        publishedKey: null,
        error: '音声を削除できませんでした',
      }).notice,
    ).toBe('音声を削除できませんでした')
  })
})

describe('deriveSpeechView の「訪問者も声で聞ける」', () => {
  test('設定があれば、音声が無くても出す', () => {
    const v = view({ publishedKey: null })
    expect(v.showSpeechPublic).toBe(true)
    expect(v.showControls).toBe(true)
  })

  test('設定が無く音声も無ければ出さず、欄ごと出さない', () => {
    for (const publishedKey of [undefined, null]) {
      const v = view({ available: false, publishedKey })
      expect(v.showSpeechPublic).toBe(false)
      expect(v.showControls).toBe(false)
    }
  })

  test('設定が無くても下書きの音声があれば出す', () => {
    const v = view({ available: false, state: FRESH })
    expect(v.showSpeechPublic).toBe(true)
    expect(v.showControls).toBe(true)
  })

  test('設定が無くても公開版の音声だけがあれば出す', () => {
    const v = view({ available: false, publishedKey: KEY })
    expect(v.showSpeechPublic).toBe(true)
    expect(v.showControls).toBe(true)
  })
})

describe('speechDraftSrc', () => {
  test('キー由来の値を v に載せ、作り直すと URL が変わる', () => {
    expect(speechDraftSrc('abc', KEY)).toBe(
      '/api/speech/abc/draft?v=0123456789abcdef',
    )
    expect(
      speechDraftSrc('abc', 'speech/abc/fedcba9876543210ffff.wav'),
    ).not.toBe(speechDraftSrc('abc', KEY))
  })
})
