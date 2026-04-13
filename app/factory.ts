import type {
  D1Database,
  Fetcher,
  R2Bucket,
} from '@cloudflare/workers-types/latest'
import { createFactory } from 'hono/factory'

export type AppEnv = {
  Bindings: {
    ASSETS: Fetcher
    DB: D1Database
    BUCKET: R2Bucket
    CF_ACCESS_TEAM_DOMAIN: string
    CF_ACCESS_AUD: string
    DEV_AUTH_BYPASS?: string
    APP_NAME?: string
    CF_WEB_ANALYTICS_TOKEN?: string
  }
  Variables: {
    isAuthenticated: boolean
  }
}

const factory = createFactory<AppEnv>()

export const createRoute = factory.createHandlers
