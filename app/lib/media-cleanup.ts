import type { D1Database, R2Bucket } from '@cloudflare/workers-types/latest'

type DeleteMediaIfOrphanOptions = {
  bucket: R2Bucket
  db: D1Database
  key: string
  countReferences: (db: D1Database, key: string) => Promise<number>
  deleteObject: (bucket: R2Bucket, key: string) => Promise<void>
  logLabel: 'image' | 'audio'
}

export async function deleteMediaIfOrphan({
  bucket,
  db,
  key,
  countReferences,
  deleteObject,
  logLabel,
}: DeleteMediaIfOrphanOptions): Promise<void> {
  const refCount = await countReferences(db, key)
  if (refCount > 0) return

  try {
    await deleteObject(bucket, key)
  } catch (e) {
    console.error(`Failed to delete ${logLabel} from R2:`, e)
  }
}
