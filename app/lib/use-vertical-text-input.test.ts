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
  // body state の更新結果は rerender されないため、このテストでは観測しない。
  test('初期本文から消費マス数と超過状態を返す', () => {
    const normal = useVerticalTextInput('今日は晴れ')
    expect(normal.body).toBe('今日は晴れ')
    expect(normal.cellCount).toBe(5)
    expect(normal.isOver).toBe(false)

    const over = useVerticalTextInput('あ'.repeat(MAX_BODY_LENGTH + 1))
    expect(over.cellCount).toBe(MAX_BODY_LENGTH + 1)
    expect(over.isOver).toBe(true)
  })

  test('改行は列の残りマスを消費するためマス数は文字数より大きくなる', () => {
    // 「あ」(1文字) + 改行 → 1列(20マス)を丸ごと消費し、次列の「い」で21マス
    const { cellCount } = useVerticalTextInput('あ\nい')
    expect(cellCount).toBe(21)
  })

  test('列数超過の本文(APIから直接保存された等)は isOver になる', () => {
    // 空行だらけで文字数は少ないが21列 = 420マス消費 → 20列の grid に収まらない
    const { cellCount, isOver } = useVerticalTextInput('あ\n'.repeat(21))
    expect(cellCount).toBe(420)
    expect(isOver).toBe(true)
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

  test('textarea が未マウントなら caret 復元を呼ばない', () => {
    const requestAnimationFrame = vi.fn()
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)

    const { handleSpeechResult } = useVerticalTextInput('本文')

    handleSpeechResult('追加')

    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  test('音声入力後の caret 復元に失敗しても例外を投げない', () => {
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)

    const { handleSpeechResult, textareaRef } = useVerticalTextInput('本文')
    const setSelectionRange = vi.fn(() => {
      throw new Error('selection failed')
    })
    const target = textarea({
      setSelectionRange,
      value: '本文',
    })
    textareaRef.current = target

    expect(() => handleSpeechResult('追加')).not.toThrow()
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(setSelectionRange).toHaveBeenCalledWith(2, 2)
  })
})
