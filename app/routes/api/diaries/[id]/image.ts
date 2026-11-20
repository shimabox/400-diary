import type { D1Database, R2Bucket } from '@cloudflare/workers-types/latest'
import { createRoute, requireAuth } from '~/factory'
import {
  countSnapshotsWithImageKey,
  getDiary,
  updateDiary,
} from '../../../../lib/db'
import { deleteMediaIfOrphan } from '../../../../lib/media-cleanup'
import {
  deleteImage,
  generateImageKey,
  uploadImage,
  validateImage,
  validateImageBytes,
} from '../../../../lib/storage'
import { parseImageDimensions } from '../../../../lib/validation'

async function deleteImageIfOrphan(
  bucket: R2Bucket,
  db: D1Database,
  key: string,
): Promise<void> {
  await deleteMediaIfOrphan({
    bucket,
    db,
    key,
    countReferences: countSnapshotsWithImageKey,
    deleteObject: deleteImage,
    logLabel: 'image',
  })
}

export const POST = createRoute(requireAuth, async (c) => {
  const id = c.req.param('id')!
  const db = c.env.DB
  const bucket = c.env.BUCKET

  const diary = await getDiary(db, id)
  if (!diary) {
    return c.json({ error: '日記が見つかりません' }, 404)
  }

  const formData = await c.req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return c.json({ error: 'ファイルを選択してください' }, 400)
  }

  const validation = validateImage(file.size, file.type)
  if (!validation.ok) {
    return c.json({ error: validation.error }, 400)
  }

  const data = await file.arrayBuffer()

  // Content-Type は申告値であり偽装できるため、実バイトのシグネチャが
  // 申告 MIME と一致するかを検証する(allowlist だけでは詐称を防げない)
  const bytesValidation = validateImageBytes(new Uint8Array(data), file.type)
  if (!bytesValidation.ok) {
    return c.json({ error: bytesValidation.error }, 400)
  }

  // 寸法はブラウザが送るファイルを表示するときの幅と高さ（向きを反映した値）。
  // サーバーは画像の中身から測らず、ログイン済みの本人のブラウザが測った値として
  // 受け取る。寸法が無くても表示はできる（読み込み後に組む）ので、無い・形式が
  // 合わないときは両方 NULL で保存し、寸法の不備で画像を断らない
  const size = parseImageDimensions(
    formData.get('width'),
    formData.get('height'),
  )

  const oldKey = diary.image_key
  const key = generateImageKey(id, file.type)
  await uploadImage(bucket, key, data, file.type)
  // 画像キーと寸法は同じ 1 回の更新で書き、別の画像の寸法が残る瞬間を作らない
  await updateDiary(db, id, { image_key: key, image_size: size })

  if (oldKey && oldKey !== key) {
    await deleteImageIfOrphan(bucket, db, oldKey)
  }

  return c.json(
    {
      image_key: key,
      image_width: size?.width ?? null,
      image_height: size?.height ?? null,
    },
    201,
  )
})

export const DELETE = createRoute(requireAuth, async (c) => {
  const id = c.req.param('id')!
  const db = c.env.DB

  const diary = await getDiary(db, id)
  if (!diary) {
    return c.json({ error: '日記が見つかりません' }, 404)
  }

  if (diary.image_key) {
    // DB 更新を先に行い、失敗した場合でも R2 オブジェクトを誤って消さない。
    // R2 delete 側は best-effort なので、失敗しても orphan が残るだけで
    // 参照整合性は保たれる。
    const oldKey = diary.image_key
    // 寸法は画像と組なので、画像キーと一緒に消す
    await updateDiary(db, id, { image_key: null, image_size: null })
    await deleteImageIfOrphan(c.env.BUCKET, db, oldKey)
  }

  return c.body(null, 204)
})
