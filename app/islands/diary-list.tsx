import { useCallback, useEffect, useRef, useState } from 'hono/jsx'
import type { DiaryCard, DiaryListCursor } from '../lib/diary-cards'
import { formatDiaryDate } from '../lib/format'
import {
  appendDiaryPage,
  buildDiaryListRequestUrl,
  computeCatchUpLimit,
  hasNextPage,
  parseScrollRestoreState,
  resolveCatchUpSource,
  SCROLL_STORAGE_KEY,
  type ScrollRestoreState,
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
    // SPA 復帰直後のキャッチアップ取得。復元元は2種類あり、history.state（popstate 専用、
    // PR #56）を最優先し、無ければ同一タブの sessionStorage（ヘッダーリンク等での前進
    // ナビゲーション経由の復帰にも対応するため追加）にフォールバックする。
    // 選択ロジックは resolveCatchUpSource に切り出し済み（挙動: history.state に count が
    // あれば従来通りそれを使うので popstate 復帰の挙動に変更はない）。
    const historySaved = getSavedContainerScrollState('diary-list')
    let sessionSaved: ScrollRestoreState | null = null
    try {
      sessionSaved = parseScrollRestoreState(
        sessionStorage.getItem(SCROLL_STORAGE_KEY),
      )
    } catch {
      // プライベートモード等で sessionStorage へのアクセス自体が例外になり得るが、
      // 復元できないだけなので無視して初回訪問相当（null）にフォールバックする。
      sessionSaved = null
    }
    const saved = resolveCatchUpSource(historySaved, sessionSaved)
    if (saved === null) return undefined

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
    const el = containerRef.current
    if (!el) return undefined

    // 同一タブ内であれば、ヘッダーリンク等の前進ナビゲーションで一覧に戻ってきた場合でも
    // 続きから再開できるようにするための保存（history.state は popstate 専用で、前進
    // ナビゲーションでは新しい履歴エントリになり使えないため sessionStorage を併用する）。
    const save = () => {
      try {
        const state: ScrollRestoreState = {
          count: items.length,
          x: el.scrollLeft,
        }
        sessionStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(state))
      } catch {
        // プライベートモード等で例外になり得るが、次回復元できないだけなので無視してよい
      }
    }

    // items 数が変化した（＝この effect が再実行された）タイミングでも保存する。
    save()

    // scroll イベントは高頻度で発火するため、そのたびに JSON.stringify するのは避けたい。
    // rAF で1フレームにつき最大1回に間引く（passive リスナーで scroll 自体をブロックしない）。
    let rafId: number | null = null
    const onScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        save()
      })
    }
    // なお、キャッチアップ復元による programmatic な scrollLeft 代入（上の effect）でも
    // scroll イベントは発火するが、そのとき保存されるのはその時点の正しい位置なので害はない。
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (rafId !== null) cancelAnimationFrame(rafId)
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
