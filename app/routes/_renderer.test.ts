import { Hono } from 'hono'
import { jsxRenderer } from 'hono/jsx-renderer'
import { describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import { createMockDB } from '~/lib/test-helpers'

vi.mock('~/lib/db', () => ({
  getDiaryWithSnapshot: vi.fn(),
}))

const mockDiary = {
  id: 'diary-1',
  diary_date: '2026-04-13',
  background_color: '#FFE4E1',
  mood: 'happy',
  snapshot: {
    body: 'テスト本文',
    image_key: 'test-image-key',
    image_layout: 'right',
    image_x: 0,
    image_y: 0,
    background_color: '#FFE4E1',
    mood: 'happy',
  },
}

function createApp(capturedHead: { preloadImage?: string }[]) {
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.env = {
      DB: createMockDB(),
      APP_NAME: 'テスト日記',
    } as unknown as AppEnv['Bindings']
    c.set('isAuthenticated', false)
    await next()
  })

  app.use(
    '*',
    // @ts-expect-error -- テスト用の簡易rendererでResponseを返す
    jsxRenderer(({ preloadImage }) => {
      capturedHead.push({ preloadImage })
      return new Response('ok')
    }),
  )

  app.get('/d/:id', async (c) => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')
    const id = c.req.param('id')!
    const result = await getDiaryWithSnapshot(c.env.DB, id)
    if (!result) return c.notFound()
    const { snapshot } = result as typeof mockDiary
    return c.render('', {
      title: 'テスト',
      preloadImage: snapshot.image_key
        ? `/api/images/${snapshot.image_key}`
        : undefined,
    })
  })

  return app
}

describe('画像のpreload', () => {
  test('画像がある日記ではpreloadImageが渡される', async () => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValueOnce(mockDiary as never)

    const captured: { preloadImage?: string }[] = []
    const app = createApp(captured)
    await app.request('/d/diary-1')

    expect(captured[0]?.preloadImage).toBe('/api/images/test-image-key')
  })

  test('画像がない日記ではpreloadImageが渡されない', async () => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')
    const noImageDiary = {
      ...mockDiary,
      snapshot: { ...mockDiary.snapshot, image_key: null },
    }
    vi.mocked(getDiaryWithSnapshot).mockResolvedValueOnce(noImageDiary as never)

    const captured: { preloadImage?: string }[] = []
    const app = createApp(captured)
    await app.request('/d/diary-1')

    expect(captured[0]?.preloadImage).toBeUndefined()
  })
})
