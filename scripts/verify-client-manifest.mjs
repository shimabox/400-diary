// クライアントビルドの manifest を検証する。
//
// 本番の HTML は honox の <Script> が dist/.vite/manifest.json から
// app/client.ts の出力ファイル名を解決して <script> を出す。manifest に
// エントリが無い、または出力先がハッシュ付きの static/assets/ 配下でないと、
// <script> が出力されない / 長期キャッシュされずデプロイが反映されない、
// といった事故になるため、ビルド時に検証して失敗させる。
import { readFileSync } from 'node:fs'

const MANIFEST_PATH = 'dist/.vite/manifest.json'
const ENTRY = 'app/client.ts'
const EXPECTED = /^static\/assets\/client-[\w-]+\.js$/

let manifest
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
} catch (e) {
  console.error(`${MANIFEST_PATH} を読めません: ${e.message}`)
  process.exit(1)
}

const file = manifest[ENTRY]?.file
if (!file) {
  console.error(`${MANIFEST_PATH} に ${ENTRY} のエントリがありません`)
  process.exit(1)
}
if (!EXPECTED.test(file)) {
  console.error(
    `${ENTRY} の出力先が想定と違います: ${file}（期待: ${EXPECTED}）`,
  )
  process.exit(1)
}
console.log(`client entry: ${file}`)
