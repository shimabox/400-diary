import { createRoute } from '~/factory'
import { publishDiary } from '../../../../lib/db'

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

  // OGP の R2 キャッシュキーには snapshot.id が含まれるため、再公開すれば
  // 自動的に別キーになり、旧 PNG を取り違える心配がない。
  // よってここでの明示的な無効化は不要。

  return c.json({ published_at: snapshot.published_at })
})
