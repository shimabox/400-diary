import type { D1Database, R2Bucket } from '@cloudflare/workers-types/latest'
import { createRoute } from '~/factory'
import {
  countSnapshotsWithAudioKey,
  getDiary,
  updateDiary,
} from '../../../../lib/db'
import {
  deleteAudio,
  generateAudioKey,
  uploadAudio,
  validateAudio,
} from '../../../../lib/storage'

async function deleteIfOrphan(
  bucket: R2Bucket,
  db: D1Database,
  key: string,
): Promise<void> {
  const refCount = await countSnapshotsWithAudioKey(db, key)
  if (refCount > 0) return

  try {
    await deleteAudio(bucket, key)
  } catch (e) {
    console.error('Failed to delete audio from R2:', e)
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

  const validation = validateAudio(file.size, file.type)
  if (!validation.ok) {
    return c.json({ error: validation.error }, 400)
  }

  const oldKey = diary.audio_key
  const key = generateAudioKey(id, file.type)
  const data = await file.arrayBuffer()
  await uploadAudio(bucket, key, data, file.type)
  await updateDiary(db, id, { audio_key: key })

  if (oldKey && oldKey !== key) {
    await deleteIfOrphan(bucket, db, oldKey)
  }

  return c.json({ audio_key: key }, 201)
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

  if (diary.audio_key) {
    const oldKey = diary.audio_key
    await updateDiary(db, id, { audio_key: null })
    await deleteIfOrphan(c.env.BUCKET, db, oldKey)
  }

  return c.body(null, 204)
})
