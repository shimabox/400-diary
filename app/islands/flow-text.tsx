import { layoutNextLine, prepareWithSegments } from '@chenglou/pretext'
import { useCallback, useEffect, useMemo, useRef, useState } from 'hono/jsx'
import {
  IMAGE_ROTATION_MAX,
  IMAGE_ROTATION_MIN,
  IMAGE_SCALE_MAX,
  IMAGE_SCALE_MIN,
} from '../lib/constants'
import { type FlowSegment, flowTextWithExtension } from '../lib/flow-layout'
import { chooseLayoutImageSize } from '../lib/image-dimensions'
import {
  deriveImageDisplay,
  EMPTY_IMAGE_LOAD_RECORD,
  failureMarkSize,
  type ImageAppearance,
  type ImageLoadRecord,
  readImageElementResult,
  recordImageFailed,
  recordImageLoaded,
  shouldRevealOnLoad,
  trackImageSrc,
} from '../lib/image-display'
import { computeImageFrame, type ImageSize } from '../lib/image-layout'
import type { ObstacleRect } from '../lib/layout'

type Props = {
  text: string
  fontSize: number
  lineHeight: number
  imageLayout: 'left' | 'right'
  imageSrc: string | null
  /**
   * いま表示している画像（imageSrc）の表示寸法（px）。読み込みを待たずに画像の
   * 場所を空けて組むのに使う。読み込み後は実寸を優先する。分からなければ null
   */
  imageDimensions?: ImageSize | null
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
  /** キャンバス幅の拡張量（px）が変わったときの通知（スクロールヒント表示用） */
  onExtraWidthChange?: (extraWidth: number) => void
}

/** img の見せ方（app/lib/image-display.ts）と global.css のクラスの対応 */
const IMAGE_CLASS: Record<ImageAppearance, string> = {
  transparent: 'flow-image is-transparent',
  visible: 'flow-image',
  revealing: 'flow-image is-revealing',
  failed: 'flow-image is-failed',
}

/**
 * 枠（button）の中で left / top を 50% にした要素の transform。要素の中心を枠の
 * 中心に合わせ、その中心で回す（img は flex で枠の中央に置かれ、中心で回る）
 */
function centeredTransform(rotation: number): string {
  const center = 'translate(-50%, -50%)'
  return rotation !== 0 ? `${center} rotate(${rotation}deg)` : center
}

