import type { D1Database, R2Bucket } from '@cloudflare/workers-types/latest'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { deleteMediaIfOrphan } from './media-cleanup'

function createOptions(
  overrides: Partial<Parameters<typeof deleteMediaIfOrphan>[0]> = {},
): Parameters<typeof deleteMediaIfOrphan>[0] {
  return {
    bucket: {} as R2Bucket,
    countReferences: vi.fn().mockResolvedValue(0),
    db: {} as D1Database,
    deleteObject: vi.fn().mockResolvedValue(undefined),
    key: 'diaries/abc/media-key',
    logLabel: 'image',
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('deleteMediaIfOrphan', () => {
  test('snapshot 参照がなければ R2 object を削除する', async () => {
    const options = createOptions()

    await deleteMediaIfOrphan(options)

    expect(options.countReferences).toHaveBeenCalledWith(
      options.db,
      options.key,
    )
    expect(options.deleteObject).toHaveBeenCalledWith(
      options.bucket,
      options.key,
    )
  })

  test('snapshot 参照があれば R2 object を削除しない', async () => {
    const options = createOptions({
      countReferences: vi.fn().mockResolvedValue(1),
    })

    await deleteMediaIfOrphan(options)

    expect(options.deleteObject).not.toHaveBeenCalled()
  })

  test('R2 delete に失敗しても例外を外へ投げない', async () => {
    const error = new Error('R2 down')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const options = createOptions({
      deleteObject: vi.fn().mockRejectedValue(error),
      logLabel: 'image',
    })

    await expect(deleteMediaIfOrphan(options)).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to delete image from R2:',
      error,
    )
  })

  test('audio の R2 delete 失敗時は audio label で log する', async () => {
    const error = new Error('R2 down')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const options = createOptions({
      deleteObject: vi.fn().mockRejectedValue(error),
      logLabel: 'audio',
    })

    await expect(deleteMediaIfOrphan(options)).resolves.toBeUndefined()

    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to delete audio from R2:',
      error,
    )
  })

  test('参照カウント取得が失敗したら R2 delete を試みない', async () => {
    const error = new Error('DB down')
    const options = createOptions({
      countReferences: vi.fn().mockRejectedValue(error),
    })

    await expect(deleteMediaIfOrphan(options)).rejects.toThrow('DB down')

    expect(options.deleteObject).not.toHaveBeenCalled()
  })
})
