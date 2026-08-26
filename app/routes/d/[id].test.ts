import { Hono } from 'hono'
import { jsxRenderer } from 'hono/jsx-renderer'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AppEnv } from '~/factory'
import type { DiaryWithSnapshot } from '~/lib/db'
import { createMockDB } from '~/lib/test-helpers'

vi.mock('~/lib/db', () => ({
  getDiaryWithSnapshot: vi.fn(),
}))

type CapturedHead = {
  ogImage?: string
  title?: string
  description?: string
  preloadImage?: string
  /** SSR された body の HTML */
  body?: string
}

async function createApp(captured: CapturedHead[]) {
  const { default: handlers } = await import('./[id]')
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
    // @ts-expect-error -- テスト用に head 引数をキャプチャする簡易 renderer
    jsxRenderer(({ children, ogImage, title, description, preloadImage }) => {
      captured.push({
        ogImage,
        title,
        description,
        preloadImage,
        body: String(children),
      })
      return new Response('ok')
    }),
  )

  app.get('/d/:id', ...handlers)

  return app
}

function makeSnapshot(
  overrides: Partial<DiaryWithSnapshot['snapshot']> = {},
): DiaryWithSnapshot['snapshot'] {
  return {
    id: 'snap_abc123',
    diary_id: 'diary-1',
    body: '公開された本文',
    image_key: null,
    image_layout: 'left',
    image_x: null,
    image_y: null,
    image_scale: null,
    image_rotation: null,
    background_color: '#FFE4E1',
    mood: 'happy',
    published_at: '2026-04-15 12:00:00',
    ...overrides,
  }
}

function makeResult(
  snapshotOverrides: Partial<DiaryWithSnapshot['snapshot']> = {},
): DiaryWithSnapshot {
  return {
    id: 'diary-1',
    diary_date: '2026-04-13',
    body: '下書き',
    image_key: null,
    image_layout: 'left',
    image_x: null,
    image_y: null,
    image_scale: null,
    image_rotation: null,
    background_color: '#FFE4E1',
    mood: 'happy',
    published_snapshot_id: 'snap_abc123',
    created_at: '2026-04-13 00:00:00',
    updated_at: '2026-04-15 00:00:00',
    snapshot: makeSnapshot(snapshotOverrides),
  }
}

describe('GET /d/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('og:image URL にスナップショット ID がクエリとして載る(キャッシュ迂回)', async () => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValueOnce(makeResult())

    const captured: CapturedHead[] = []
    const app = await createApp(captured)
    await app.request('/d/diary-1')

    expect(captured[0]?.ogImage).toBe('/api/og/diary-1?v=snap_abc123')
  })

  test('再公開で snapshot ID が変わると og:image URL も変わる(回帰)', async () => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValueOnce(
      makeResult({ id: 'snap_new999' }),
    )

    const captured: CapturedHead[] = []
    const app = await createApp(captured)
    await app.request('/d/diary-1')

    expect(captured[0]?.ogImage).toBe('/api/og/diary-1?v=snap_new999')
  })

  // スクロールフレームは island で、SSR では <honox-island> ラッパーに包まれる。
  // ラッパーは幅を持たないため、ページの縦 flex（alignItems: center）の直接の
  // flex item にするとキャンバスの最小幅まで膨らみ、フレームの width: 100% が
  // ビューポートではなくその幅を参照して横スクロールできなくなる（回帰）。
  // ラッパーを幅 100%（最大 960px）のブロックで包んでいることを HTML で確認する
  test('スクロールフレームが幅 100% のブロックに包まれ、狭い画面で横スクロールできる', async () => {
    const { getDiaryWithSnapshot } = await import('~/lib/db')
    vi.mocked(getDiaryWithSnapshot).mockResolvedValueOnce(makeResult())

    const captured: CapturedHead[] = []
    const app = await createApp(captured)
    await app.request('/d/diary-1')

    const body = captured[0]?.body ?? ''
    // DiaryScrollFrame のルート要素（テストでは island 変換が無いので直接描画される）
    const frameRoot =
      '<div style="position:relative;max-width:960px;width:100%">'
    expect(body).toContain(frameRoot)
    expect(body).toContain(
      `<div style="max-width:960px;width:100%">${frameRoot}`,
    )
  })
})
