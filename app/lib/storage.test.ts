import type { R2Bucket } from '@cloudflare/workers-types/latest'
import { describe, expect, test, vi } from 'vitest'
import {
  deleteImage,
  generateImageKey,
  getImage,
  uploadImage,
  validateImage,
} from './storage'

type BucketMock = R2Bucket & {
  delete: ReturnType<typeof vi.fn>
  get: ReturnType<typeof vi.fn>
  put: ReturnType<typeof vi.fn>
}

function createBucketMock(): BucketMock {
  const bucket = {
    delete: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
  }
  return bucket as unknown as BucketMock
}

describe('validateImage', () => {
  test('JPEG画像を許可する', () => {
    expect(validateImage(1024, 'image/jpeg')).toEqual({ ok: true })
  })

  test('PNG画像を許可する', () => {
    expect(validateImage(1024, 'image/png')).toEqual({ ok: true })
  })

  test('WebP画像を許可する', () => {
    expect(validateImage(1024, 'image/webp')).toEqual({ ok: true })
  })

  test('GIF画像を許可する', () => {
    expect(validateImage(1024, 'image/gif')).toEqual({ ok: true })
  })

  test('許可されていないMIMEタイプを拒否する', () => {
    const result = validateImage(1024, 'image/svg+xml')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('JPEG, PNG, WebP, GIF')
    }
  })

  test('テキストファイルを拒否する', () => {
    const result = validateImage(1024, 'text/plain')
    expect(result.ok).toBe(false)
  })

  test('10MB以内の画像を許可する', () => {
    expect(validateImage(10 * 1024 * 1024, 'image/png')).toEqual({ ok: true })
  })

  test('10MBを超える画像を拒否する', () => {
    const result = validateImage(10 * 1024 * 1024 + 1, 'image/png')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('10MB')
    }
  })
})

describe('generateImageKey', () => {
  test('diary IDとMIMEタイプからキーを生成する', () => {
    const key = generateImageKey('abc123', 'image/png')
    expect(key).toMatch(/^diaries\/abc123\/\d+-[a-zA-Z0-9_-]{8}\.png$/)
  })

  test('JPEGの拡張子はjpg', () => {
    const key = generateImageKey('id1', 'image/jpeg')
    expect(key).toMatch(/\.jpg$/)
  })

  test('WebPの拡張子はwebp', () => {
    const key = generateImageKey('id1', 'image/webp')
    expect(key).toMatch(/\.webp$/)
  })

  test('GIFの拡張子はgif', () => {
    const key = generateImageKey('id1', 'image/gif')
    expect(key).toMatch(/\.gif$/)
  })

  test('未知のMIMEタイプはbinになる', () => {
    const key = generateImageKey('id1', 'application/octet-stream')
    expect(key).toMatch(/\.bin$/)
  })

  test('同じ引数でも異なるキーを生成する', () => {
    const key1 = generateImageKey('abc', 'image/png')
    const key2 = generateImageKey('abc', 'image/png')
    expect(key1).not.toBe(key2)
  })
})

describe('R2 object helpers', () => {
  test('uploadImage は Content-Type 付きで R2 に保存する', async () => {
    const bucket = createBucketMock()
    const data = new ArrayBuffer(4)

    await uploadImage(bucket, 'image-key', data, 'image/png')

    expect(bucket.put).toHaveBeenCalledWith('image-key', data, {
      httpMetadata: { contentType: 'image/png' },
    })
  })

  test('getImage は R2 object の body と Content-Type を返す', async () => {
    const body = new ReadableStream()
    const bucket = createBucketMock()
    bucket.get.mockResolvedValue({
      body,
      httpMetadata: { contentType: 'image/png' },
    })

    await expect(getImage(bucket, 'image-key')).resolves.toEqual({
      body,
      contentType: 'image/png',
    })
  })

  test('getImage は Content-Type がなければ fallback を返す', async () => {
    const body = new ReadableStream()
    const bucket = createBucketMock()
    bucket.get.mockResolvedValue({ body })

    await expect(getImage(bucket, 'image-key')).resolves.toEqual({
      body,
      contentType: 'application/octet-stream',
    })
  })

  test('getImage は object がなければ null を返す', async () => {
    const bucket = createBucketMock()
    bucket.get.mockResolvedValue(null)

    await expect(getImage(bucket, 'missing-key')).resolves.toBeNull()
  })

  test('deleteImage は R2 object を削除する', async () => {
    const bucket = createBucketMock()

    await deleteImage(bucket, 'image-key')

    expect(bucket.delete).toHaveBeenCalledWith('image-key')
  })
})
