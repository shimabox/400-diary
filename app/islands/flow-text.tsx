import {
  type LayoutCursor,
  layoutNextLine,
  prepareWithSegments,
} from '@chenglou/pretext'
import { useCallback, useEffect, useMemo, useRef, useState } from 'hono/jsx'
import {
  adjustSlotsForDate,
  computeSlots,
  type ObstacleRect,
  type Slot,
} from '../lib/layout'

type Segment = {
  text: string
} & Slot

type ImageSize = {
  width: number
  height: number
}

type Props = {
  text: string
  fontSize: number
  lineHeight: number
  imageLayout: 'left' | 'right'
  imageSrc: string | null
  containerHeight: number
  /** 画像の位置（指定時は imageLayout より優先） */
  imagePosition?: { x: number; y: number } | null
  /** 日付ラベル（画像の反対側に配置し、テキストが回り込む） */
  dateLabel?: string
  /** ドラッグで画像を移動可能にする */
  draggable?: boolean
  /** ドラッグによる位置変更コールバック */
  onPositionChange?: (x: number, y: number) => void
}

export default function FlowText({
  text,
  fontSize,
  lineHeight,
  imageLayout,
  imageSrc,
  containerHeight,
  imagePosition,
  dateLabel,
  draggable = false,
  onPositionChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dateRef = useRef<HTMLDivElement>(null)
  const [imageSize, setImageSize] = useState<ImageSize | null>(null)
  const [dateSize, setDateSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [showViewer, setShowViewer] = useState(false)

  const handleImageLoad = useCallback((e: Event) => {
    const img = e.target as HTMLImageElement
    setImageSize({ width: img.offsetWidth, height: img.offsetHeight })
  }, [])

  // 日付サイズを計測
  useEffect(() => {
    if (dateRef.current) {
      setDateSize({
        width: dateRef.current.offsetWidth,
        height: dateRef.current.offsetHeight,
      })
    } else {
      setDateSize(null)
    }
  }, [dateLabel])

  // コンテナ幅を監視
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // 画像の obstacleRect を計算
  const obstacleRect = useMemo<ObstacleRect>(() => {
    if (!imageSize || !containerWidth)
      return { x: 0, y: 0, width: 0, height: 0 }

    if (imagePosition) {
      return { ...imagePosition, ...imageSize }
    }

    // imagePosition が未指定なら imageLayout から導出
    const x = imageLayout === 'right' ? containerWidth - imageSize.width : 0
    return { x, y: 0, ...imageSize }
  }, [imageSize, imagePosition, imageLayout, containerWidth])

  // 日付の表示位置（画像の反対側）
  const dateSide = imageLayout === 'right' ? 'left' : 'right'

  // computeSlots + 日付補正でスロットを計算し、テキストを流し込む
  const segments = useMemo(() => {
    if (!containerWidth || containerWidth < 100) return []

    const font = `600 ${fontSize}px sans-serif`
    const prepared = prepareWithSegments(text, font, {
      whiteSpace: 'pre-wrap',
    })

    const containerSize = { width: containerWidth, height: containerHeight }
    const colWidth = fontSize * lineHeight

    let slots = computeSlots(containerSize, fontSize, lineHeight, obstacleRect)

    // 日付ラベルによるスロット補正
    if (dateSize) {
      const dateX = dateSide === 'right' ? containerWidth - dateSize.width : 0
      const dateRect = {
        x: dateX,
        width: dateSize.width,
        height: dateSize.height,
      }
      slots = adjustSlotsForDate(slots, dateRect, colWidth, fontSize)
    }

    const result: Segment[] = []
    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
    for (const slot of slots) {
      const line = layoutNextLine(prepared, cursor, slot.height)
      if (!line) break
      result.push({ text: line.text, ...slot })
      cursor = line.end
    }

    return result
  }, [
    text,
    fontSize,
    lineHeight,
    containerWidth,
    containerHeight,
    obstacleRect,
    dateSize,
    dateSide,
  ])

  // ドラッグ処理
  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (!draggable || !onPositionChange) return
      e.preventDefault()

      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)

      const containerEl = containerRef.current
      if (!containerEl || !imageSize) return
      const rect = containerEl.getBoundingClientRect()

      const offsetX = e.clientX - rect.left - obstacleRect.x
      const offsetY = e.clientY - rect.top - obstacleRect.y

      const maxX = containerWidth - imageSize.width
      const maxY = containerHeight - imageSize.height

      const onPointerMove = (ev: globalThis.PointerEvent) => {
        const nx = ev.clientX - rect.left - offsetX
        const ny = ev.clientY - rect.top - offsetY
        onPositionChange(
          Math.max(0, Math.min(nx, maxX)),
          Math.max(0, Math.min(ny, maxY)),
        )
      }

      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
    },
    [
      draggable,
      onPositionChange,
      imageSize,
      obstacleRect,
      containerWidth,
      containerHeight,
    ],
  )

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: `${containerHeight}px`,
      }}
    >
      {/* 日付 */}
      {dateLabel && (
        <div
          ref={dateRef}
          style={{
            position: 'absolute',
            top: 0,
            right: dateSide === 'right' ? 0 : 'auto',
            left: dateSide === 'left' ? 0 : 'auto',
            fontSize: '2rem',
            color: '#555',
            whiteSpace: 'nowrap',
          }}
        >
          {dateLabel}
        </div>
      )}

      {/* 画像 */}
      {imageSrc && (
        <button
          type="button"
          onClick={draggable ? undefined : () => setShowViewer(true)}
          onPointerDown={draggable ? handlePointerDown : undefined}
          style={{
            position: 'absolute',
            left: `${obstacleRect.x}px`,
            top: `${obstacleRect.y}px`,
            maxWidth: '30%',
            padding: 0,
            border: 'none',
            background: 'none',
            cursor: draggable ? 'grab' : 'pointer',
            WebkitTapHighlightColor: 'transparent',
            outline: 'none',
            touchAction: draggable ? 'none' : 'auto',
            visibility: imageSize ? 'visible' : 'hidden',
          }}
        >
          <img
            src={imageSrc}
            alt="日記の写真"
            onLoad={handleImageLoad}
            style={{
              maxWidth: '100%',
              maxHeight: '256px',
              objectFit: 'cover',
              borderRadius: '12px',
              display: 'block',
              pointerEvents: draggable ? 'none' : 'auto',
            }}
          />
        </button>
      )}

      {/* 画像ビューワー */}
      {showViewer && imageSrc && (
        <button
          type="button"
          onClick={() => setShowViewer(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowViewer(false)
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer',
            border: 'none',
            padding: 0,
            width: '100%',
            height: '100%',
          }}
        >
          <img
            src={imageSrc}
            alt="日記の写真"
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: '8px',
            }}
          />
        </button>
      )}

      {/* テキスト列 */}
      {segments.map((seg, i) => (
        <div
          key={`${i}-${seg.x}`}
          style={{
            position: 'absolute',
            left: `${seg.x}px`,
            top: `${seg.y}px`,
            width: `${fontSize * lineHeight}px`,
            height: `${seg.height}px`,
            writingMode: 'vertical-rl',
            whiteSpace: 'pre-wrap',
            fontSize: `${fontSize}px`,
            lineHeight: String(lineHeight),
            fontWeight: 600,
            overflow: 'hidden',
          }}
        >
          {seg.text}
        </div>
      ))}
    </div>
  )
}
