import { createRoute, requireAuth } from '~/factory'
import { randomPastelColor } from '../../lib/colors'
import { createDiary } from '../../lib/db'
import { validateDiaryInput } from '../../lib/validation'

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
