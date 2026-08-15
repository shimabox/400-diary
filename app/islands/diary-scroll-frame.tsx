import { useCallback, useEffect, useRef, useState } from 'hono/jsx'
import FlowText from './flow-text'

// 日記キャンバスの寸法。エディタのプレビューと公開ページで共有する
const CANVAS_MIN_WIDTH = 880
const CANVAS_HEIGHT = 416
const FONT_SIZE = 17.6
const LINE_HEIGHT = 2
// フレームの横 padding。ページ側の各カラムは maxWidth 960px なので、
// キャンバス最小幅 880px + padding がちょうど 960px に収まる 2.5rem にする
// （2.6rem だと中身が 963.2px になり、続きが無くても常に 3.2px はみ出して
// フェードが出てしまう。root の font-size は global.css で 16px 固定）
const FRAME_PADDING_X = '2.5rem'
const FRAME_MAX_WIDTH = '960px'

type Props = {
  bgColor: string
  text: string
  imageLayout: 'left' | 'right'
  imageSrc: string | null
  dateLabel?: string
  imagePosition?: { x: number; y: number } | null
  imageScale?: number | null
  imageRotation?: number | null
  draggable?: boolean
  onPositionChange?: (x: number, y: number) => void
  onScaleChange?: (scale: number) => void
  onRotationChange?: (rotation: number) => void
  /** キャンバス幅の拡張量（px）が変わったときの通知（編集画面のヒント表示用） */
  onExtraWidthChange?: (extraWidth: number) => void
}

/**
 * 日記本文（FlowText）用の横スクロールフレーム。
 *
 * FlowText は全文が収まらないときキャンバス幅を左へ拡張するため、埋め込みには
 * direction: rtl のスクロールコンテナが必須（ltr では左方向のはみ出しが
 * スクロール領域に含まれず、拡張分が読めなくなる）。その契約をこの
 * コンポーネントに閉じ込め、あわせて「左にまだ続きがある」ことを示す
 * フェードをスクロールバー非表示の代わりに表示する。
 */
export default function DiaryScrollFrame({
  bgColor,
  onExtraWidthChange,
  ...flowTextProps
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showFade, setShowFade] = useState(false)

  // 左（読み進める方向）にまだ見えていないコンテンツがあるか。
  // rtl コンテナの scrollLeft は 0（右端）〜 -(scrollWidth - clientWidth)（左端）。
  // scrollWidth / clientWidth は整数に丸められ、小数 px のレイアウトでは続きが
  // 無くても 1〜2px の差が出ることがあるため、その分は許容する
  const updateFade = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setShowFade(el.scrollWidth - el.clientWidth + el.scrollLeft > 2)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateFade()
    el.addEventListener('scroll', updateFade, { passive: true })
    // ビューポート変化（clientWidth の変化）にも追随する
    const obs = new ResizeObserver(updateFade)
    obs.observe(el)
    return () => {
      el.removeEventListener('scroll', updateFade)
      obs.disconnect()
    }
  }, [updateFade])

  const onExtraWidthChangeRef = useRef(onExtraWidthChange)
  onExtraWidthChangeRef.current = onExtraWidthChange
  const handleExtraWidthChange = useCallback(
    (extraWidth: number) => {
      // キャンバス幅が変わっても scroll イベントは発火しないため、
      // ここで scrollWidth を測り直す（DOM 反映後に呼ばれる）
      updateFade()
      onExtraWidthChangeRef.current?.(extraWidth)
    },
    [updateFade],
  )

  return (
    <div
      style={{ position: 'relative', maxWidth: FRAME_MAX_WIDTH, width: '100%' }}
    >
      <div
        ref={scrollRef}
        class="hide-scrollbar"
        style={{
          background: bgColor,
          backgroundImage: 'url(/images/background.webp)',
          backgroundRepeat: 'repeat',
          backgroundBlendMode: 'luminosity',
          borderRadius: '12px',
          padding: `2rem ${FRAME_PADDING_X}`,
          width: '100%',
          height: '480px',
          overflowX: 'auto',
          overflowY: 'hidden',
          // 縦書きは右→左に読むため RTL スクロールにする。FlowText の拡張分が
          // 「左へのスクロール可能領域」になり、初期表示・キャンバス拡張時とも
          // 右端（文頭）に固定される（rtl の初期スクロール位置は仕様上右端）
          direction: 'rtl',
        }}
      >
        <div style={{ minWidth: `${CANVAS_MIN_WIDTH}px` }}>
          <FlowText
            {...flowTextProps}
            fontSize={FONT_SIZE}
            lineHeight={LINE_HEIGHT}
            containerHeight={CANVAS_HEIGHT}
            onExtraWidthChange={handleExtraWidthChange}
          />
        </div>
      </div>
      {/* スクロールバーを隠しているため、左にまだ続きがあるときはフェードで示す。
          背景色と同色のグラデーションでは背景に溶けて気づけないため、
          どの背景色でも見える中立な影にしている */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '48px',
          borderRadius: '12px 0 0 12px',
          background:
            'linear-gradient(to right, rgba(0, 0, 0, 0.14), transparent)',
          opacity: showFade ? 1 : 0,
          transition: 'opacity 0.25s',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
