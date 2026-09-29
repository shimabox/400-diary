import type { D1Database, R2Bucket } from '@cloudflare/workers-types/latest'
import { listSpeechKeysInUse } from './db'
import { deleteDiarySpeech, logSpeechError } from './speech'

/**
 * 下書きと公開中のどちらからも参照されていない読み上げ音声を R2 から消す。
 * 生成・公開のついでに呼ぶ best-effort 掃除なので、失敗はログに残すだけで投げない。
 */
export async function deleteUnusedDiarySpeech(
  db: D1Database,
  bucket: R2Bucket,
  diaryId: string,
): Promise<void> {
  try {
    const keep = await listSpeechKeysInUse(db, diaryId)
    await deleteDiarySpeech(bucket, diaryId, keep)
  } catch (error) {
    logSpeechError('failed to delete unused audio', error)
  }
}
