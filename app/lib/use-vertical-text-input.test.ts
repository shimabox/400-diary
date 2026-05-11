import { afterEach, describe, expect, test, vi } from 'vitest'
import { MAX_BODY_LENGTH } from './constants'
import { useVerticalTextInput } from './use-vertical-text-input'

function inputEvent(target: Partial<HTMLTextAreaElement>): Event {
  return { target } as Event
}

function textarea(overrides: Partial<HTMLTextAreaElement> = {}) {
  return {
    selectionEnd: 0,
    selectionStart: 0,
    setSelectionRange: vi.fn(),
    value: '',
    ...overrides,
  } as unknown as HTMLTextAreaElement
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useVerticalTextInput', () => {
  // hono/jsx の hooks は render context 外でも初期値と callback を返す。
  // ここでは textarea の値補正と caret 復元だけを直接検証する。
  test('初期本文から文字数と超過状態を返す', () => {
    const normal = useVerticalTextInput('今日は晴れ')
    expect(normal.body).toBe('今日は晴れ')
    expect(normal.charCount).toBe(5)
    expect(normal.isOver).toBe(false)

    const over = useVerticalTextInput('あ'.repeat(MAX_BODY_LENGTH + 1))
    expect(over.charCount).toBe(MAX_BODY_LENGTH + 1)
    expect(over.isOver).toBe(true)
  })

  test('通常入力では400文字に切り詰める', () => {
    const { handleInput } = useVerticalTextInput('')
    const target = textarea({ value: 'あ'.repeat(MAX_BODY_LENGTH + 1) })

    handleInput(inputEvent(target))

    expect(target.value).toBe('あ'.repeat(MAX_BODY_LENGTH))
  })

  test('IME composition 中は入力値を切り詰めない', () => {
    const { handleCompositionStart, handleInput } = useVerticalTextInput('')
    const target = textarea({ value: 'あ'.repeat(MAX_BODY_LENGTH + 1) })

    handleCompositionStart()
    handleInput(inputEvent(target))

    expect(target.value).toBe('あ'.repeat(MAX_BODY_LENGTH + 1))
  })

  test('IME composition end で入力値を切り詰める', () => {
    const { handleCompositionEnd, handleCompositionStart, handleInput } =
      useVerticalTextInput('')
    const target = textarea({ value: 'あ'.repeat(MAX_BODY_LENGTH + 1) })

    handleCompositionStart()
    handleInput(inputEvent(target))
    handleCompositionEnd(inputEvent(target))

    expect(target.value).toBe('あ'.repeat(MAX_BODY_LENGTH))
  })

  test('音声入力後に挿入位置の直後へ caret を戻す', () => {
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)

    const { handleSpeechResult, textareaRef } =
      useVerticalTextInput('今日は晴れです')
    const target = textarea({
      selectionEnd: 4,
      selectionStart: 2,
      value: '今日は晴れです',
    })
    textareaRef.current = target

    handleSpeechResult('とても')

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(target.setSelectionRange).toHaveBeenCalledWith(5, 5)
  })

  test('音声入力後の caret 復元に失敗しても例外を投げない', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })

    const { handleSpeechResult, textareaRef } = useVerticalTextInput('本文')
    const target = textarea({
      setSelectionRange: vi.fn(() => {
        throw new Error('selection failed')
      }),
      value: '本文',
    })
    textareaRef.current = target

    expect(() => handleSpeechResult('追加')).not.toThrow()
  })
})
