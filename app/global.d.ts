import type {} from 'hono'

declare global {
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList
    resultIndex: number
  }

  interface SpeechRecognitionResultList {
    length: number
    item(index: number): SpeechRecognitionResult
    [index: number]: SpeechRecognitionResult
  }

  interface SpeechRecognitionResult {
    length: number
    item(index: number): SpeechRecognitionAlternative
    [index: number]: SpeechRecognitionAlternative
    isFinal: boolean
  }

  interface SpeechRecognitionAlternative {
    transcript: string
    confidence: number
  }

  interface SpeechRecognition extends EventTarget {
    lang: string
    continuous: boolean
    interimResults: boolean
    start(): void
    stop(): void
    abort(): void
    onresult: ((event: SpeechRecognitionEvent) => void) | null
    onerror: ((event: Event) => void) | null
    onend: (() => void) | null
  }

  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

type Head = {
  title?: string
  description?: string
  ogImage?: string
}

declare module 'hono' {
  interface ContextRenderer {
    // biome-ignore lint/style/useShorthandFunctionType: interface needed for module augmentation
    (
      content: string | Promise<string>,
      head?: Head,
    ): Response | Promise<Response>
  }
}
