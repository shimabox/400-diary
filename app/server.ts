import type { ErrorHandler } from 'hono'
import { showRoutes } from 'hono/dev'
import { createApp } from 'honox/server'

// 想定外の例外を一元的に処理する。スタックトレースをレスポンスに含めると
// 内部実装の手がかりを外部に与えてしまうため、ログにのみ出力し
// クライアントには汎用メッセージのみ返す。
export const handleServerError: ErrorHandler = (err, c) => {
  console.error(err)
  return c.json({ error: 'サーバーエラーが発生しました' }, 500)
}

const app = createApp()

app.onError(handleServerError)

showRoutes(app)

export default app
