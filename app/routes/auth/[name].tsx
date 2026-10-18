import { createRoute } from '~/factory'

// ログインの入り口。Cloudflare Access のアプリケーションで、このパスにだけ認証をかける。
// パスは利用者が Access の画面で `auth/<好きな名前>` と決めるので、`/auth/` の下なら
// どの名前でも受け、ログインが済んだらトップへ戻す。認証そのものは Access と
// ミドルウェアが行うので、ここでは名前を確かめない。
export default createRoute((c) => {
  return c.redirect('/')
})