export default function FlowText({
  text,
  fontSize,
  lineHeight,
  imageLayout,
  imageSrc,
  imageDimensions,
  containerHeight,
  imagePosition,
  imageScale,
  imageRotation,
  dateLabel,
  draggable = false,
  onPositionChange,
  onScaleChange,
  onRotationChange,
  onExtraWidthChange,
}: Props) {
  const scale = imageScale ?? 1
  const rotation = imageRotation ?? 0
  const containerRef = useRef<HTMLDivElement>(null)
  const dateRef = useRef<HTMLDivElement>(null)
  // 画像の読み込みの記録。枠の表示履歴（その枠で写真を表示済みか）と、いまの src を
  // 設定してからの読み込みの結果（読み込めた・失敗した・フェードで現す）を分けて持つ
  const [storedImageRecord, setImageRecord] = useState<ImageLoadRecord>(() =>
    trackImageSrc(EMPTY_IMAGE_LOAD_RECORD, imageSrc),
  )
  // src が切り替わったら、前の src の結果（とくに失敗）を捨てて履歴だけを残す。
  // props の変化に合わせた記録の切り替えなので、Effect ではなく render 中に行う。
  // この render は切り替えた記録で描き、state にも書き戻して次の render とイベント
  // の記録（関数で前の値を受け取る）に使う。src が同じなら同じ記録が返るので繰り返さない
  const imageRecord = trackImageSrc(storedImageRecord, imageSrc)
  if (imageRecord !== storedImageRecord) setImageRecord(imageRecord)
  // いま枠にある img 要素。外した img から遅れて届いた load / error を記録しないため
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [dateSize, setDateSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [showViewer, setShowViewer] = useState(false)

  // 配置に使う寸法は、いまの画像の実寸 → 渡された寸法 → なし（読み込み後に組む）の順で
  // render 中に決める。実寸が渡された寸法と違えば、実寸に変わった時点で組み直される
  const naturalSize = chooseLayoutImageSize(
    imageRecord.measured,
    imageSrc,
    imageDimensions,
  )
  const naturalWidth = naturalSize?.width
  const naturalHeight = naturalSize?.height

  // 表示サイズ(imageSize)と回転後の外接矩形(frameSize)を自然サイズから render 中に導出する。
  // 計算の詳細と補正の理由は computeImageFrame (app/lib/image-layout.ts) を参照
  const { imageSize, frameSize } = useMemo<{
    imageSize: ImageSize | null
    frameSize: ImageSize | null
  }>(() => {
    if (
      naturalWidth === undefined ||
      naturalHeight === undefined ||
      !containerWidth
    ) {
      return { imageSize: null, frameSize: null }
    }
    return computeImageFrame(
      { width: naturalWidth, height: naturalHeight },
      { width: containerWidth, height: containerHeight },
      scale,
      rotation,
    )
    // 寸法は毎回新しいオブジェクトになるので、値（幅と高さ）で依存を取る
  }, [
    naturalWidth,
    naturalHeight,
    containerWidth,
    containerHeight,
    scale,
    rotation,
  ])

  // 画像の状態（待ち / 表示 / 失敗）と、画像・台紙の見せ方を render 中に導出する。
  // 台紙は枠の大きさが決まっているときだけ出す（寸法が分からない画像は読み込みが
  // 終わるまで枠が決まらないので、台紙は出ない）
  const imageDisplay = deriveImageDisplay(
    imageSrc,
    imageRecord,
    frameSize !== null,
  )
  // 届いたときにフェードで現すのは、台紙が見えていたときだけ
  const revealOnLoad = shouldRevealOnLoad(imageDisplay)
  // 公開ページで読み込めなかった画像の枠は押せなくする（開いても見せる画像が無い）。
  // 編集画面では失敗していても枠をつかんで動かせるようにする
  const pressDisabled = !draggable && imageDisplay?.status === 'failed'

  // 結果は src 属性の値（imageSrc と同じ文字列）で持つ。img.src は絶対 URL になるため。
  // 画像を削除すると img は DOM から外れるが、外れた img の load / error はあとから
  // 届くことがある。いま枠にある img（imgRef）から届いたものだけを記録する
  const handleImageLoad = useCallback(
    (e: Event) => {
      const img = e.currentTarget as HTMLImageElement
      if (img !== imgRef.current) return
      const src = img.getAttribute('src')
      if (src === null) return
      const loaded = { src, width: img.naturalWidth, height: img.naturalHeight }
      setImageRecord((prev) => recordImageLoaded(prev, loaded, revealOnLoad))
    },
    [revealOnLoad],
  )

  // 失敗はこの img 要素で起きた error だけを記録する。SSR の HTML にあった img の
  // 失敗は、ハイドレーションで作り直した img の結果に持ち込まない
  const handleImageError = useCallback((e: Event) => {
    const img = e.currentTarget as HTMLImageElement
    if (img !== imgRef.current) return
    const src = img.getAttribute('src')
    if (src === null || src === '') return
    setImageRecord((prev) => recordImageFailed(prev, src))
    // 待ちの間に開いたビューワーは閉じる（読み込めなかった画像は拡大表示しない）
    setShowViewer(false)
  }, [])

  // ref callback: ハイドレーションの時点で読み込みが終わっていれば、その結果を記録する
  // （キャッシュ済みの画像は台紙もフェードも見せずに表示する）。img には ref より先に
  // src を書いているので、ここでは src が設定済み。src の無い要素の値（complete が
  // true で naturalWidth が 0）は readImageElementResult が失敗として扱わない。
  // 画像が無くなって img が外れたら、その img のイベントは記録しない（返す関数は
  // img が外れたときに呼ばれる。外れた img がまだ imgRef にあるときだけ手放す）。
  // 記録は src が null になった render で空に戻り（trackImageSrc）、次に追加した
  // 画像は新しい枠として「待ち」から始まる
  const imgCallbackRef = useCallback((img: HTMLImageElement | null) => {
    if (!img) return
    imgRef.current = img
    const release = () => {
      if (imgRef.current === img) imgRef.current = null
    }
    const result = readImageElementResult({
      src: img.getAttribute('src'),
      complete: img.complete,
      naturalWidth: img.naturalWidth,
    })
    if (result?.result === 'loaded') {
      const loaded = {
        src: result.src,
        width: img.naturalWidth,
        height: img.naturalHeight,
      }
      setImageRecord((prev) => recordImageLoaded(prev, loaded, false))
    } else if (result?.result === 'failed') {
      setImageRecord((prev) => recordImageFailed(prev, result.src))
    }
    return release
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
  // obstacleRect が毎フレーム変わってもここは再実行されないよう依存を分離する。
  // canvas はブラウザにしか無く、SSR（Workers）で呼ぶと例外になるため、
  // コンテナ幅が計測されるまで（= クライアントで mount するまで）は計測しない
  const prepared = useMemo(
    () =>
      containerWidth
        ? prepareWithSegments(text, `600 ${fontSize}px sans-serif`, {
            whiteSpace: 'pre-wrap',
          })
        : null,
    [text, fontSize, containerWidth],
  )

  // flowTextWithExtension（app/lib/flow-layout.ts）でスロットを計算して
  // テキストを流し込む。画像（障害物）が大きく全文が収まらない場合は、
  // 全文が置けるまで列を左へ追加してキャンバス幅が拡張される（extraWidth）。
  // コンテナは横スクロールできるので、拡張分はスクロールで読める
  const { segments, extraWidth, truncated } = useMemo(() => {
    if (!prepared || !containerWidth || containerWidth < 100) {
      return { segments: [] as FlowSegment[], extraWidth: 0, truncated: false }
    }

    return flowTextWithExtension(
      text,
      { width: containerWidth, height: containerHeight },
      fontSize,
      lineHeight,
      obstacleRect,
      dateSize ? { side: dateSide, ...dateSize } : null,
      (cursor, maxHeight) => layoutNextLine(prepared, cursor, maxHeight),
    )
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

  // 安全弁到達（= 全文を配置できない不変条件崩れ）は通常入力では起きない
  // 想定。部分結果の描画は続けるが、無音で文字が欠けたままにならないよう
  // 明示的にエラーログで検知可能にする
  useEffect(() => {
    if (truncated) {
      console.error(
        'FlowText: 拡張の安全弁に到達し、テキストが途中で打ち切られました',
      )
    }
  }, [truncated])

  // 拡張量の変化を親（スクロールフレーム等）へ通知する。コールバックの
  // 同一性変化で発火しないよう ref 経由で参照する
  const onExtraWidthChangeRef = useRef(onExtraWidthChange)
  onExtraWidthChangeRef.current = onExtraWidthChange
  useEffect(() => {
    onExtraWidthChangeRef.current?.(extraWidth)
  }, [extraWidth])

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
            data-date-label
            class="paper-muted"
            style={{
              position: 'absolute',
              top: 0,
              right: dateSide === 'right' ? 0 : 'auto',
              left: dateSide === 'left' ? `${extraWidth}px` : 'auto',
              fontSize: '2rem',
              whiteSpace: 'nowrap',
            }}
          >
            {dateLabel}
          </div>
        )}

        {/* 画像 */}
        {imageSrc && imageDisplay && (
          <button
            type="button"
            // disabled でクリックもキーボードのフォーカスも受けない
            disabled={pressDisabled}
            onClick={
              draggable || pressDisabled ? undefined : () => setShowViewer(true)
            }
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
              cursor: draggable
                ? 'grab'
                : pressDisabled
                  ? 'default'
                  : 'pointer',
              WebkitTapHighlightColor: 'transparent',
              outline: 'none',
              touchAction: draggable ? 'none' : 'auto',
              visibility: frameSize ? 'visible' : 'hidden',
              // 台紙・img・印の重なり順（z-index）を枠の中に閉じ込める
              isolation: 'isolate',
            }}
          >
            {/* 属性は書いた順に設定される。ref callback の時点で src が設定済みに
                なるよう、src を ref より先に書く。見せ方は global.css の
                .flow-image のクラスで切り替え、隠すときも矩形は保つ
                （横スクロールの幅を img の左端から測るため） */}
            <img
              onLoad={handleImageLoad}
              onError={handleImageError}
              src={imageSrc}
              ref={imgCallbackRef}
              alt="日記の写真"
              fetchpriority="high"
              class={IMAGE_CLASS[imageDisplay.image]}
              style={{
                // 導出済みの表示サイズを明示指定する（サイズ確定前は非表示のため 'auto' で問題ない）
                width: imageSize ? `${imageSize.width}px` : 'auto',
                height: imageSize ? `${imageSize.height}px` : 'auto',
                transform:
                  rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
                borderRadius: '12px',
                display: 'block',
                pointerEvents: draggable ? 'none' : 'auto',
                // 台紙より手前に描く
                position: 'relative',
                zIndex: 1,
              }}
            />
            {/* 台紙。画像と同じ大きさ・角丸・回転で、枠の中央に重ねる。絶対配置なので
                枠の大きさや回り込みには関わらない。面そのものは飾りなので読ませない。
                横長の画像を傾けると、枠（回転後の外接矩形）の幅が回転前の台紙の幅より
                狭くなることがあり、inset: 0 と margin: auto では中央に寄らない。枠の
                中心に台紙の中心を合わせてから回すので、中心と回転の中心が img と揃う */}
            {imageDisplay.mat !== 'none' && imageSize && (
              <span
                key="mat"
                aria-hidden="true"
                class={
                  imageDisplay.mat === 'leaving'
                    ? 'flow-image-mat is-leaving'
                    : 'flow-image-mat'
                }
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: `${imageSize.width}px`,
                  height: `${imageSize.height}px`,
                  transform: centeredTransform(rotation),
                  zIndex: 0,
                  pointerEvents: 'none',
                }}
              />
            )}
            {/* 読み込めなかったことを表す印。目に見える文字は出さず（枠が小さいことが
                あり、縦書きの紙面で文字が浮くため）、名前だけを支援技術に届ける。
                台紙（aria-hidden）の外に置き、名前を隠さない */}
            {imageDisplay.mat === 'failed' && imageSize && (
              <span
                key="mark"
                role="img"
                aria-label="写真を読み込めませんでした"
                class="flow-image-mark"
                style={{
                  // 台紙と同じく、枠の中心に印の中心を合わせてから回す
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: `${failureMarkSize(imageSize)}px`,
                  height: `${failureMarkSize(imageSize)}px`,
                  transform: centeredTransform(rotation),
                  zIndex: 2,
                  pointerEvents: 'none',
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="100%"
                  height="100%"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.6"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                  style={{ display: 'block' }}
                >
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <circle cx="9" cy="9.5" r="1.5" />
                  <path d="M20 15.5l-4.5-4.5L7 19.5" />
                  <path d="M3.5 3.5l17 17" />
                </svg>
              </span>
            )}
          </button>
        )}

        {/* 画像ビューワー。読み込めなかった画像は拡大表示しない */}
        {showViewer && imageSrc && imageDisplay?.status !== 'failed' && (
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
