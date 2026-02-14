import { hydrateIslands } from './lib/hydrate'

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

async function navigate(url: string, push: boolean): Promise<void> {
  try {
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
    window.scrollTo(0, 0)
  } catch {
    window.location.href = url
  }
}

export function initSpaNavigation(): void {
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
