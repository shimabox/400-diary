import type { R2Bucket } from '@cloudflare/workers-types/latest'
import { nanoid } from 'nanoid'
import { MAX_IMAGE_SIZE } from './constants'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export function validateImage(
  size: number,
  type: string,
): { ok: true } | { ok: false; error: string } {
  if (!ALLOWED_TYPES.includes(type)) {
    return { ok: false, error: 'JPEG, PNG, WebP, GIF のみアップロードできます' }
  }
  if (size > MAX_IMAGE_SIZE) {
    return {
      ok: false,
      error: `画像は${MAX_IMAGE_SIZE / (1024 * 1024)}MB以内にしてください`,
    }
  }
  return { ok: true }
}

export function generateImageKey(diaryId: string, mime: string): string {
  const ext = EXT_MAP[mime] ?? 'bin'
  return `diaries/${diaryId}/${Date.now()}-${nanoid(8)}.${ext}`
}

export async function uploadImage(
  bucket: R2Bucket,
  key: string,
  data: ArrayBuffer,
  contentType: string,
): Promise<void> {
  await bucket.put(key, data, { httpMetadata: { contentType } })
}

export async function getImage(
  bucket: R2Bucket,
  key: string,
): Promise<{ body: ReadableStream; contentType: string } | null> {
  const obj = await bucket.get(key)
  if (!obj) return null
  return {
    body: obj.body as unknown as ReadableStream,
    contentType: obj.httpMetadata?.contentType ?? 'application/octet-stream',
  }
}

export async function deleteImage(
  bucket: R2Bucket,
  key: string,
): Promise<void> {
  await bucket.delete(key)
}
