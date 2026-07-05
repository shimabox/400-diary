import { createRoute, requireAuth } from '~/factory'
import {
  deleteDiary,
  getDiary,
  getDiaryWithSnapshot,
  listSnapshotImageKeys,
  updateDiary,
} from '../../../lib/db'
import { deleteDiaryOgCache } from '../../../lib/og-cache'
import { deleteImage } from '../../../lib/storage'
import { validateDiaryInput } from '../../../lib/validation'

export const GET = createRoute(async (c) => {
  const id = c.req.param('id')!
  const db = c.env.DB

  if (!c.get('isAuthenticated')) {
    const published = await getDiaryWithSnapshot(db, id)
    if (!published) {
      return c.json({ error: '日記が見つかりません' }, 404)
    }

    const { snapshot } = published
    return c.json({
      id: published.id,
      diary_date: published.diary_date,
      body: snapshot.body,
      image_key: snapshot.image_key,
      image_layout: snapshot.image_layout,
      image_x: snapshot.image_x,
      image_y: snapshot.image_y,
      background_color: snapshot.background_color,
      mood: snapshot.mood,
      published_at: snapshot.published_at,
    })
  }

  const diary = await getDiary(db, id)
  if (!diary) {
    return c.json({ error: '日記が見つかりません' }, 404)
  }

  return c.json({
    id: diary.id,
    body: diary.body,
    image_key: diary.image_key,
    image_layout: diary.image_layout,
    image_x: diary.image_x,
    image_y: diary.image_y,
    background_color: diary.background_color,
    mood: diary.mood,
    diary_date: diary.diary_date,
    published_snapshot_id: diary.published_snapshot_id,
    created_at: diary.created_at,
    updated_at: diary.updated_at,
  })
})

export const PUT = createRoute(requireAuth, async (c) => {
  const id = c.req.param('id')!

  let json: unknown
  try {
    json = await c.req.json()
  } catch {
    return c.json({ error: 'リクエストの形式が不正です' }, 400)
  }

  // PUT は部分更新のため、渡されたフィールドのみ検証する(requireBody/requireDate は指定しない)
  const result = validateDiaryInput(json)
  if (!result.ok) {
    return c.json({ error: result.error }, 400)
  }

  const db = c.env.DB
  const diary = await updateDiary(db, id, result.value)

  if (!diary) {
    return c.json({ error: '日記が見つかりません' }, 404)
  }

  return c.json(diary)
})

export const DELETE = createRoute(requireAuth, async (c) => {
  const id = c.req.param('id')!
  const db = c.env.DB

  const diary = await getDiary(db, id)
  if (!diary) {
    return c.json({ error: '日記が見つかりません' }, 404)
  }

  // 下書きの画像 + snapshot の画像 + OGP キャッシュ（全スナップショット分）を
  // R2 から best-effort で削除
  const snapshotKeys = await listSnapshotImageKeys(db, id)
  const allImageKeys = new Set(snapshotKeys)
  if (diary.image_key) allImageKeys.add(diary.image_key)
  const results = await Promise.allSettled([
    ...[...allImageKeys].map((key) => deleteImage(c.env.BUCKET, key)),
    deleteDiaryOgCache(c.env.BUCKET, id),
  ])
  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('Failed to delete asset from R2:', result.reason)
    }
  }

  await deleteDiary(db, id)

  return c.body(null, 204)
})
