import {
  type LayoutCursor,
  layoutNextLine,
  prepareWithSegments,
} from '@chenglou/pretext'
import { useCallback, useEffect, useMemo, useRef, useState } from 'hono/jsx'
import {
  IMAGE_ROTATION_MAX,
  IMAGE_ROTATION_MIN,
  IMAGE_SCALE_MAX,
  IMAGE_SCALE_MIN,
} from '../lib/constants'
import { computeImageFrame, type ImageSize } from '../lib/image-layout'
import {
  computeExtendedSlots,
  type ObstacleRect,
  type Slot,
} from '../lib/layout'

type Segment = {
  text: string
} & Slot

type Props = {
  text: string
  fontSize: number
  lineHeight: number
  imageLayout: 'left' | 'right'
  imageSrc: string | null
  containerHeight: number
  /** 画像の位置（指定時は imageLayout より優先） */
  imagePosition?: { x: number; y: number } | null
  /** 画像の表示倍率（null は 1.0 扱い） */
  imageScale?: number | null
  /** 画像の回転角/度（null は 0 扱い） */
  imageRotation?: number | null
  /** 日付ラベル（画像の反対側に配置し、テキストが回り込む） */
  dateLabel?: string
  /** ドラッグで画像を移動可能にする */
  draggable?: boolean
  /** ドラッグによる位置変更コールバック */
  onPositionChange?: (x: number, y: number) => void
  /** ピンチによる倍率変更コールバック（draggable 時のみ有効） */
  onScaleChange?: (scale: number) => void
  /** 2本指の回転による回転角変更コールバック（draggable 時のみ有効） */
  onRotationChange?: (rotation: number) => void
}

