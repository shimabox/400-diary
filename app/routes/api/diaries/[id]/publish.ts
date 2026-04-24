import { createRoute } from '~/factory'
import { publishDiary } from '../../../../lib/db'
import { deleteOgCache } from '../../../../lib/og-image'

export const POST = createRoute(async (c) => {
  if (!c.get('isAuthenticated')) {
    return c.json({ error: '認証が必要です' }, 401)
  }

  const id = c.req.param('id')!
  const db = c.env.DB
  const snapshot = await publishDiary(db, id)

  if (!snapshot) {
    return c.json({ error: '日記が見つかりません' }, 404)
  }

  // 再公開後も OGP が古い画像のままにならないよう、R2 キャッシュを捨てる。
  // レスポンスは止めたくないので失敗してもログだけ残す。
  try {
    await deleteOgCache(c.env.BUCKET, id)
  } catch (e) {
    console.error('[OGP] failed to invalidate cache on publish:', e)
  }

  return c.json({ published_at: snapshot.published_at })
})
