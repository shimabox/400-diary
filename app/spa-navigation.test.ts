import { afterEach, expect, test, vi } from 'vitest'
import { hydrateIslands } from './lib/hydrate'
import { initSpaNavigation } from './spa-navigation'

vi.mock('./lib/hydrate', () => ({ hydrateIslands: vi.fn() }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

test.each([
  true,
  false,
])('リダイレクト先の編集URLを履歴に反映する（クリック遷移: %s）', async (push) => {
  const listeners = new Map<string, (event: unknown) => void>()
  const savedState = {
    window: { x: 12, y: 345 },
    containers: { 'diary-list': { x: 67, y: 89, count: 62 } },
  }
  const history = {
    pushState: vi.fn(),
    replaceState: vi.fn((state: typeof savedState | null) => {
      history.state = state
    }),
    state: savedState as typeof savedState | null,
  }
  const scrollContainer = {
    dataset: { scrollRestore: 'diary-list' },
    scrollLeft: 0,
    scrollTop: 0,
  }
  const scrollTo = vi.fn()
  const location = {
    href: 'http://localhost/',
    origin: 'http://localhost',
  }
  const body = { innerHTML: '', querySelectorAll: () => [] }
  vi.stubGlobal('history', history)
  vi.stubGlobal('location', location)
  vi.stubGlobal('CSS', { escape: (value: string) => value })
  vi.stubGlobal('document', {
    body,
    querySelector: () => scrollContainer,
    querySelectorAll: () => [scrollContainer],
    addEventListener: (name: string, handler: (event: unknown) => void) =>
      listeners.set(name, handler),
  })
  vi.stubGlobal('window', {
    location,
    scrollX: 0,
    scrollY: 0,
    scrollTo,
    addEventListener: (name: string, handler: (event: unknown) => void) =>
      listeners.set(name, handler),
  })
  vi.stubGlobal(
    'DOMParser',
    class {
      parseFromString() {
        return { title: '日記を編集', body: { innerHTML: 'editor' } }
      }
    },
  )
  const destination = 'http://localhost/edit/existing'
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      redirected: true,
      url: destination,
      headers: new Headers({ 'Content-Type': 'text/html' }),
      text: async () => 'editor',
    }),
  )

  initSpaNavigation()
  if (push) {
    listeners.get('click')!({
      button: 0,
      preventDefault: vi.fn(),
      target: {
        closest: () => ({
          href: 'http://localhost/new',
          origin: location.origin,
          pathname: '/new',
          hasAttribute: () => false,
        }),
      },
    })
  } else {
    location.href = 'http://localhost/new'
    listeners.get('popstate')!({})
  }

  await vi.waitFor(() => expect(hydrateIslands).toHaveBeenCalledWith(body))
  if (push) {
    expect(history.pushState).toHaveBeenCalledWith(null, '', destination)
  } else {
    expect(history.replaceState).toHaveBeenCalledWith(
      savedState,
      '',
      destination,
    )
    expect(history.pushState).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(scrollTo).toHaveBeenCalledWith(12, 345))
    expect(scrollContainer.scrollLeft).toBe(67)
    expect(scrollContainer.scrollTop).toBe(89)
    expect(history.state).toEqual(savedState)
  }
  expect(body.innerHTML).toBe('editor')
})
