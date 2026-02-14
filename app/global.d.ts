import type {} from 'hono'

type Head = {
  title?: string
  description?: string
  ogImage?: string
}

declare module 'hono' {
  interface ContextRenderer {
    // biome-ignore lint/style/useShorthandFunctionType: interface needed for module augmentation
    (
      content: string | Promise<string>,
      head?: Head,
    ): Response | Promise<Response>
  }
}
