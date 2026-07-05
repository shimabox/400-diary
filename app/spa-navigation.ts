import { hydrateIslands } from './lib/hydrate'

type ScrollState = {
  window: { x: number; y: number }
  containers: Record<string, { x: number; y: number }>
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

/**
 * `data-scroll-align="end"` が付いた要素の横スクロール位置を末尾（scrollWidth）に揃える。
 * d/[id].tsx の日記本文コンテナ（右→左に流れる縦書き）を「文頭」から表示するための処理。
 * 元は d/[id].tsx に直接埋め込んだインラインスクリプトだったが、CSP の script-src
 * から 'unsafe-inline' を排除するためこちらへ移した。初回ロード（client.ts）と
 * SPA ナビゲーション後（navigate 内）の両方から呼び出し、挙動を維持する。
 * rAF で1フレーム後にずらすタイミングは元のインラインスクリプトと同じ。
 */
export function alignScrollToEnd(root: Document | Element): void {
  const elements = root.querySelectorAll<HTMLElement>(
    '[data-scroll-align="end"]',
  )
  for (const el of elements) {
    requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth
    })
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
  const containers: Record<string, { x: number; y: number }> = {}
  const elements = document.querySelectorAll<HTMLElement>(
    '[data-scroll-restore]',
  )
  for (const el of elements) {
    const key = el.dataset.scrollRestore
    if (!key) continue
    containers[key] = { x: el.scrollLeft, y: el.scrollTop }
  }
  return {
    window: { x: window.scrollX, y: window.scrollY },
    containers,
  }
}

function isScrollState(value: unknown): value is ScrollState {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<ScrollState>
  return (
    !!v.window &&
    typeof v.window.x === 'number' &&
    typeof v.window.y === 'number' &&
    !!v.containers &&
    typeof v.containers === 'object'
  )
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
    alignScrollToEnd(document.body)

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
