import { createElement, render } from 'hono/jsx/dom'

const COMPONENT_NAME = 'component-name'
const COMPONENT_EXPORT = 'component-export'
const DATA_SERIALIZED_PROPS = 'data-serialized-props'

// biome-ignore lint/suspicious/noExplicitAny: island modules have dynamic exports
const FILES = import.meta.glob<Record<string, any>>('/app/islands/**/*.tsx')

export async function hydrateIslands(root: Document | Element): Promise<void> {
  const filePromises = Object.keys(FILES).map(async (filePath) => {
    const elements = root.querySelectorAll(
      `[${COMPONENT_NAME}="${filePath}"]:not([data-hono-hydrated])`,
    )
    if (!elements.length) return

    const elementPromises = Array.from(elements).map(async (element) => {
      element.setAttribute('data-hono-hydrated', 'true')
      const exportName = element.getAttribute(COMPONENT_EXPORT) || 'default'
      const file = await FILES[filePath]()
      const Component = file[exportName]
      const serializedProps = element.getAttribute(DATA_SERIALIZED_PROPS)
      const props = JSON.parse(serializedProps ?? '{}')
      render(createElement(Component, props), element as HTMLElement)
    })

    await Promise.all(elementPromises)
  })

  await Promise.all(filePromises)
}
