import { useCallback, useEffect, useRef, useState } from 'hono/jsx'
import type { DiaryCard, DiaryListCursor } from '../lib/diary-cards'
import { formatDiaryDate } from '../lib/format'
import {
  appendDiaryPage,
  buildDiaryListRequestUrl,
  hasNextPage,
} from '../lib/use-diary-list'

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
