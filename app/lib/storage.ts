import type { R2Bucket } from '@cloudflare/workers-types/latest'
import { nanoid } from 'nanoid'
import { MAX_IMAGE_SIZE } from './constants'

const IMAGE_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]
const IMAGE_EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

async function putObject(
  bucket: R2Bucket,
  key: string,
  data: ArrayBuffer,
  contentType: string,
): Promise<void> {
  await bucket.put(key, data, { httpMetadata: { contentType } })
}

async function getObject(
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

async function deleteObject(bucket: R2Bucket, key: string): Promise<void> {
  await bucket.delete(key)
}

export function validateImage(
  size: number,
  type: string,
): { ok: true } | { ok: false; error: string } {
  if (!IMAGE_ALLOWED_TYPES.includes(type)) {
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

// クライアント申告の Content-Type は偽装できるため、実バイトの先頭シグネチャ
// (マジックバイト) が申告 MIME と一致するかを検証する。allowlist だけでは
// 「拡張子/MIMEを詐称した任意バイト列」を画像として保存・配信してしまう。
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const GIF_SIGNATURES = [
  // GIF87a
  [0x47, 0x49, 0x46, 0x38, 0x37, 0x61],
  // GIF89a
  [0x47, 0x49, 0x46, 0x38, 0x39, 0x61],
]
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46] // 'RIFF'
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50] // 'WEBP' (offset 8)

function matchesSignature(
  bytes: Uint8Array,
  signature: number[],
  offset = 0,
): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((byte, i) => bytes[offset + i] === byte)
}

export function validateImageBytes(
  bytes: Uint8Array,
  declaredType: string,
): { ok: true } | { ok: false; error: string } {
  const error = '画像ファイルが壊れているか、形式が一致しません'

  switch (declaredType) {
    case 'image/jpeg':
      if (matchesSignature(bytes, JPEG_SIGNATURE)) return { ok: true }
      break
    case 'image/png':
      if (matchesSignature(bytes, PNG_SIGNATURE)) return { ok: true }
      break
    case 'image/gif':
      if (GIF_SIGNATURES.some((sig) => matchesSignature(bytes, sig))) {
        return { ok: true }
      }
      break
    case 'image/webp':
      if (
        matchesSignature(bytes, RIFF_SIGNATURE) &&
        matchesSignature(bytes, WEBP_SIGNATURE, 8)
      ) {
        return { ok: true }
      }
      break
    default:
      // ここに来るのは validateImage の allowlist をすり抜けた場合のみだが、
      // fail-closed のため未知の型は不一致として扱う
      break
  }

  return { ok: false, error }
}

export function generateImageKey(diaryId: string, mime: string): string {
  const ext = IMAGE_EXT_MAP[mime] ?? 'bin'
  return `diaries/${diaryId}/${Date.now()}-${nanoid(8)}.${ext}`
}

export async function uploadImage(
  bucket: R2Bucket,
  key: string,
  data: ArrayBuffer,
  contentType: string,
): Promise<void> {
  await putObject(bucket, key, data, contentType)
}

export async function getImage(
  bucket: R2Bucket,
  key: string,
): Promise<{ body: ReadableStream; contentType: string } | null> {
  return getObject(bucket, key)
}

export async function deleteImage(
  bucket: R2Bucket,
  key: string,
): Promise<void> {
  await deleteObject(bucket, key)
}