export default function FlowText({
  text,
  fontSize,
  lineHeight,
  imageLayout,
  imageSrc,
  containerHeight,
  imagePosition,
  imageScale,
  imageRotation,
  dateLabel,
  draggable = false,
  onPositionChange,
  onScaleChange,
  onRotationChange,
}: Props) {
  const scale = imageScale ?? 1
  const rotation = imageRotation ?? 0
  const containerRef = useRef<HTMLDivElement>(null)
  const dateRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [naturalSize, setNaturalSize] = useState<ImageSize | null>(null)
  const [dateSize, setDateSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [showViewer, setShowViewer] = useState(false)

  const handleImageLoad = useCallback((e: Event) => {
    const img = e.target as HTMLImageElement
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
  }, [])

  // ref callback: ハイドレーション時に画像が読み込み済みならサイズを即取得
  const imgCallbackRef = useCallback((img: HTMLImageElement | null) => {
    imgRef.current = img
    if (img?.complete && img.naturalWidth > 0) {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
    }
  }, [])

  // 表示サイズ(imageSize)と回転後の外接矩形(frameSize)を自然サイズから render 中に導出する。
  // 計算の詳細と補正の理由は computeImageFrame (app/lib/image-layout.ts) を参照
  const { imageSize, frameSize } = useMemo<{
    imageSize: ImageSize | null
    frameSize: ImageSize | null
  }>(() => {
    if (!naturalSize || !containerWidth) {
      return { imageSize: null, frameSize: null }
    }
    return computeImageFrame(
      naturalSize,
      { width: containerWidth, height: containerHeight },
      scale,
      rotation,
    )
  }, [naturalSize, containerWidth, containerHeight, scale, rotation])

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

  // 画像の obstacleRect を計算（回転時は外接矩形）
  const obstacleRect = useMemo<ObstacleRect>(() => {
    if (!frameSize || !containerWidth)
      return { x: 0, y: 0, width: 0, height: 0 }

    if (imagePosition) {
      // 保存済みの位置のまま拡大・回転するとコンテナからはみ出し得るため、表示上は内側に丸める
      const x = Math.max(
        0,
        Math.min(imagePosition.x, containerWidth - frameSize.width),
      )
      const y = Math.max(
        0,
        Math.min(imagePosition.y, containerHeight - frameSize.height),
      )
      return { x, y, ...frameSize }
    }

    // imagePosition が未指定なら imageLayout から導出
    const x = imageLayout === 'right' ? containerWidth - frameSize.width : 0
    return { x, y: 0, ...frameSize }
  }, [frameSize, imagePosition, imageLayout, containerWidth, containerHeight])

  // 日付の表示位置（画像の反対側）
  const dateSide: 'left' | 'right' = imageLayout === 'right' ? 'left' : 'right'

  // テキスト計測（Intl.Segmenter + canvas measureText）は重いため、ドラッグ中に
  // obstacleRect が毎フレーム変わってもここは再実行されないよう依存を分離する
  const prepared = useMemo(
    () =>
      prepareWithSegments(text, `600 ${fontSize}px sans-serif`, {
        whiteSpace: 'pre-wrap',
      }),
    [text, fontSize],
  )

  // computeExtendedSlots + 日付補正でスロットを計算し、テキストを流し込む。
  // 画像（障害物）が大きく全文が収まらない場合は、全文が置けるまで列を
  // 左へ追加してキャンバス幅を拡張する（extraWidth）。コンテナは横スクロール
  // できるので、拡張分はスクロールで読める
  const { segments, extraWidth } = useMemo(() => {
    if (!containerWidth || containerWidth < 100) {
      return { segments: [] as Segment[], extraWidth: 0 }
    }

    const containerSize = { width: containerWidth, height: containerHeight }
    const dateRect = dateSize ? { side: dateSide, ...dateSize } : null

    // 無限ループ保険。1スロットには最低1文字置けるため「文字数 + 改行数」が
    // 必要スロット数の真の上限になる。改行は1つで列を1本消費し、語単位の
    // 折返しがあるため文字数ベースの列容量見積もりは上限にならない。
    // 全文が収まる幅には必ず到達するので、成功条件は exhausted のみ
    const lineBreaks = (text.match(/\n/g) ?? []).length
    const maxExtraCols = text.length + lineBreaks + 1

    for (let extraCols = 0; ; extraCols++) {
      const { slots, delta } = computeExtendedSlots(
        containerSize,
        fontSize,
        lineHeight,
        obstacleRect,
        extraCols,
        dateRect,
      )

      const result: Segment[] = []
      let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
      for (const slot of slots) {
        const line = layoutNextLine(prepared, cursor, slot.height)
        if (!line) break
        result.push({ text: line.text, ...slot })
        cursor = line.end
      }
      // 残りテキストが無ければ全文が収まっている
      const exhausted =
        layoutNextLine(prepared, cursor, containerHeight) === null

      if (exhausted || extraCols >= maxExtraCols) {
        return { segments: result, extraWidth: delta }
      }
    }
  }, [
    text,
    prepared,
    fontSize,
    lineHeight,
    containerWidth,
    containerHeight,
    obstacleRect,
    dateSize,
    dateSide,
  ])

  // ドラッグ（指1本）とピンチ（指2本: 距離=拡縮、角度=回転）の処理。
  // setPointerCapture で move/up が button に届くため、ハンドラはすべて button 側に置く
  const activePointers = useMemo(
    () => new Map<number, { x: number; y: number }>(),
    [],
  )
  const dragRef = useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
  } | null>(null)
  const pinchRef = useRef<{
    startDistance: number
    startScale: number
    startAngle: number
    startRotation: number
  } | null>(null)

  const handlePointerDown = useCallback(
    (e: PointerEvent) => {
      if (!draggable) return
      e.preventDefault()

      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (activePointers.size === 2 && (onScaleChange || onRotationChange)) {
        // 2本目の指が触れたらピンチ開始。移動は中断する
        dragRef.current = null
        const [p1, p2] = [...activePointers.values()]
        pinchRef.current = {
          startDistance: Math.hypot(p1.x - p2.x, p1.y - p2.y),
          startScale: scale,
          startAngle: Math.atan2(p2.y - p1.y, p2.x - p1.x),
          startRotation: rotation,
        }
        return
      }

      if (activePointers.size === 1 && onPositionChange) {
        const containerEl = containerRef.current
        if (!containerEl) return
        const rect = containerEl.getBoundingClientRect()
        dragRef.current = {
          pointerId: e.pointerId,
          // 画像はキャンバス内で extraWidth だけ右に描画されるが、キャンバス自体が
          // 右端アンカーで extraWidth だけ左にずれるため、画面上の位置は
          // ルート基準で obstacleRect.x のままになる
          offsetX: e.clientX - rect.left - obstacleRect.x,
          offsetY: e.clientY - rect.top - obstacleRect.y,
        }
      }
    },
    [
      draggable,
      onPositionChange,
      onScaleChange,
      onRotationChange,
      scale,
      rotation,
      obstacleRect,
    ],
  )

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!activePointers.has(e.pointerId)) return
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      const pinch = pinchRef.current
      if (pinch && activePointers.size >= 2) {
        const [p1, p2] = [...activePointers.values()]

        if (onScaleChange && pinch.startDistance > 0) {
          const distance = Math.hypot(p1.x - p2.x, p1.y - p2.y)
          const next = (pinch.startScale * distance) / pinch.startDistance
          const clamped = Math.max(
            IMAGE_SCALE_MIN,
            Math.min(IMAGE_SCALE_MAX, next),
          )
          onScaleChange(Math.round(clamped * 100) / 100)
        }

        if (onRotationChange) {
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
          // atan2 の ±180° 境界をまたいでも連続になるよう差分を正規化する
          let deltaDeg = ((angle - pinch.startAngle) * 180) / Math.PI
          deltaDeg = ((deltaDeg + 540) % 360) - 180
          const next = pinch.startRotation + deltaDeg
          const clamped = Math.max(
            IMAGE_ROTATION_MIN,
            Math.min(IMAGE_ROTATION_MAX, next),
          )
          onRotationChange(Math.round(clamped))
        }
        return
      }

      const drag = dragRef.current
      if (
        drag?.pointerId === e.pointerId &&
        onPositionChange &&
        frameSize &&
        containerRef.current
      ) {
        const rect = containerRef.current.getBoundingClientRect()
        const nx = e.clientX - rect.left - drag.offsetX
        const ny = e.clientY - rect.top - drag.offsetY
        const maxX = containerWidth - frameSize.width
        const maxY = containerHeight - frameSize.height
        onPositionChange(
          Math.max(0, Math.min(nx, maxX)),
          Math.max(0, Math.min(ny, maxY)),
        )
      }
    },
    [
      onScaleChange,
      onRotationChange,
      onPositionChange,
      frameSize,
      containerWidth,
      containerHeight,
    ],
  )

  const handlePointerEnd = useCallback((e: PointerEvent) => {
    activePointers.delete(e.pointerId)
    if (activePointers.size < 2) pinchRef.current = null
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: `${containerHeight}px`,
      }}
    >
      {/* 描画キャンバス。全文が収まらないときは containerWidth より広くなり、
          右端（文頭）アンカーなのではみ出しは左へ伸びる。スクロールコンテナが
          direction: rtl のため左へのはみ出しはスクロールで読め、初期表示は
          文頭に固定される。内側は ltr に戻して座標・テキストの向きを保つ */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: containerWidth ? `${containerWidth + extraWidth}px` : '100%',
          height: '100%',
          direction: 'ltr',
        }}
      >
        {/* 日付。左寄せ時は拡張後も元のキャンバス左端（= 初期表示の左端）に
            留めて、スクロールしなくても日付が見えることを保つ */}
        {dateLabel && (
          <div
            ref={dateRef}
            style={{
              position: 'absolute',
              top: 0,
              right: dateSide === 'right' ? 0 : 'auto',
              left: dateSide === 'left' ? `${extraWidth}px` : 'auto',
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
            onPointerMove={draggable ? handlePointerMove : undefined}
            onPointerUp={draggable ? handlePointerEnd : undefined}
            onPointerCancel={draggable ? handlePointerEnd : undefined}
            style={{
              position: 'absolute',
              // 幅拡張時も右端（文頭）からの距離を保つよう extraWidth だけずらす
              left: `${obstacleRect.x + extraWidth}px`,
              top: `${obstacleRect.y}px`,
              // button は外接矩形サイズ。回転した img を中央に置き、タップ領域と
              // レイアウト(回り込み)の基準を一致させる
              width: frameSize ? `${frameSize.width}px` : 'auto',
              height: frameSize ? `${frameSize.height}px` : 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              border: 'none',
              background: 'none',
              cursor: draggable ? 'grab' : 'pointer',
              WebkitTapHighlightColor: 'transparent',
              outline: 'none',
              touchAction: draggable ? 'none' : 'auto',
              visibility: frameSize ? 'visible' : 'hidden',
            }}
          >
            <img
              ref={imgCallbackRef}
              src={imageSrc}
              alt="日記の写真"
              fetchpriority="high"
              onLoad={handleImageLoad}
              style={{
                // 導出済みの表示サイズを明示指定する（サイズ確定前は非表示のため 'auto' で問題ない）
                width: imageSize ? `${imageSize.width}px` : 'auto',
                height: imageSize ? `${imageSize.height}px` : 'auto',
                transform:
                  rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
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

        {/* テキスト列。スロットは右端からの列順で並ぶためインデックスが
            安定キーになる。x をキーに含めると幅拡張で全列の x がシフトした
            瞬間に全列が unmount/remount されてしまう */}
        {segments.map((seg, i) => (
          <div
            key={i}
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
    </div>
  )
}
