import { useCallback, useEffect, useRef, useState } from 'hono/jsx'

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

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [])

  const start = useCallback(
    (onResult: (text: string) => void) => {
      if (!isSupported) return

      onResultRef.current = onResult

      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new SR()
      recognition.lang = 'ja-JP'
      recognition.continuous = true
      recognition.interimResults = true

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) {
            const finalText = result[0].transcript
            onResultRef.current?.(finalText)
            setTranscript('')
          } else {
            interim += result[0].transcript
          }
        }
        if (interim) {
          setTranscript(interim)
        }
      }

      recognition.onerror = () => {
        setIsListening(false)
        setTranscript('')
      }

      recognition.onend = () => {
        setIsListening(false)
        setTranscript('')
      }

      recognitionRef.current = recognition
      recognition.start()
      setIsListening(true)
    },
    [isSupported],
  )

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
    setTranscript('')
  }, [])

  return { isSupported, isListening, transcript, start, stop }
}
