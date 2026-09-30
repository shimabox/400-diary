import type { D1Database, R2Bucket } from '@cloudflare/workers-types/latest'
import { createFactory } from 'hono/factory'

export type AppEnv = {
  Bindings: {
    DB: D1Database
    BUCKET: R2Bucket
    CF_ACCESS_TEAM_DOMAIN: string
    CF_ACCESS_AUD: string
    DEV_AUTH_BYPASS?: string
    APP_NAME?: string
    CF_WEB_ANALYTICS_TOKEN?: string
    // 日記の読み上げ（音声の生成と「音声が今の日記に合っているか」の判定）だけが使う。
    // 未設定なら「音声を作る」を出さない。作成済みの音声の配信・削除は設定が無くても動く
    GEMINI_API_KEY?: string
    GEMINI_VOICE_ID?: string
  }
  Variables: {
    isAuthenticated: boolean
  }
}

const factory = createFactory<AppEnv>()

export const createRoute = factory.createHandlers

// 認証必須ルートの先頭 handler として使う。未認証なら 401 を返して後続 handler
// を実行しない（Hono の handler チェーンは next() を呼ばなければそこで打ち切られる）。
// `createRoute(requireAuth, async (c) => {...})` の形で使う。
export const requireAuth = factory.createMiddleware(async (c, next) => {
  if (!c.get('isAuthenticated')) {
    return c.json({ error: '認証が必要です' }, 401)
  }
  await next()
})
