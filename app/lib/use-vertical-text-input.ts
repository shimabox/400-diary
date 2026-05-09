import { useCallback, useRef, useState } from 'hono/jsx'
import { MAX_BODY_LENGTH } from './constants'
import { insertAtSelection, trimToGrid } from './grid'

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

  return {
    body,
    charCount: body.length,
    handleCompositionEnd,
    handleCompositionStart,
    handleInput,
    handleSpeechResult,
    isOver: body.length > MAX_BODY_LENGTH,
    textareaRef,
  }
}
