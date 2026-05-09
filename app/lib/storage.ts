import type { R2Bucket } from '@cloudflare/workers-types/latest'
import { nanoid } from 'nanoid'
import { audioExtension, baseMimeType } from './audio-mime'
import { MAX_AUDIO_SIZE, MAX_IMAGE_SIZE } from './constants'

const IMAGE_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]
const AUDIO_ALLOWED_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/webm',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
]

const IMAGE_EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
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

export function generateImageKey(diaryId: string, mime: string): string {
  const ext = IMAGE_EXT_MAP[mime] ?? 'bin'
  return `diaries/${diaryId}/${Date.now()}-${nanoid(8)}.${ext}`
}

export function validateAudio(
  size: number,
  type: string,
): { ok: true } | { ok: false; error: string } {
  if (!AUDIO_ALLOWED_TYPES.includes(baseMimeType(type))) {
    return {
      ok: false,
      error: 'MP3, WebM, MP4, WAV, Ogg のみアップロードできます',
    }
  }
  if (size > MAX_AUDIO_SIZE) {
    return {
      ok: false,
      error: `音声は${MAX_AUDIO_SIZE / (1024 * 1024)}MB以内にしてください`,
    }
  }
  return { ok: true }
}

export function generateAudioKey(diaryId: string, mime: string): string {
  return `diaries/${diaryId}/audio/${Date.now()}-${nanoid(8)}.${audioExtension(mime)}`
}

export async function uploadImage(
  bucket: R2Bucket,
  key: string,
  data: ArrayBuffer,
  contentType: string,
): Promise<void> {
  await bucket.put(key, data, { httpMetadata: { contentType } })
}

export async function uploadAudio(
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

export async function getAudio(
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

export async function deleteAudio(
  bucket: R2Bucket,
  key: string,
): Promise<void> {
  await bucket.delete(key)
}
