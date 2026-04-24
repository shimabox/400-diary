import { createRoute } from '~/factory'
import { MAX_BODY_LENGTH } from '../../../lib/constants'
import {
  deleteDiary,
  getDiary,
  getDiaryWithSnapshot,
  listSnapshotImageKeys,
  updateDiary,
} from '../../../lib/db'
import { deleteDiaryOgCache } from '../../../lib/og-cache'
import { deleteImage } from '../../../lib/storage'

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
    mood?: string | null
    image_x?: number | null
    image_y?: number | null
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

  // 下書きの画像 + snapshot の画像 + OGP キャッシュ（全スナップショット分）を
  // R2 から best-effort で削除
  const snapshotKeys = await listSnapshotImageKeys(db, id)
  const allKeys = new Set(snapshotKeys)
  if (diary.image_key) allKeys.add(diary.image_key)
  const results = await Promise.allSettled([
    ...[...allKeys].map((key) => deleteImage(c.env.BUCKET, key)),
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
