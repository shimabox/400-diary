import type { R2Bucket } from '@cloudflare/workers-types/latest'
import { describe, expect, test, vi } from 'vitest'
import { deleteDiaryOgCache, ogCacheKey } from './og-cache'

describe('ogCacheKey', () => {
  test('diaryId と snapshotId で一意なキーを返す', () => {
    expect(ogCacheKey('diary-1', 'snap_abc')).toBe('og/diary-1/snap_abc.png')
  })

  test('snapshotId が違えばキーも変わる(stale 画像を取り違えない)', () => {
    const a = ogCacheKey('diary-1', 'snap_old')
    const b = ogCacheKey('diary-1', 'snap_new')
    expect(a).not.toBe(b)
  })

  test('diaryId が違えばキーも変わる', () => {
    const a = ogCacheKey('diary-1', 'snap_x')
    const b = ogCacheKey('diary-2', 'snap_x')
    expect(a).not.toBe(b)
  })
})

describe('deleteDiaryOgCache', () => {
  test('og/{diaryId}/ 配下を prefix で列挙して全て削除する', async () => {
    const list = vi.fn().mockResolvedValue({
      objects: [
        { key: 'og/diary-1/snap_a.png' },
        { key: 'og/diary-1/snap_b.png' },
      ],
    })
    const del = vi.fn().mockResolvedValue(undefined)
    const bucket = { list, delete: del } as unknown as R2Bucket

    await deleteDiaryOgCache(bucket, 'diary-1')

    expect(list).toHaveBeenCalledWith({ prefix: 'og/diary-1/' })
    expect(del).toHaveBeenCalledTimes(2)
    expect(del).toHaveBeenCalledWith('og/diary-1/snap_a.png')
    expect(del).toHaveBeenCalledWith('og/diary-1/snap_b.png')
  })

  test('キャッシュが無い場合は何も削除しない', async () => {
    const list = vi.fn().mockResolvedValue({ objects: [] })
    const del = vi.fn()
    const bucket = { list, delete: del } as unknown as R2Bucket

    await deleteDiaryOgCache(bucket, 'diary-1')

    expect(del).not.toHaveBeenCalled()
  })

  test('別の日記の prefix とは混ざらない', async () => {
    const list = vi.fn().mockResolvedValue({ objects: [] })
    const bucket = { list, delete: vi.fn() } as unknown as R2Bucket

    await deleteDiaryOgCache(bucket, 'diary-2')

    expect(list).toHaveBeenCalledWith({ prefix: 'og/diary-2/' })
  })
})
