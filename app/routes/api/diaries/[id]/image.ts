import type { D1Database, R2Bucket } from '@cloudflare/workers-types/latest'
import { createRoute } from '~/factory'
import {
  countSnapshotsWithImageKey,
  getDiary,
  updateDiary,
} from '../../../../lib/db'
import {
  deleteImage,
  generateImageKey,
  uploadImage,
  validateImage,
} from '../../../../lib/storage'

async function deleteIfOrphan(
  bucket: R2Bucket,
  db: D1Database,
  key: string,
): Promise<void> {
  const refCount = await countSnapshotsWithImageKey(db, key)
  if (refCount > 0) return

  try {
    await deleteImage(bucket, key)
  } catch (e) {
    console.error('Failed to delete image from R2:', e)
  }
}

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

  const oldKey = diary.image_key
  const key = generateImageKey(id, file.type)
  const data = await file.arrayBuffer()
  await uploadImage(bucket, key, data, file.type)
  await updateDiary(db, id, { image_key: key })

  if (oldKey && oldKey !== key) {
    await deleteIfOrphan(bucket, db, oldKey)
  }

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
    // DB 更新を先に行い、失敗した場合でも R2 オブジェクトを誤って消さない。
    // R2 delete 側は best-effort なので、失敗しても orphan が残るだけで
    // 参照整合性は保たれる。
    const oldKey = diary.image_key
    await updateDiary(db, id, { image_key: null })
    await deleteIfOrphan(c.env.BUCKET, db, oldKey)
  }

  return c.body(null, 204)
})
