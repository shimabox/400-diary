import { useCallback, useEffect, useRef, useState } from 'hono/jsx'

export type SpeechResultItem = {
  isFinal: boolean
  transcript: string
}

export type ExtractedSpeechResults = {
  finals: string[]
  interim: string
}

/** onresult の results から final / interim を分離する */
export function extractSpeechResults(
  results: SpeechResultItem[],
  resultIndex: number,
): ExtractedSpeechResults {
  const finals: string[] = []
  let interim = ''
  for (let i = resultIndex; i < results.length; i++) {
    if (results[i].isFinal) {
      finals.push(results[i].transcript)
    } else {
      interim += results[i].transcript
    }
  }
  return { finals, interim }
}

/** 自動再開してよいエラーかどうかを判定する */
export function isContinuableError(error: string): boolean {
  return error === 'no-speech'
}

type UseSpeechReturn = {
  isSupported: boolean
  isListening: boolean
  transcript: string
  start: (onResult: (text: string) => void) => void
  stop: () => void
}

export function useSpeech(): UseSpeechReturn {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const onResultRef = useRef<((text: string) => void) | null>(null)
  const activeRef = useRef(false)

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  useEffect(() => {
    return () => {
      activeRef.current = false
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [])

  const start = useCallback(
    (onResult: (text: string) => void) => {
      if (!isSupported) return

      onResultRef.current = onResult
      activeRef.current = true

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new SR()
      recognition.lang = 'ja-JP'
      recognition.continuous = false
      recognition.interimResults = true

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const items = Array.from({ length: event.results.length }, (_, i) => ({
          isFinal: event.results[i].isFinal,
          transcript: event.results[i][0].transcript,
        }))
        const { finals, interim } = extractSpeechResults(
          items,
          event.resultIndex,
        )
        for (const text of finals) {
          onResultRef.current?.(text)
        }
        if (finals.length > 0) {
          setTranscript('')
        }
        if (interim) {
          setTranscript(interim)
        }
      }

      recognition.onerror = (event: Event) => {
        const error = (event as { error?: string }).error ?? ''
        if (!isContinuableError(error)) {
          activeRef.current = false
        }
      }

      recognition.onend = () => {
        if (activeRef.current) {
          try {
            recognition.start()
          } catch {
            activeRef.current = false
            setIsListening(false)
            setTranscript('')
          }
        } else {
          setIsListening(false)
          setTranscript('')
        }
      }

      recognitionRef.current = recognition
      recognition.start()
      setIsListening(true)
    },
    [isSupported],
  )

  const stop = useCallback(() => {
    activeRef.current = false
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
    setTranscript('')
  }, [])

  return { isSupported, isListening, transcript, start, stop }
}
