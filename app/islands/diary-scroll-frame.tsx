import { useCallback, useEffect, useRef, useState } from 'hono/jsx'
import { computeContentExtent, hasContentBeyondLeft } from '../lib/scroll-frame'
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
// 枠の表示領域（padding の内側）の左端を求めるのに使う
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
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const [showFade, setShowFade] = useState(false)
  // スクロールで到達できる幅（用紙の右端から本文・画像・日付の左端まで）。
  // 計測前は用紙の幅にしておき、SSR / 初回描画で見た目が変わらないようにする
  const [scrollExtent, setScrollExtent] = useState<number | null>(null)

  // 用紙（キャンバス最小幅 880px）は右側 20 列に本文を流し込み、狭い画面では
  // 枠より広い。本文が収まっていても用紙の左の余白までスクロールできて
  // しまうのを避けるため、本文の列・画像・日付そのものの左端を測り、
  // そこまでをスクロール可能な幅（クリップ領域の幅）にする。
  // 左フェードも同じ実測値から、枠の内側（padding を除いた表示領域）の
  // 左端より左に本文・画像があるときだけ出す
  const measure = useCallback(() => {
    const el = scrollRef.current
    const host = canvasHostRef.current
    if (!el || !host) return
    const contentLefts = Array.from(
      host.querySelectorAll<HTMLElement>(
        'div[style*="vertical-rl"], img, [data-date-label]',
      ),
      (node) => node.getBoundingClientRect().left,
    )
    const visibleLeft = el.getBoundingClientRect().left + FRAME_PADDING_X_PX
    setShowFade(hasContentBeyondLeft(visibleLeft, contentLefts))
    // クリップ領域は in-flow なので、スクロール終端（左端）にはスクロール
    // コンテナ自身の padding が残る。右端と同じ余白になるため、ここでは足さない
    // 小数 px の切り捨てで端が欠けないよう切り上げる
    const extent = Math.ceil(
      computeContentExtent(host.getBoundingClientRect().right, contentLefts),
    )
    setScrollExtent((prev) => (prev === extent ? prev : extent))
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    const host = canvasHostRef.current
    if (!el || !host) return
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    // ビューポート変化（枠の幅の変化）にも追随する
    const resizeObs = new ResizeObserver(measure)
    resizeObs.observe(el)
    // 本文の列や画像は絶対配置で、描画・再配置されても scroll / resize は
    // 発火しないため、用紙内の DOM の変化を監視して測り直す
    const mutationObs = new MutationObserver(measure)
    mutationObs.observe(host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    })
    // Web フォントの適用で日付や文字列の幅が変わっても DOM は変化しないため、
    // フォントの読み込み完了でも測り直す
    document.fonts.ready.then(measure)
    document.fonts.addEventListener('loadingdone', measure)
    return () => {
      el.removeEventListener('scroll', measure)
      resizeObs.disconnect()
      mutationObs.disconnect()
      document.fonts.removeEventListener('loadingdone', measure)
    }
  }, [measure])

  const onExtraWidthChangeRef = useRef(onExtraWidthChange)
  onExtraWidthChangeRef.current = onExtraWidthChange
  const handleExtraWidthChange = useCallback((width: number) => {
    onExtraWidthChangeRef.current?.(width)
  }, [])

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
        {/* クリップ領域。ユーザーがスクロールできるのはこの幅まで。用紙
            （下の要素）は 880px 固定で rtl のため右揃えになり、余白側の
            はみ出しは overflow: hidden で切り捨てられてスクロール対象にならない */}
        <div
          style={{
            width:
              scrollExtent == null
                ? `${CANVAS_MIN_WIDTH}px`
                : `${scrollExtent}px`,
            height: `${CANVAS_HEIGHT}px`,
            overflow: 'hidden',
          }}
        >
          <div
            ref={canvasHostRef}
            style={{ width: `${CANVAS_MIN_WIDTH}px`, position: 'relative' }}
          >
            <FlowText
              {...flowTextProps}
              fontSize={FONT_SIZE}
              lineHeight={LINE_HEIGHT}
              containerHeight={CANVAS_HEIGHT}
              onExtraWidthChange={handleExtraWidthChange}
            />
          </div>
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
