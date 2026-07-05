import { useCallback, useRef, useState } from 'hono/jsx'
import { MAX_BODY_LENGTH } from './constants'
import { countUsedCells, insertAtSelection, trimToGrid } from './grid'

export function useVerticalTextInput(initialBody: string) {
  const [body, setBody] = useState(initialBody)
  const composingRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSpeechResult = useCallback((text: string) => {
    const el = textareaRef.current
    if (!el) {
      setBody((prev) => trimToGrid(prev + text))
      return
    }
    const { text: next, caret } = insertAtSelection(
      el.value,
      text,
      el.selectionStart,
      el.selectionEnd,
    )
    setBody(next)
    requestAnimationFrame(() => {
      try {
        el.setSelectionRange(caret, caret)
      } catch {
        // 一部ブラウザで失敗しても無視する
      }
    })
  }, [])

  const handleInput = useCallback((e: Event) => {
    const target = e.target as HTMLTextAreaElement
    if (!composingRef.current) {
      const trimmed = trimToGrid(target.value)
      if (trimmed !== target.value) {
        target.value = trimmed
      }
    }
    setBody(target.value)
  }, [])

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback((e: Event) => {
    composingRef.current = false
    const target = e.target as HTMLTextAreaElement
    const trimmed = trimToGrid(target.value)
    if (trimmed !== target.value) {
      target.value = trimmed
    }
    setBody(target.value)
  }, [])

  // カウンターは文字数ではなく「消費マス数」を返す。改行が列の残りマスを消費するため、
  // 文字数表示だと「残りがあるのに入力できない」という乖離が生まれる（詳細は countUsedCells）。
  const cellCount = countUsedCells(body)

  return {
    body,
    cellCount,
    handleCompositionEnd,
    handleCompositionStart,
    handleInput,
    handleSpeechResult,
    isOver: cellCount > MAX_BODY_LENGTH,
    textareaRef,
  }
}
