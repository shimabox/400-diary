import { useCallback, useRef, useState } from 'hono/jsx'
import { MOODS, type MoodKey } from '../lib/mood'
import { useSpeech } from '../lib/use-speech'

const MAX_LENGTH = 256
const COLS = 16
const ROWS = 16
const CELL = 2.0 // em – 1マスのサイズ（正方形）

/** テキストが使う列数を計算する（改行で列が進む） */
function countColumns(text: string): number {
  if (text.length === 0) return 0
  return text
    .split('\n')
    .reduce(
      (cols, line) => cols + Math.max(1, Math.ceil(line.length / ROWS)),
      0,
    )
}

/** 文字数と列数の両方をグリッドに収まるよう切り詰める */
function trimToGrid(text: string): string {
  let trimmed = text.slice(0, MAX_LENGTH)
  while (trimmed.length > 0 && countColumns(trimmed) > COLS) {
    trimmed = trimmed.slice(0, -1)
  }
  return trimmed
}

type Props = {
  title?: string
  initialBody?: string
  initialDate?: string
  initialColor?: string
  initialImageLayout?: 'left' | 'right'
  initialMood?: string | null
  diaryId?: string
}

export default function VerticalEditor({
  title = '',
  initialBody = '',
  initialDate = '',
  initialColor = '#FFE4E1',
  initialImageLayout = 'left',
  initialMood = null,
  diaryId,
}: Props) {
  const [body, setBody] = useState(initialBody)
  const [date, setDate] = useState(initialDate)
  const [imageLayout, setImageLayout] = useState(initialImageLayout)
  const [mood, setMood] = useState<MoodKey | null>(
    (initialMood as MoodKey) ?? null,
  )
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState(diaryId ?? '')
  const [error, setError] = useState('')
  const composingRef = useRef(false)
  const {
    isSupported: speechSupported,
    isListening,
    transcript,
    start: startSpeech,
    stop: stopSpeech,
  } = useSpeech()

  const handleSpeechResult = useCallback((text: string) => {
    setBody((prev) => trimToGrid(prev + text))
  }, [])

  const charCount = body.length
  const isOver = charCount > MAX_LENGTH

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

  const handleSave = useCallback(async () => {
    if (!body.trim()) {
      setError('本文を入力してください')
      return
    }
    if (!date) {
      setError('日付を入力してください')
      return
    }
    if (body.length > MAX_LENGTH) {
      setError(`本文は${MAX_LENGTH}文字以内で入力してください`)
      return
    }

    setSaving(true)
    setError('')

    const url = diaryId ? `/api/diaries/${diaryId}` : '/api/diaries'
    const method = diaryId ? 'PUT' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          diary_date: date,
          background_color: initialColor,
          image_layout: imageLayout,
          mood,
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error || '保存に失敗しました')
        setSaving(false)
        return
      }

      const data = (await res.json()) as { id: string }
      setSavedId(data.id)
      setSaving(false)
    } catch {
      setError('保存に失敗しました')
      setSaving(false)
    }
  }, [body, date, initialColor, imageLayout, mood, diaryId])

  return (
    <div style={{ padding: '1rem', maxWidth: '100%' }}>
      {error && (
        <p
          style={{
            color: '#c0392b',
            marginBottom: '0.75rem',
            fontSize: '0.9rem',
          }}
        >
          {error}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1rem',
        }}
      >
        {title && <h1 style={{ fontSize: '1.2rem', margin: 0 }}>{title}</h1>}
        <input
          type="date"
          value={date}
          onInput={(e) => setDate((e.target as HTMLInputElement).value)}
          style={{
            fontFamily: 'inherit',
            fontSize: '0.95rem',
            padding: '0.4rem 0.6rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            background: '#fff',
          }}
        />
      </div>

      <div
        style={{
          position: 'relative',
          background: initialColor,
          borderRadius: '8px',
          padding: '1.5rem 1.5rem 0',
          overflow: 'hidden',
          fontSize: '1.1rem',
          width: 'fit-content',
          margin: '0 auto',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '1.5rem',
            right: '1.5rem',
            width: `calc(${COLS * CELL}em - 1px)`,
            height: `${ROWS * CELL}em`,
            pointerEvents: 'none',
            backgroundImage: `repeating-linear-gradient(to left, transparent, transparent calc(${CELL}em - 1px), rgba(0,0,0,0.08) calc(${CELL}em - 1px), rgba(0,0,0,0.08) ${CELL}em), repeating-linear-gradient(to bottom, transparent, transparent calc(${CELL}em - 1px), rgba(0,0,0,0.08) calc(${CELL}em - 1px), rgba(0,0,0,0.08) ${CELL}em)`,
          }}
        />
        <textarea
          value={body}
          onInput={handleInput}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder="今日のできごとを書く..."
          style={{
            writingMode: 'vertical-rl',
            width: `${COLS * CELL}em`,
            height: `${ROWS * CELL + 1}em`,
            fontFamily: 'inherit',
            fontSize: 'inherit',
            lineHeight: String(CELL),
            letterSpacing: `${CELL - 1}em`,
            boxSizing: 'content-box',
            padding: '0.5em 0 0 0',
            overflow: 'hidden',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            color: '#333',
            fontWeight: 600,
            position: 'relative',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginTop: '0.75rem',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
          {MOODS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMood(mood === m.key ? null : m.key)}
              title={m.label}
              style={{
                padding: '0.2rem 0.4rem',
                border: `2px solid ${mood === m.key ? m.color : 'transparent'}`,
                borderRadius: '6px',
                background: mood === m.key ? `${m.color}22` : 'transparent',
                cursor: 'pointer',
                fontSize: '1.1rem',
                lineHeight: 1,
              }}
            >
              {m.emoji}
            </button>
          ))}
        </div>
        {speechSupported && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                if (isListening) {
                  stopSpeech()
                } else {
                  startSpeech(handleSpeechResult)
                }
              }}
              style={{
                padding: '0.3rem 0.6rem',
                border: `1px solid ${isListening ? '#c0392b' : '#ccc'}`,
                borderRadius: '6px',
                background: isListening ? '#c0392b' : 'transparent',
                color: isListening ? '#fff' : '#666',
                cursor: 'pointer',
                fontSize: '0.85rem',
                animation: isListening ? 'pulse 1.5s infinite' : 'none',
              }}
            >
              {isListening ? '録音中...' : '音声入力'}
            </button>
            {transcript && (
              <span style={{ fontSize: '0.8rem', color: '#999' }}>
                {transcript}
              </span>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span
            style={{
              fontSize: '0.85rem',
              color: isOver ? '#c0392b' : '#888',
              fontWeight: isOver ? 'bold' : 'normal',
            }}
          >
            {charCount} / {MAX_LENGTH}
          </span>
          <div style={{ display: 'flex', gap: '0.25rem', fontSize: '0.85rem' }}>
            <button
              type="button"
              onClick={() => setImageLayout('left')}
              style={{
                padding: '0.2rem 0.5rem',
                border: '1px solid #ccc',
                borderRadius: '4px 0 0 4px',
                background: imageLayout === 'left' ? '#333' : '#fff',
                color: imageLayout === 'left' ? '#fff' : '#666',
                cursor: 'pointer',
              }}
            >
              画像左
            </button>
            <button
              type="button"
              onClick={() => setImageLayout('right')}
              style={{
                padding: '0.2rem 0.5rem',
                border: '1px solid #ccc',
                borderRadius: '0 4px 4px 0',
                background: imageLayout === 'right' ? '#333' : '#fff',
                color: imageLayout === 'right' ? '#fff' : '#666',
                cursor: 'pointer',
              }}
            >
              画像右
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <a
            href="/"
            style={{
              padding: '0.5rem 1.2rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '0.95rem',
              color: '#666',
            }}
          >
            一覧へ
          </a>
          {savedId && !saving && (
            <a
              href={`/d/${savedId}`}
              style={{
                padding: '0.5rem 1.2rem',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '0.95rem',
                color: '#666',
              }}
            >
              公開ページを見る
            </a>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || isOver}
            style={{
              padding: '0.5rem 1.5rem',
              background: saving || isOver ? '#ccc' : '#333',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.95rem',
            }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
