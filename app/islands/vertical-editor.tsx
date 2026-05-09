import { useCallback, useEffect, useRef, useState } from 'hono/jsx'
import { audioExtension, baseMimeType } from '../lib/audio-mime'
import { PASTEL_COLORS } from '../lib/colors'
import {
  MAX_AUDIO_SIZE,
  MAX_BODY_LENGTH,
  MAX_IMAGE_SIZE,
} from '../lib/constants'
import { formatDiaryDate } from '../lib/format'
import { COLS, insertAtSelection, ROWS, trimToGrid } from '../lib/grid'
import { MOODS, type MoodKey } from '../lib/mood'
import { useSpeech } from '../lib/use-speech'
import ConfirmDialog from './confirm-dialog'
import FlowText from './flow-text'

const CELL = 2.0 // em – 1マスのサイズ（正方形）

const IMAGE_MAX_SIZE = MAX_IMAGE_SIZE
const IMAGE_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]
const AUDIO_ALLOWED_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/webm',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
]
const RECORDING_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
]

type Props = {
  title?: string
  initialBody?: string
  initialDate?: string
  initialColor?: string
  initialImageLayout?: 'left' | 'right'
  initialMood?: string | null
  initialImageKey?: string | null
  initialAudioKey?: string | null
  initialImageX?: number | null
  initialImageY?: number | null
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
  initialAudioKey = null,
  initialImageX = null,
  initialImageY = null,
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // プレビュー表示時にスクロールを右端（文章の先頭）にセット
  useEffect(() => {
    if (showPreview && previewScrollRef.current) {
      requestAnimationFrame(() => {
        const el = previewScrollRef.current
        if (el) el.scrollLeft = el.scrollWidth
      })
    }
  }, [showPreview])

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      for (const track of recordingStreamRef.current?.getTracks() ?? []) {
        track.stop()
      }
    }
  }, [])
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
  const [imageError, setImageError] = useState('')
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [imageX, setImageX] = useState<number | null>(initialImageX)
  const [imageY, setImageY] = useState<number | null>(initialImageY)
  const [showImageDeleteConfirm, setShowImageDeleteConfirm] = useState(false)

  // 音声関連
  const [audioKey, setAudioKey] = useState(initialAudioKey)
  const [audioError, setAudioError] = useState('')
  const [audioUploading, setAudioUploading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const [showAudioDeleteConfirm, setShowAudioDeleteConfirm] = useState(false)

  const currentDiaryId = diaryId || savedId
  const imageSrc = imagePreview ?? (imageKey ? `/api/images/${imageKey}` : null)
  const audioSrc = audioKey ? `/api/audio/${audioKey}` : null

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

  const charCount = body.length
  const isOver = charCount > MAX_BODY_LENGTH

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

  const saveDraft = useCallback(async (): Promise<string | null> => {
    if (!body.trim()) {
      setError('本文を入力してください')
      return null
    }
    if (!date) {
      setError('日付を入力してください')
      return null
    }
    if (body.length > MAX_BODY_LENGTH) {
      setError(`本文は${MAX_BODY_LENGTH}文字以内で入力してください`)
      return null
    }

    setSaving(true)
    setError('')

    const url = currentDiaryId
      ? `/api/diaries/${currentDiaryId}`
      : '/api/diaries'
    const method = currentDiaryId ? 'PUT' : 'POST'

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
          image_x: imageX,
          image_y: imageY,
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error || '保存に失敗しました')
        setSaving(false)
        return null
      }

      const data = (await res.json()) as { id: string }
      setSavedId(data.id)
      setSaving(false)
      return data.id
    } catch {
      setError('保存に失敗しました')
      setSaving(false)
      return null
    }
  }, [body, date, bgColor, imageLayout, mood, imageX, imageY, currentDiaryId])

  const handleSave = useCallback(async () => {
    await saveDraft()
  }, [saveDraft])

  const handlePublish = useCallback(async () => {
    setPublishing(true)
    setError('')
    try {
      const savedDiaryId = await saveDraft()
      if (!savedDiaryId) return

      const res = await fetch(`/api/diaries/${savedDiaryId}/publish`, {
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
  }, [saveDraft])

  const handleImageChange = useCallback(
    async (e: Event) => {
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
        setImageError(
          `画像は${MAX_IMAGE_SIZE / (1024 * 1024)}MB以内にしてください`,
        )
        return
      }

      const reader = new FileReader()
      reader.onload = () => setImagePreview(reader.result as string)
      reader.readAsDataURL(file)

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
        if (imageInputRef.current) imageInputRef.current.value = ''
      }
    },
    [currentDiaryId],
  )

  const handleImageDelete = useCallback(async () => {
    setShowImageDeleteConfirm(false)
    if (!currentDiaryId) return

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
  }, [currentDiaryId])

  const uploadAudioFile = useCallback(
    async (file: File) => {
      if (!currentDiaryId) {
        setAudioError('先に日記を保存してください')
        return
      }

      setAudioError('')

      if (!AUDIO_ALLOWED_TYPES.includes(baseMimeType(file.type))) {
        setAudioError('MP3, WebM, MP4, WAV, Ogg のみアップロードできます')
        return
      }
      if (file.size > MAX_AUDIO_SIZE) {
        setAudioError(
          `音声は${MAX_AUDIO_SIZE / (1024 * 1024)}MB以内にしてください`,
        )
        return
      }

      setAudioUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch(`/api/diaries/${currentDiaryId}/audio`, {
          method: 'POST',
          body: formData,
        })
        if (!res.ok) {
          const data = (await res.json()) as { error?: string }
          setAudioError(data.error || 'アップロードに失敗しました')
          return
        }
        const data = (await res.json()) as { audio_key: string }
        setAudioKey(data.audio_key)
      } catch {
        setAudioError('アップロードに失敗しました')
      } finally {
        setAudioUploading(false)
        if (audioInputRef.current) audioInputRef.current.value = ''
      }
    },
    [currentDiaryId],
  )

  const handleAudioChange = useCallback(
    async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      await uploadAudioFile(file)
    },
    [uploadAudioFile],
  )

  const handleAudioDelete = useCallback(async () => {
    setShowAudioDeleteConfirm(false)
    if (!currentDiaryId) return

    setAudioError('')
    try {
      const res = await fetch(`/api/diaries/${currentDiaryId}/audio`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        setAudioError('削除に失敗しました')
        return
      }
      setAudioKey(null)
    } catch {
      setAudioError('削除に失敗しました')
    }
  }, [currentDiaryId])

  const pickRecordingType = useCallback(() => {
    if (typeof MediaRecorder === 'undefined') return ''
    return (
      RECORDING_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
    )
  }, [])

  const startRecording = useCallback(async () => {
    if (!currentDiaryId) {
      setAudioError('先に日記を保存してください')
      return
    }
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setAudioError('このブラウザでは録音できません')
      return
    }

    setAudioError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickRecordingType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)

      recordingStreamRef.current = stream
      recordingChunksRef.current = []
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          recordingChunksRef.current = [
            ...(recordingChunksRef.current ?? []),
            event.data,
          ]
        }
      }

      recorder.onstop = () => {
        const chunks = recordingChunksRef.current ?? []
        const type = recorder.mimeType || chunks[0]?.type
        const blob = new Blob(chunks, { type })
        recordingChunksRef.current = []
        for (const track of stream.getTracks()) {
          track.stop()
        }
        recordingStreamRef.current = null
        mediaRecorderRef.current = null
        setIsRecording(false)

        if (!type) {
          setAudioError('録音形式を判定できませんでした')
          return
        }

        void uploadAudioFile(
          new File([blob], `recording-${Date.now()}.${audioExtension(type)}`, {
            type,
          }),
        )
      }

      recorder.start()
      setIsRecording(true)
    } catch {
      setAudioError('マイクを使用できませんでした')
      setIsRecording(false)
    }
  }, [currentDiaryId, pickRecordingType, uploadAudioFile])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  return (
    <div style={{ padding: '1rem 0', maxWidth: '100%' }}>
      {error && (
        <p
          role="alert"
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
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '1rem',
        }}
      >
        {title && <h1 style={{ fontSize: '1.2rem', margin: 0 }}>{title}</h1>}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <input
            type="date"
            aria-label="日付"
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
          <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap' }}>
            {PASTEL_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setBgColor(color)}
                title={color}
                aria-label={`背景色 ${color}`}
                aria-pressed={bgColor === color}
                style={{
                  width: '1.5rem',
                  height: '1.5rem',
                  padding: '0',
                  border: '1px solid #ccc',
                  borderRadius: '50%',
                  background: color,
                  cursor: 'pointer',
                  boxShadow: bgColor === color ? `0 0 0 2px ${color}` : 'none',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {showPreview ? (
        <div
          style={{
            position: 'relative',
            background: bgColor,
            backgroundImage: 'url(/images/background.webp)',
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
              dateLabel={date ? formatDiaryDate(date) : '----/--/--'}
              imagePosition={
                imageX != null && imageY != null
                  ? { x: imageX, y: imageY }
                  : null
              }
              draggable={true}
              onPositionChange={(x, y) => {
                setImageX(x)
                setImageY(y)
              }}
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
              ref={textareaRef}
              aria-label="日記の本文"
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
              aria-label={m.label}
              aria-pressed={mood === m.key}
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
          {charCount} / {MAX_BODY_LENGTH}
        </span>
        <div style={{ display: 'flex', gap: '0.25rem', fontSize: '0.85rem' }}>
          <button
            type="button"
            onClick={() => {
              setImageLayout('left')
              setImageX(null)
              setImageY(null)
            }}
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
            onClick={() => {
              setImageLayout('right')
              setImageX(null)
              setImageY(null)
            }}
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
              onClick={() => setShowImageDeleteConfirm(true)}
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

        {/* 音声アップロード・録音 */}
        <div
          style={{
            display: 'flex',
            gap: '0.25rem',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {audioSrc && (
            // biome-ignore lint/a11y/useMediaCaption: ユーザー添付音声で、字幕データはまだ生成していない
            <audio
              src={audioSrc}
              controls
              preload="metadata"
              style={{ width: '160px', height: '32px' }}
            />
          )}
          <label
            style={{
              padding: '0.2rem 0.5rem',
              border: '1px solid #999',
              borderRadius: '4px',
              fontSize: '0.85rem',
              cursor: audioUploading || isRecording ? 'default' : 'pointer',
              opacity: audioUploading || isRecording ? 0.6 : 1,
            }}
          >
            {audioUploading
              ? 'アップロード中...'
              : audioKey
                ? '音声を変更'
                : '音声を追加'}
            <input
              ref={audioInputRef}
              type="file"
              accept="audio/mpeg,audio/mp3,audio/webm,audio/mp4,audio/wav,audio/ogg"
              onChange={handleAudioChange}
              disabled={audioUploading || isRecording}
              style={{ display: 'none' }}
            />
          </label>
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={audioUploading}
            style={{
              padding: '0.2rem 0.5rem',
              border: `1px solid ${isRecording ? '#c0392b' : '#999'}`,
              borderRadius: '4px',
              background: isRecording ? '#c0392b' : 'transparent',
              color: isRecording ? '#fff' : '#666',
              fontSize: '0.85rem',
              cursor: audioUploading ? 'default' : 'pointer',
              animation: isRecording ? 'pulse 1.5s infinite' : 'none',
            }}
          >
            {isRecording ? '録音停止' : audioKey ? '録音し直す' : '録音'}
          </button>
          {audioKey && (
            <button
              type="button"
              onClick={() => setShowAudioDeleteConfirm(true)}
              disabled={audioUploading || isRecording}
              style={{
                padding: '0.2rem 0.5rem',
                background: 'transparent',
                color: '#c0392b',
                border: '1px solid #c0392b',
                borderRadius: '4px',
                fontSize: '0.85rem',
                cursor: audioUploading || isRecording ? 'default' : 'pointer',
                opacity: audioUploading || isRecording ? 0.6 : 1,
              }}
            >
              音声を削除
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
          role="alert"
          style={{
            color: '#c0392b',
            fontSize: '0.85rem',
            marginTop: '0.5rem',
          }}
        >
          {imageError}
        </p>
      )}
      {audioError && (
        <p
          role="alert"
          style={{
            color: '#c0392b',
            fontSize: '0.85rem',
            marginTop: '0.5rem',
          }}
        >
          {audioError}
        </p>
      )}
      <ConfirmDialog
        open={showImageDeleteConfirm}
        message="画像を削除しますか？"
        onConfirm={handleImageDelete}
        onCancel={() => setShowImageDeleteConfirm(false)}
      />
      <ConfirmDialog
        open={showAudioDeleteConfirm}
        message="音声を削除しますか？"
        onConfirm={handleAudioDelete}
        onCancel={() => setShowAudioDeleteConfirm(false)}
      />
    </div>
  )
}
