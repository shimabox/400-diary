import { createRoute } from '~/factory'
import { deleteDiary, getDiary, updateDiary } from '../../../lib/db'
import { deleteImage } from '../../../lib/storage'

const MAX_BODY_LENGTH = 256

export const GET = createRoute(async (c) => {
  const id = c.req.param('id')!
  const db = c.env.DB
  const diary = await getDiary(db, id)

  if (!diary) {
    return c.json({ error: '日記が見つかりません' }, 404)
  }

  return c.json(diary)
})

export const PUT = createRoute(async (c) => {
  if (!c.get('isAuthenticated')) {
    return c.json({ error: '認証が必要です' }, 401)
  }

  const id = c.req.param('id')!
  const json = await c.req.json<{
    body?: string
    diary_date?: string
    background_color?: string
    image_layout?: 'left' | 'right'
    published_at?: string | null
  }>()

  if (json.body !== undefined) {
    if (json.body.length === 0) {
      return c.json({ error: '本文を入力してください' }, 400)
    }
    if (json.body.length > MAX_BODY_LENGTH) {
      return c.json(
        { error: `本文は${MAX_BODY_LENGTH}文字以内で入力してください` },
        400,
      )
    }
  }

  const db = c.env.DB
  const diary = await updateDiary(db, id, json)

  if (!diary) {
    return c.json({ error: '日記が見つかりません' }, 404)
  }

  return c.json(diary)
})

export const DELETE = createRoute(async (c) => {
  if (!c.get('isAuthenticated')) {
    return c.json({ error: '認証が必要です' }, 401)
  }

  const id = c.req.param('id')!
  const db = c.env.DB

  const diary = await getDiary(db, id)
  if (!diary) {
    return c.json({ error: '日記が見つかりません' }, 404)
  }

  if (diary.image_key) {
    await deleteImage(c.env.BUCKET, diary.image_key)
  }

  await deleteDiary(db, id)

  return c.body(null, 204)
})
