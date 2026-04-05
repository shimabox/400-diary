import {
  type LayoutCursor,
  layoutNextLine,
  prepareWithSegments,
} from '@chenglou/pretext'
import { useCallback, useEffect, useRef, useState } from 'hono/jsx'

type Column = {
  text: string
  x: number
  y: number
  height: number
}

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
  /** 画像の上方向オフセット（負の値で上にはみ出す） */
  imageTop?: number
}

export default function FlowText({
  text,
  fontSize,
  lineHeight,
  imageLayout,
  imageSrc,
  containerHeight,
  imageTop = 0,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState<Column[]>([])
  const [imageSize, setImageSize] = useState<ImageSize | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  const handleImageLoad = useCallback((e: Event) => {
    const img = e.target as HTMLImageElement
    setImageSize({ width: img.offsetWidth, height: img.offsetHeight })
  }, [])

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

  // Pretextでテキストを列に分割
  useEffect(() => {
    if (!containerWidth || containerWidth < 100) return

    const font = `600 ${fontSize}px sans-serif`
    const prepared = prepareWithSegments(text, font, {
      whiteSpace: 'pre-wrap',
    })

    const colWidth = fontSize * lineHeight // 1列の幅（横方向の間隔）
    const totalCols = Math.floor(containerWidth / colWidth)

    // 画像がテキスト領域内で占める高さ（imageTopが負の場合、上にはみ出した分を引く）
    const imageMargin = fontSize // 画像まわりの余白（≒1文字分）
    const imgOccupiedHeight = imageSize
      ? imageSize.height + imageTop + imageMargin
      : 0
    const imgCols = imageSize
      ? Math.ceil((imageSize.width + imageMargin) / colWidth)
      : 0

    const cols: Column[] = []
    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }

    for (let i = 0; i < totalCols; i++) {
      const x = containerWidth - (i + 1) * colWidth

      let isOverlapping = false
      if (imageSize && imgOccupiedHeight > 0) {
        if (imageLayout === 'right') {
          isOverlapping = i < imgCols
        } else {
          isOverlapping = i >= totalCols - imgCols
        }
      }

      const availableHeight = isOverlapping
        ? containerHeight - imgOccupiedHeight
        : containerHeight
      if (availableHeight <= 0) continue

      const line = layoutNextLine(prepared, cursor, availableHeight)
      if (!line) break

      cols.push({
        text: line.text,
        x,
        y: isOverlapping ? imgOccupiedHeight : 0,
        height: availableHeight,
      })

      cursor = line.end
    }

    setColumns(cols)
  }, [
    text,
    fontSize,
    lineHeight,
    containerWidth,
    containerHeight,
    imageSize,
    imageLayout,
    imageTop,
  ])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: `${containerHeight}px`,
      }}
    >
      {/* 画像 */}
      {imageSrc && (
        <img
          src={imageSrc}
          alt="日記の写真"
          onLoad={handleImageLoad}
          style={{
            position: 'absolute',
            top: `${imageTop}px`,
            right: imageLayout === 'right' ? 0 : 'auto',
            left: imageLayout === 'left' ? 0 : 'auto',
            maxWidth: '30%',
            maxHeight: `${containerHeight - imageTop}px`,
            objectFit: 'cover',
            borderRadius: '12px',
          }}
        />
      )}

      {/* テキスト列 */}
      {columns.map((col, i) => (
        <div
          key={`${i}-${col.x}`}
          style={{
            position: 'absolute',
            left: `${col.x}px`,
            top: `${col.y}px`,
            width: `${fontSize * lineHeight}px`,
            height: `${col.height}px`,
            writingMode: 'vertical-rl',
            whiteSpace: 'pre-wrap',
            fontSize: `${fontSize}px`,
            lineHeight: String(lineHeight),
            fontWeight: 600,
            overflow: 'hidden',
          }}
        >
          {col.text}
        </div>
      ))}
    </div>
  )
}
