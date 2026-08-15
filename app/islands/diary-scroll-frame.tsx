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
// FRAME_PADDING_X の px 換算（root font-size は 16px 固定）。
// 幅拡張時にスクロール領域を左へ広げ、左端の余白を右端と揃えるのに使う
const FRAME_PADDING_X_PX = 40
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
  const [extraWidth, setExtraWidth] = useState(0)

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
  const handleExtraWidthChange = useCallback((width: number) => {
    setExtraWidth(width)
    onExtraWidthChangeRef.current?.(width)
  }, [])

  // キャンバス幅が変わっても scroll イベントは発火しないため、拡張量の変化
  // （スペーサー込みの DOM 反映後）に scrollWidth を測り直す
  useEffect(() => {
    updateFade()
  }, [extraWidth, updateFade])

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
        <div
          style={{ minWidth: `${CANVAS_MIN_WIDTH}px`, position: 'relative' }}
        >
          <FlowText
            {...flowTextProps}
            fontSize={FONT_SIZE}
            lineHeight={LINE_HEIGHT}
            containerHeight={CANVAS_HEIGHT}
            onExtraWidthChange={handleExtraWidthChange}
          />
          {/* 幅拡張時、スクロール領域は拡張キャンバスの左端で終わり、左端まで
              スクロールすると文末が枠にぴったり付いてしまう。右端の padding と
              同じ余白が左端にも残るよう、スクロール領域を padding ぶんだけ
              左へ広げる不可視のスペーサー */}
          {extraWidth > 0 && (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 0,
                left: `${-(extraWidth + FRAME_PADDING_X_PX)}px`,
                width: '1px',
                height: '1px',
              }}
            />
          )}
        </div>
      </div>
      {/* スクロールバーを隠しているため、左にまだ続きがあるときはフェードで示す */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '56px',
          borderRadius: '12px 0 0 12px',
          background: `linear-gradient(to right, ${bgColor}, transparent)`,
          opacity: showFade ? 1 : 0,
          transition: 'opacity 0.25s',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
