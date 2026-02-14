import type { D1Database, R2Bucket } from '@cloudflare/workers-types/latest'
import { createFactory } from 'hono/factory'

export type AppEnv = {
  Bindings: {
    DB: D1Database
    BUCKET: R2Bucket
  }
}

const factory = createFactory<AppEnv>()

export const createRoute = factory.createHandlers
