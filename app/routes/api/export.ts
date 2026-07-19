import { strToU8, zipSync } from 'fflate'
import { createRoute, requireAuth } from '~/factory'
import { listAllDiaries } from '../../lib/db'
import { buildExportFiles } from '../../lib/export'
import { toLocalDateString } from '../../lib/format'

// Cloudflare Workers 無料プラン(CPU 10ms/リクエスト)対策: zip 圧縮(deflate)は CPU を
// 食うため level 0(無圧縮・格納のみ)にする。テキストの md ファイルなので圧縮効果より
// CPU 予算を優先する。
const ZIP_STORE_LEVEL = 0

export const GET = createRoute(requireAuth, async (c) => {
  const db = c.env.DB
  const diaries = await listAllDiaries(db)
  const files = buildExportFiles(diaries)

  const zipped = zipSync(
    Object.fromEntries(
      files.map(({ filename, content }) => [filename, strToU8(content)]),
    ),
    { level: ZIP_STORE_LEVEL },
  )

  const dateStamp = toLocalDateString().replaceAll('-', '')

  return new Response(new Uint8Array(zipped), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="400-diary-export-${dateStamp}.zip"`,
      // 下書きを含む認証済みユーザー専用のレスポンスのため、CDN・共有キャッシュに
      // 保存されて他ユーザーに配信される事故を防ぐ
      'Cache-Control': 'private, no-store',
    },
  })
})
