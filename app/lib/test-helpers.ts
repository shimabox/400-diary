import type { D1Database } from '@cloudflare/workers-types/latest'
import { vi } from 'vitest'

type D1Result<T = unknown> = {
  results: T[]
  meta: { changes: number }
}

/**
 * D1Database のモックを作成する
 * first() / all() / run() の戻り値を設定可能
 */
export function createMockDB(options?: {
  first?: unknown
  all?: D1Result
  run?: D1Result
  batch?: unknown[]
}): D1Database & { boundValues: unknown[] } {
  const boundValues: unknown[] = []

  const stmt = {
    bind: vi.fn((...args: unknown[]) => {
      boundValues.push(...args)
      return stmt
    }),
    first: vi.fn(() => Promise.resolve(options?.first ?? null)),
    all: vi.fn(() =>
      Promise.resolve(options?.all ?? { results: [], meta: { changes: 0 } }),
    ),
    run: vi.fn(() => Promise.resolve(options?.run ?? { meta: { changes: 0 } })),
  }

  const db = {
    prepare: vi.fn(() => stmt),
    // db.batch([...]) は D1 の暗黙トランザクション。渡された statement 数と同じ長さの
    // 結果配列を返す（各要素は run() 相当のデフォルト値）
    batch: vi.fn((statements: unknown[]) =>
      Promise.resolve(
        options?.batch ??
          statements.map(() => ({ results: [], meta: { changes: 0 } })),
      ),
    ),
    boundValues,
    _stmt: stmt,
  }

  return db as unknown as D1Database & { boundValues: unknown[] }
}
