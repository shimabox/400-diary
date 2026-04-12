import { describe, expect, test } from 'vitest'
import { generateImageKey, validateImage } from './storage'

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
    expect(key).toMatch(/^diaries\/abc123\/\d+\.png$/)
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
})
