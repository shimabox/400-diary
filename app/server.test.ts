import { Hono } from 'hono'
import { describe, expect, test, vi } from 'vitest'

// app/server.ts はトップレベルで honox/server の createApp() を実行しており、
// これは import.meta.glob で app/routes 配下を実際に読み込む(og-image.ts が読み込む
// resvg-wasm-module は vite.config.ts 側のカスタムプラグインでのみ解決できる仮想
// モジュールで、vitest.config.ts では解決できず import に失敗する)。
// そのため server.ts を直接 import せず、app.onError に登録するハンドラと同じ契約
// (スタックトレースを含めない 500 レスポンス)を単体の Hono app で検証する。
describe('app.onError', () => {
  test('例外発生時にスタックトレースを含まない500を返す', async () => {
    const app = new Hono()
    app.get('/boom', () => {
      throw new Error('boom: secret internal detail')
    })
    app.onError((err, c) => {
      console.error(err)
      return c.json({ error: 'サーバーエラーが発生しました' }, 500)
    })

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
    const res = await app.request('/boom')
    consoleErrorSpy.mockRestore()

    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json).toEqual({ error: 'サーバーエラーが発生しました' })

    const text = JSON.stringify(json)
    expect(text).not.toContain('boom')
    expect(text).not.toContain('.ts:')
  })
})
