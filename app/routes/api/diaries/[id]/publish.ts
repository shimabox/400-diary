import { createRoute } from '~/factory'
import { publishDiary } from '../../../../lib/db'

export const POST = createRoute(async (c) => {
  if (!c.get('isAuthenticated')) {
    return c.json({ error: '認証が必要です' }, 401)
  }

  const id = c.req.param('id')!
  const db = c.env.DB
  const diary = await publishDiary(db, id)

  if (!diary) {
    return c.json({ error: '日記が見つかりません' }, 404)
  }

  return c.json(diary)
})
