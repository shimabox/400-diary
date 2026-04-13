import { createRoute } from '~/factory'
import { getDiary, updateDiary } from '../../../../lib/db'
import {
  deleteImage,
  generateImageKey,
  uploadImage,
  validateImage,
} from '../../../../lib/storage'

export const POST = createRoute(async (c) => {
  if (!c.get('isAuthenticated')) {
    return c.json({ error: '認証が必要です' }, 401)
  }

  const id = c.req.param('id')!
  const db = c.env.DB
  const bucket = c.env.BUCKET

  const diary = await getDiary(db, id)
  if (!diary) {
    return c.json({ error: '日記が見つかりません' }, 404)
  }

  const formData = await c.req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return c.json({ error: 'ファイルを選択してください' }, 400)
  }

  const validation = validateImage(file.size, file.type)
  if (!validation.ok) {
    return c.json({ error: validation.error }, 400)
  }

  const key = generateImageKey(id, file.type)
  const data = await file.arrayBuffer()
  await uploadImage(bucket, key, data, file.type)
  await updateDiary(db, id, { image_key: key })

  return c.json({ image_key: key }, 201)
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
    try {
      await deleteImage(c.env.BUCKET, diary.image_key)
    } catch (e) {
      console.error('Failed to delete image from R2:', e)
    }
    await updateDiary(db, id, { image_key: null })
  }

  return c.body(null, 204)
})
