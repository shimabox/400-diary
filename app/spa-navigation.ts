import { hydrateIslands } from './lib/hydrate'

type ContainerScrollState = {
  x: number
  y: number
  // 無限スクロールで読み込み済みの件数（diary-list island が data-scroll-restore-count で
  // 書き出す）。汎用性維持のため、その属性を持たないコンテナでは常に undefined になる。
  // 旧形式（この属性導入前）に保存された state にも存在しないため optional。
  count?: number
}

type ScrollState = {
  window: { x: number; y: number }
  containers: Record<string, ContainerScrollState>
}

function activateScripts(container: Element): void {
  const scripts = container.querySelectorAll('script')
  for (const old of scripts) {
    const fresh = document.createElement('script')
    for (const attr of old.attributes) {
      fresh.setAttribute(attr.name, attr.value)
    }
    fresh.textContent = old.textContent
    old.parentNode?.replaceChild(fresh, old)
  }
}

function shouldIntercept(anchor: HTMLAnchorElement): boolean {
  if (anchor.origin !== location.origin) return false
  if (
    anchor.pathname.startsWith('/api/') ||
    anchor.pathname.startsWith('/static/')
  )
    return false
  if (anchor.hasAttribute('download')) return false
  if (anchor.target === '_blank') return false
  return true
}

function captureScrollState(): ScrollState {
  const containers: Record<string, ContainerScrollState> = {}
  const elements = document.querySelectorAll<HTMLElement>(
    '[data-scroll-restore]',
  )
  for (const el of elements) {
    const key = el.dataset.scrollRestore
    if (!key) continue
    // data-scroll-restore-count が無いコンテナ（属性を書き出さない汎用ケース）では
    // 従来通り x/y のみ保存する。
    const rawCount = el.dataset.scrollRestoreCount
    const count =
      rawCount === undefined ? Number.NaN : Number.parseInt(rawCount, 10)
    containers[key] = {
      x: el.scrollLeft,
      y: el.scrollTop,
      ...(Number.isFinite(count) ? { count } : {}),
    }
  }
  return {
    window: { x: window.scrollX, y: window.scrollY },
    containers,
  }
}

function isScrollState(value: unknown): value is ScrollState {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<ScrollState>
  if (
    !v.window ||
    typeof v.window.x !== 'number' ||
    typeof v.window.y !== 'number' ||
    !v.containers ||
    typeof v.containers !== 'object'
  ) {
    return false
  }
  // count は導入前の旧形式 state には存在しない。存在する場合のみ number であることを確認する
  // （後方互換: 無くても不正扱いしない）。
  return Object.values(v.containers).every(
    (pos) => pos.count === undefined || typeof pos.count === 'number',
  )
}

/**
 * history.state に保存された ScrollState から、指定した data-scroll-restore key の
 * コンテナ状態を取り出す。diary-list island が SPA 復帰後の無限スクロール件数キャッチアップ
 * （読み込み済み件数が不足していれば追加取得してから scrollLeft を上書きする）に使うために公開する。
 * ScrollState が無い（初回訪問）/ 該当 key が無い場合は null を返す。
 */
export function getSavedContainerScrollState(
  key: string,
): ContainerScrollState | null {
  const state = history.state
  if (!isScrollState(state)) return null
  return state.containers[key] ?? null
}

function restoreScrollState(state: ScrollState): void {
  for (const [key, pos] of Object.entries(state.containers)) {
    const el = document.querySelector<HTMLElement>(
      `[data-scroll-restore="${CSS.escape(key)}"]`,
    )
    if (el) {
      el.scrollLeft = pos.x
      el.scrollTop = pos.y
    }
  }
  window.scrollTo(state.window.x, state.window.y)
}

async function navigate(url: string, push: boolean): Promise<void> {
  try {
    if (push) {
      history.replaceState(captureScrollState(), '', location.href)
    }

    const res = await fetch(url)
    const contentType = res.headers.get('content-type') ?? ''
    if (!res.ok || !contentType.includes('text/html')) {
      window.location.href = url
      return
    }

    const html = await res.text()
    const doc = new DOMParser().parseFromString(html, 'text/html')

    document.title = doc.title
    document.body.innerHTML = doc.body.innerHTML

    if (push) {
      history.pushState(null, '', url)
    }

    activateScripts(document.body)
    await hydrateIslands(document.body)

    const saved = history.state
    if (!push && isScrollState(saved)) {
      restoreScrollState(saved)
    } else {
      window.scrollTo(0, 0)
    }
  } catch {
    window.location.href = url
  }
}

export function initSpaNavigation(): void {
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual'
  }

  document.addEventListener('click', (e) => {
    const anchor = (e.target as Element).closest('a')
    if (!anchor) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (e.button !== 0) return
    if (!shouldIntercept(anchor)) return

    e.preventDefault()
    if (anchor.href === location.href) return
    navigate(anchor.href, true)
  })

  window.addEventListener('popstate', () => {
    navigate(location.href, false)
  })
}
