import { useState } from 'hono/jsx'
import { PASTEL_COLORS } from '../lib/colors'
import {
  IMAGE_ROTATION_MAX,
  IMAGE_ROTATION_MIN,
  IMAGE_SCALE_MAX,
  IMAGE_SCALE_MIN,
  MAX_BODY_LENGTH,
} from '../lib/constants'
import { formatDiaryDate } from '../lib/format'
import { COLS, ROWS } from '../lib/grid'
import { MOODS, type MoodKey } from '../lib/mood'
import { useDiaryDraft } from '../lib/use-diary-draft'
import { useSpeech } from '../lib/use-speech'
import { useVerticalTextInput } from '../lib/use-vertical-text-input'
import DiaryScrollFrame from './diary-scroll-frame'
import ImageAttachmentEditor from './image-attachment-editor'

const CELL = 2.0 // em – 1マスのサイズ（正方形）

type Props = {
  title?: string
  initialBody?: string
  initialDate?: string
  initialColor?: string
  initialImageLayout?: 'left' | 'right'
  initialMood?: string | null
  initialImageKey?: string | null
  initialImageX?: number | null
  initialImageY?: number | null
  initialImageScale?: number | null
  initialImageRotation?: number | null
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
  initialImageX = null,
  initialImageY = null,
  initialImageScale = null,
  initialImageRotation = null,
  diaryId,
  publishedAt: initialPublishedAt = null,
}: Props) {
  const [date, setDate] = useState(initialDate)
  const [bgColor, setBgColor] = useState(initialColor)
  const [imageLayout, setImageLayout] = useState(initialImageLayout)
  const [mood, setMood] = useState<MoodKey | null>(
    (initialMood as MoodKey) ?? null,
  )
  const [showPreview, setShowPreview] = useState(false)
  // プレビューで画像が大きくキャンバス幅が拡張された（= 横スクロールで全文表示になる）か
  const [previewExtended, setPreviewExtended] = useState(false)
  const {
    body,
    cellCount,
    handleCompositionEnd,
    handleCompositionStart,
    handleInput,
    handleSpeechResult,
    isOver,
    textareaRef,
  } = useVerticalTextInput(initialBody)

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
  const [imageX, setImageX] = useState<number | null>(initialImageX)
  const [imageY, setImageY] = useState<number | null>(initialImageY)
  const [imageScale, setImageScale] = useState<number | null>(initialImageScale)
  const [imageRotation, setImageRotation] = useState<number | null>(
    initialImageRotation,
  )

  const {
    currentDiaryId,
    error,
    publishedAt,
    publishing,
    saveDraft,
    savedId,
    saving,
    publishDraft,
  } = useDiaryDraft({
    diaryId,
    publishedAt: initialPublishedAt,
    body,
    date,
    backgroundColor: bgColor,
    imageLayout,
    mood,
    imageX,
    imageY,
    imageScale,
    imageRotation,
  })
  const imageSrc = imagePreview ?? (imageKey ? `/api/images/${imageKey}` : null)

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
        <>
          <DiaryScrollFrame
            bgColor={bgColor}
            text={body}
            imageLayout={imageLayout}
            imageSrc={imageSrc}
            dateLabel={date ? formatDiaryDate(date) : '----/--/--'}
            imagePosition={
              imageX != null && imageY != null ? { x: imageX, y: imageY } : null
            }
            imageScale={imageScale}
            imageRotation={imageRotation}
            draggable={true}
            onPositionChange={(x, y) => {
              setImageX(x)
              setImageY(y)
            }}
            onScaleChange={setImageScale}
            onRotationChange={setImageRotation}
            onExtraWidthChange={(extraWidth) =>
              setPreviewExtended(extraWidth > 0)
            }
          />
          {previewExtended && (
            <p
              style={{
                margin: '0.5rem 0 0',
                fontSize: '0.8rem',
                color: '#888',
              }}
            >
              画像が大きいため、全文は横スクロールで表示されます
            </p>
          )}
        </>
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
          {cellCount} / {MAX_BODY_LENGTH}
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

        {imageSrc && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.85rem',
              color: '#666',
            }}
          >
            画像サイズ
            <input
              type="range"
              min={IMAGE_SCALE_MIN}
              max={IMAGE_SCALE_MAX}
              step={0.05}
              value={imageScale ?? 1}
              onInput={(e) =>
                setImageScale(Number((e.target as HTMLInputElement).value))
              }
              style={{ width: '6rem' }}
            />
            <span
              style={{
                minWidth: '3em',
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {Math.round((imageScale ?? 1) * 100)}%
            </span>
          </label>
        )}

        {imageSrc && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.85rem',
              color: '#666',
            }}
          >
            回転
            <input
              type="range"
              min={IMAGE_ROTATION_MIN}
              max={IMAGE_ROTATION_MAX}
              step={1}
              value={imageRotation ?? 0}
              onInput={(e) =>
                setImageRotation(Number((e.target as HTMLInputElement).value))
              }
              style={{ width: '6rem' }}
            />
            <span
              style={{
                minWidth: '3em',
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {imageRotation ?? 0}°
            </span>
          </label>
        )}

        <ImageAttachmentEditor
          diaryId={currentDiaryId || null}
          imageKey={imageKey}
          onImageKeyChange={setImageKey}
          onImagePreviewChange={setImagePreview}
        />

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
          onClick={saveDraft}
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
            onClick={publishDraft}
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
    </div>
  )
}
