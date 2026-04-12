import { useCallback, useEffect, useRef, useState } from 'hono/jsx'
import { MAX_BODY_LENGTH } from '../lib/constants'
import { formatDiaryDate } from '../lib/format'
import { MOODS, type MoodKey } from '../lib/mood'
import { useSpeech } from '../lib/use-speech'
import FlowText from './flow-text'

const MAX_LENGTH = MAX_BODY_LENGTH
const COLS = Math.sqrt(MAX_LENGTH)
const ROWS = COLS
const CELL = 2.0 // em – 1マスのサイズ（正方形）

const IMAGE_MAX_SIZE = 5 * 1024 * 1024
const IMAGE_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]

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
  initialImageKey?: string | null
  diaryId?: string
  publishedAt?: string | null
}

export default function VerticalEditor({
  title = '',
  initialBody = '',
  initialDate = '',
  initialColor = '#FFE4E1',
  initialImageLayout = 'left',
  initialMood = null,
  initialImageKey = null,
  diaryId,
  publishedAt: initialPublishedAt = null,
}: Props) {
  const [body, setBody] = useState(initialBody)
  const [date, setDate] = useState(initialDate)
  const [bgColor, setBgColor] = useState(initialColor)
  const [imageLayout, setImageLayout] = useState(initialImageLayout)
  const [mood, setMood] = useState<MoodKey | null>(
    (initialMood as MoodKey) ?? null,
  )
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishedAt, setPublishedAt] = useState(initialPublishedAt)
  const [showPreview, setShowPreview] = useState(false)
  const [savedId, setSavedId] = useState(diaryId ?? '')
  const [error, setError] = useState('')
  const composingRef = useRef(false)
  const previewScrollRef = useRef<HTMLDivElement>(null)

  // プレビュー表示時にスクロールを右端（文章の先頭）にセット
  useEffect(() => {
    if (showPreview && previewScrollRef.current) {
      requestAnimationFrame(() => {
        const el = previewScrollRef.current
        if (el) el.scrollLeft = el.scrollWidth
      })
    }
  }, [showPreview, body])
  const {
    isSupported: speechSupported,
    isListening,
    transcript,
    start: startSpeech,
    stop: stopSpeech,
  } = useSpeech()

  // 画像関連
  const [imageKey, setImageKey] = useState(initialImageKey)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [_uploading, setUploading] = useState(false)
  const [imageError, setImageError] = useState('')
  const imageInputRef = useRef<HTMLInputElement>(null)

  const imageSrc = imagePreview ?? (imageKey ? `/api/images/${imageKey}` : null)

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

    const currentId = diaryId || savedId
    const url = currentId ? `/api/diaries/${currentId}` : '/api/diaries'
    const method = currentId ? 'PUT' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          diary_date: date,
          background_color: bgColor,
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
  }, [body, date, bgColor, imageLayout, mood, diaryId, savedId])

  const handlePublish = useCallback(async () => {
    const currentDiaryId = diaryId || savedId
    if (!currentDiaryId) return

    setPublishing(true)
    setError('')
    try {
      const res = await fetch(`/api/diaries/${currentDiaryId}/publish`, {
        method: 'POST',
      })
      if (!res.ok) {
        setError('公開に失敗しました')
        return
      }
      const data = (await res.json()) as { published_at: string }
      setPublishedAt(data.published_at)
    } catch {
      setError('公開に失敗しました')
    } finally {
      setPublishing(false)
    }
  }, [diaryId, savedId])

  const handleImageChange = useCallback(
    async (e: Event) => {
      const currentDiaryId = diaryId || savedId
      if (!currentDiaryId) {
        setImageError('先に日記を保存してください')
        return
      }

      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      setImageError('')

      if (!IMAGE_ALLOWED_TYPES.includes(file.type)) {
        setImageError('JPEG, PNG, WebP, GIF のみアップロードできます')
        return
      }
      if (file.size > IMAGE_MAX_SIZE) {
        setImageError('画像は5MB以内にしてください')
        return
      }

      const reader = new FileReader()
      reader.onload = () => setImagePreview(reader.result as string)
      reader.readAsDataURL(file)

      setUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch(`/api/diaries/${currentDiaryId}/image`, {
          method: 'POST',
          body: formData,
        })
        if (!res.ok) {
          const data = (await res.json()) as { error?: string }
          setImageError(data.error || 'アップロードに失敗しました')
          setImagePreview(null)
          return
        }
        const data = (await res.json()) as { image_key: string }
        setImageKey(data.image_key)
        setImagePreview(null)
      } catch {
        setImageError('アップロードに失敗しました')
        setImagePreview(null)
      } finally {
        setUploading(false)
        if (imageInputRef.current) imageInputRef.current.value = ''
      }
    },
    [diaryId, savedId],
  )

  const handleImageDelete = useCallback(async () => {
    const currentDiaryId = diaryId || savedId
    if (!currentDiaryId) return
    if (!confirm('画像を削除しますか？')) return

    setImageError('')
    try {
      const res = await fetch(`/api/diaries/${currentDiaryId}/image`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        setImageError('削除に失敗しました')
        return
      }
      setImageKey(null)
      setImagePreview(null)
    } catch {
      setImageError('削除に失敗しました')
    }
  }, [diaryId, savedId])

  return (
    <div style={{ padding: '1rem 0', maxWidth: '100%' }}>
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
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
          <input
            type="color"
            value={bgColor}
            onInput={(e) => setBgColor((e.target as HTMLInputElement).value)}
            title="背景色"
            style={{
              width: '2rem',
              height: '2rem',
              padding: '0',
              border: '1px solid #ccc',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          />
        </div>
      </div>

      {showPreview ? (
        <div
          style={{
            position: 'relative',
            background: bgColor,
            backgroundImage: 'url(/images/background.png)',
            backgroundRepeat: 'repeat',
            backgroundBlendMode: 'luminosity',
            borderRadius: '12px',
            padding: '2rem 2.6rem',
            maxWidth: '960px',
            width: '100%',
            height: '480px',
            overflowX: 'auto',
            overflowY: 'hidden',
          }}
          ref={previewScrollRef}
          class="hide-scrollbar"
        >
          <div style={{ minWidth: '880px' }}>
            <FlowText
              text={body}
              fontSize={17.6}
              lineHeight={2}
              imageLayout={imageLayout}
              imageSrc={imageSrc}
              containerHeight={416}
              imageTop={0}
              dateLabel={date ? formatDiaryDate(date) : '----/--/--'}
            />
          </div>
        </div>
      ) : (
        <div
          class="editor-grid"
          style={{
            position: 'relative',
            background: bgColor,
            borderRadius: '8px',
            padding: '1.5rem',
            overflow: 'hidden',
            width: 'fit-content',
            margin: '0 auto',
          }}
        >
          <div style={{ position: 'relative' }}>
            <div
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
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
        </div>
      )}

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
        class="editor-toolbar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.5rem',
          marginTop: '0.5rem',
        }}
      >
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

        {/* 画像アップロード */}
        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
          <label
            style={{
              padding: '0.2rem 0.5rem',
              border: '1px solid #999',
              borderRadius: '4px',
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            {imageKey ? '画像を変更' : '画像を追加'}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleImageChange}
              style={{ display: 'none' }}
            />
          </label>
          {imageKey && (
            <button
              type="button"
              onClick={handleImageDelete}
              style={{
                padding: '0.2rem 0.5rem',
                background: 'transparent',
                color: '#c0392b',
                border: '1px solid #c0392b',
                borderRadius: '4px',
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              画像を削除
            </button>
          )}
        </div>
        <a
          href="/"
          style={{
            padding: '0.3rem 0.8rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '0.85rem',
            color: '#666',
          }}
        >
          一覧へ
        </a>
        {savedId && publishedAt && (
          <a
            href={`/d/${savedId}`}
            style={{
              padding: '0.3rem 0.8rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontSize: '0.85rem',
              color: '#666',
            }}
          >
            公開ページを見る
          </a>
        )}
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          style={{
            padding: '0.3rem 0.8rem',
            border: '1px solid #ccc',
            borderRadius: '4px',
            background: showPreview ? '#333' : '#fff',
            color: showPreview ? '#fff' : '#666',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          {showPreview ? '編集に戻る' : 'プレビュー'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || isOver}
          style={{
            padding: '0.3rem 1rem',
            background: saving || isOver ? '#ccc' : '#333',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '0.85rem',
          }}
        >
          {saving ? '保存中...' : '保存'}
        </button>
        {savedId && (
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing || saving}
            style={{
              padding: '0.3rem 1rem',
              background: publishing ? '#ccc' : '#2e7d32',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '0.85rem',
            }}
          >
            {publishing ? '公開中...' : '公開する'}
          </button>
        )}
      </div>

      {imageError && (
        <p
          style={{
            color: '#c0392b',
            fontSize: '0.85rem',
            marginTop: '0.5rem',
          }}
        >
          {imageError}
        </p>
      )}
    </div>
  )
}
