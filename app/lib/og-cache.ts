import type { R2Bucket } from '@cloudflare/workers-types/latest'

/**
 * 個別日記 OGP の R2 キャッシュキー。スナップショット単位で分けることで、
 * 再公開すると自動的に新しいキーになり、古い PNG と混ざらない。
 * （= キャッシュ削除が失敗しても stale 画像を返さない設計）
 */
export function ogCacheKey(diaryId: string, snapshotId: string): string {
  return `og/${diaryId}/${snapshotId}.png`
}

/**
 * 日記に紐づく OGP キャッシュ（全スナップショット分）を R2 から削除する。
 * 日記削除時に呼び、孤児 PNG を残さないための best-effort 掃除。
 */
export async function deleteDiaryOgCache(
  bucket: R2Bucket,
  diaryId: string,
): Promise<void> {
  const prefix = `og/${diaryId}/`
  const listed = await bucket.list({ prefix })
  await Promise.all(listed.objects.map((obj) => bucket.delete(obj.key)))
}
