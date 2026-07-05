import { createRoute, requireAuth } from '~/factory'
import { randomPastelColor } from '../../lib/colors'
import { createDiary, listDiariesPage } from '../../lib/db'
import { toDiaryListPage } from '../../lib/diary-cards'
import { isDiaryDate, validateDiaryInput } from '../../lib/validation'

const DEFAULT_LIMIT = 31
const MIN_LIMIT = 1
const MAX_LIMIT = 100
// nanoid のデフォルトアルファベットは A-Za-z0-9_- 。長さは createDiary(12) 前提だが
// カーソルとして届く値の形式チェックとして緩めに 1〜64 文字を許容する。
const CURSOR_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

function clampLimit(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_LIMIT
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, n))
}

// GET は一覧を無限スクロールで配信する公開エンドポイントのため認証不要。
// ただし未認証時は listDiariesPage の publishedOnly + toDiaryListPage の防御的フィルタで
// 下書きデータが一切混ざらないようにする。
export const GET = createRoute(async (c) => {
  const limit = clampLimit(c.req.query('limit'))
  const beforeDate = c.req.query('before_date')
  const beforeId = c.req.query('before_id')

  if ((beforeDate === undefined) !== (beforeId === undefined)) {
    return c.json(
      { error: 'before_date と before_id は両方指定してください' },
      400,
    )
  }

  let before: { diaryDate: string; id: string } | undefined
  if (beforeDate !== undefined && beforeId !== undefined) {
    if (!isDiaryDate(beforeDate) || !CURSOR_ID_PATTERN.test(beforeId)) {
      return c.json({ error: 'カーソルの形式が不正です' }, 400)
    }
    before = { diaryDate: beforeDate, id: beforeId }
  }

  const isAuthenticated = c.get('isAuthenticated')
  const db = c.env.DB
  const rows = await listDiariesPage(db, {
    limit,
    before,
    publishedOnly: !isAuthenticated,
  })

  const { items, next } = toDiaryListPage(rows, isAuthenticated, limit)

  return c.json({ items, next })
})

export const POST = createRoute(requireAuth, async (c) => {
  let json: unknown
  try {
    json = await c.req.json()
  } catch {
    return c.json({ error: 'リクエストの形式が不正です' }, 400)
  }

  const result = validateDiaryInput(json, {
    requireBody: true,
    requireDate: true,
  })
  if (!result.ok) {
    return c.json({ error: result.error }, 400)
  }
  const input = result.value

  const db = c.env.DB
  const diary = await createDiary(db, {
    body: input.body as string,
    diary_date: input.diary_date as string,
    background_color: input.background_color || randomPastelColor(),
    image_layout: input.image_layout,
    mood: input.mood,
    image_x: input.image_x,
    image_y: input.image_y,
  })

  return c.json(diary, 201)
})
