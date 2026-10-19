import { createRoute } from '~/factory'
import { pickRandomPublishedDiaryId } from '~/lib/db'

// 「ほかの日をめぐる」の行き先。日記ページには固定の URL だけを置き、行き先は
// 押されたときにここで選ぶ。ページの HTML をリクエストごとに変えず、キャッシュや
// OGP に影響させないため。選び直しで除くのは from（押す直前の日記）だけ。
export default createRoute(async (c) => {
  const from = c.req.query('from') ?? null
  const id = await pickRandomPublishedDiaryId(c.env.DB, from)
  // 同じ URL でも押すたびに選び直すので、ブラウザや中間のキャッシュに結果を持たせない
  c.header('Cache-Control', 'no-store')
  return c.redirect(id ? `/d/${encodeURIComponent(id)}` : '/')
})
