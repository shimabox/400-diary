import { createRoute } from '~/factory'
import { randomPastelColor } from '../../lib/colors'
import { MAX_BODY_LENGTH } from '../../lib/constants'
import { createDiary } from '../../lib/db'

export const POST = createRoute(async (c) => {
  if (!c.get('isAuthenticated')) {
    return c.json({ error: '認証が必要です' }, 401)
  }

  const json = await c.req.json<{
    body?: string
    diary_date?: string
    background_color?: string
    image_layout?: 'left' | 'right'
    mood?: string | null
    image_x?: number | null
    image_y?: number | null
  }>()

  if (!json.body || json.body.length === 0) {
    return c.json({ error: '本文を入力してください' }, 400)
  }
  if (json.body.length > MAX_BODY_LENGTH) {
    return c.json(
      { error: `本文は${MAX_BODY_LENGTH}文字以内で入力してください` },
      400,
    )
  }
  if (!json.diary_date) {
    return c.json({ error: '日付を入力してください' }, 400)
  }

  const db = c.env.DB
  const diary = await createDiary(db, {
    body: json.body,
    diary_date: json.diary_date,
    background_color: json.background_color || randomPastelColor(),
    image_layout: json.image_layout,
    mood: json.mood,
    image_x: json.image_x,
    image_y: json.image_y,
  })

  return c.json(diary, 201)
})
