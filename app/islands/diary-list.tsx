import { useCallback, useEffect, useRef, useState } from 'hono/jsx'
import type { DiaryCard, DiaryListCursor } from '../lib/diary-cards'
import { formatDiaryDate } from '../lib/format'
import {
  appendDiaryPage,
  buildDiaryListRequestUrl,
  computeCatchUpLimit,
  hasNextPage,
} from '../lib/use-diary-list'
import { getSavedContainerScrollState } from '../spa-navigation'

const PAGE_LIMIT = 31
// sentinel が可視領域に入る前から先読みするための rootMargin。
// 横スクロールのため right/left ではなく inline 方向にまとめて効かせる目的で一律指定。
const PREFETCH_ROOT_MARGIN = '600px'

type Props = {
  initialItems: DiaryCard[]
  initialNext: DiaryListCursor
  isAuthenticated: boolean
}

export default function DiaryList({
  initialItems,
  initialNext,
  isAuthenticated,
}: Props) {
  const [items, setItems] = useState(initialItems)
  const [hasMore, setHasMore] = useState(hasNextPage(initialNext))
  const containerRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  // next はフェッチのたびに更新されるが、再レンダーの度に IntersectionObserver を
  // 張り直したくないため state ではなく ref で保持する（購読対象は hasMore のみ）
  const nextRef = useRef<DiaryListCursor>(initialNext)
  const fetchingRef = useRef(false)
  // SPA 復帰時のキャッチアップ取得が完了した直後に scrollLeft を上書きするための目標値。
  // items 更新は非同期なので、フェッチ完了時点では DOM がまだ古い（scrollWidth 不足）。
  // items 変化を監視する effect 側で「DOM が更新された後」に反映するためにいったん ref へ積む。
  const restoreTargetXRef = useRef<number | null>(null)

  const loadMore = useCallback(async () => {
    if (fetchingRef.current) return
    const cursor = nextRef.current
    if (!cursor) return

    fetchingRef.current = true
    try {
      const res = await fetch(buildDiaryListRequestUrl(cursor, PAGE_LIMIT))
      if (!res.ok) {
        throw new Error(`日記一覧の取得に失敗しました (status: ${res.status})`)
      }
      const data = (await res.json()) as {
        items: DiaryCard[]
        next: DiaryListCursor
      }
      setItems((prev) => appendDiaryPage(prev, data.items))
      nextRef.current = data.next
      if (!hasNextPage(data.next)) {
        setHasMore(false)
      }
    } catch (err) {
      // リトライボタン等は作り込まず、sentinel を維持したままにする。
      // 次に交差判定が発火すれば自然に再試行される。
      console.error(err)
    } finally {
      fetchingRef.current = false
    }
  }, [])

  useEffect(() => {
    // SPA 遷移から popstate で戻ったときだけ発火するキャッチアップ取得。
    // 初回訪問（history.state に ScrollState が無い）や、この機能導入前に保存された
    // 旧形式の state（count が無い）では saved が null か count が undefined になるため、
    // その場合は何もしない（＝従来通りクランプ位置に留まるだけ）。
    const saved = getSavedContainerScrollState('diary-list')
    if (!saved || saved.count === undefined) return undefined

    // initialItems（マウント時点の SSR 由来件数）と、マウント時点のカーソルを使う。
    // items は非同期に増えうる state なので、キャッチアップの要否判定には使わない。
    const limit = computeCatchUpLimit(
      saved.count,
      initialItems.length,
      nextRef.current,
    )
    if (limit === null) return undefined // 不足なし、またはこれ以上取得不可

    let cancelled = false
    fetchingRef.current = true
    ;(async () => {
      try {
        const res = await fetch(
          buildDiaryListRequestUrl(nextRef.current, limit),
        )
        if (!res.ok) {
          throw new Error(
            `日記一覧のキャッチアップ取得に失敗しました (status: ${res.status})`,
          )
        }
        const data = (await res.json()) as {
          items: DiaryCard[]
          next: DiaryListCursor
        }
        if (cancelled) return
        // scrollLeft の上書きは items 更新後の DOM に対して行う必要があるため、
        // 目標値を ref に積んでおき、items 変化を監視する別 effect で反映する
        restoreTargetXRef.current = saved.x
        setItems((prev) => appendDiaryPage(prev, data.items))
        nextRef.current = data.next
        if (!hasNextPage(data.next)) {
          setHasMore(false)
        }
      } catch (err) {
        // 取得失敗時はクランプ位置に留まる（＝この機能が無い場合と同じ劣化のみ）ので諦める
        console.error(err)
      } finally {
        if (!cancelled) {
          fetchingRef.current = false
        }
      }
    })()

    return () => {
      cancelled = true
    }
    // マウント時（SPA 復帰直後）にのみ実行したい。initialItems は props、nextRef は ref
    // なので、items 等のように変化を追って再実行する必要はない。
  }, [])

  // 上のキャッチアップ effect が完了して items が増えたときだけ、保存済み scrollLeft を
  // 上書きする。通常の無限スクロールでも items は変化するが、restoreTargetXRef が null の
  // ときは何もしない（キャッチアップ由来の更新のみを対象にするためのガード）。
  useEffect(() => {
    const targetX = restoreTargetXRef.current
    if (targetX === null) return
    restoreTargetXRef.current = null
    const el = containerRef.current
    if (el) {
      el.scrollLeft = targetX
    }
  }, [items])

  useEffect(() => {
    const root = containerRef.current
    const sentinel = sentinelRef.current
    if (!root || !sentinel || !hasMore) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore()
        }
      },
      { root, rootMargin: PREFETCH_ROOT_MARGIN },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  return (
    <div
      ref={containerRef}
      class="hide-scrollbar"
      data-scroll-restore="diary-list"
      data-scroll-restore-count={items.length}
      style={{
        height: '480px',
        overflowX: 'auto',
        overflowY: 'hidden',
        direction: 'rtl',
        display: 'flex',
        alignItems: 'stretch',
        gap: '1rem',
        padding: '0 0.5rem',
      }}
    >
      {items.map((diary) => {
        const cardHref = isAuthenticated
          ? `/edit/${diary.id}`
          : `/d/${diary.id}`
        return (
          <a
            key={diary.id}
            href={cardHref}
            style={{
              direction: 'ltr',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
              width: '168px',
              background: diary.background_color,
              backgroundImage: 'url(/images/background.webp)',
              backgroundRepeat: 'repeat',
              backgroundBlendMode: 'luminosity',
              borderRadius: '8px',
              padding: '1rem 0.8rem',
              transition: 'transform 0.15s',
              overflow: 'hidden',
              position: 'relative',
            }}
            class="diary-card"
          >
            {isAuthenticated && diary.is_draft && (
              <span
                style={{
                  position: 'absolute',
                  top: '0.4rem',
                  left: '0.4rem',
                  fontSize: '0.65rem',
                  background: 'rgba(0,0,0,0.45)',
                  color: '#fff',
                  padding: '0.1rem 0.4rem',
                  borderRadius: '3px',
                }}
              >
                下書き
              </span>
            )}
            {diary.has_unpublished_changes && (
              <span
                style={{
                  position: 'absolute',
                  top: '0.4rem',
                  left: '0.4rem',
                  fontSize: '0.65rem',
                  background: 'rgba(180,100,0,0.7)',
                  color: '#fff',
                  padding: '0.1rem 0.4rem',
                  borderRadius: '3px',
                }}
              >
                未公開の変更
              </span>
            )}
            <time
              style={{
                display: 'flex',
                justifyContent: 'center',
                fontSize: '1rem',
                color: '#666',
                marginBottom: '0.8rem',
                flexShrink: 0,
              }}
            >
              {formatDiaryDate(diary.diary_date)}
            </time>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                writingMode: 'vertical-rl',
                fontSize: '1.25rem',
                lineHeight: '1.8',
                overflow: 'hidden',
                fontWeight: 600,
                maskImage:
                  'radial-gradient(circle at bottom left, transparent 0%, black 3.5rem)',
                WebkitMaskImage:
                  'radial-gradient(circle at bottom left, transparent 0%, black 3.5rem)',
              }}
            >
              {diary.body}
            </div>
          </a>
        )
      })}
      {hasMore && (
        <div
          ref={sentinelRef}
          aria-hidden="true"
          style={{ width: '1px', flexShrink: 0 }}
        />
      )}
    </div>
  )
}
