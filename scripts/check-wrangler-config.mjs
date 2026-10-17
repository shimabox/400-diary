// wrangler.toml があるかを確かめる。--deploy を付けると、wrangler.toml.example の
// <...> の値が書き換えられずに残っていないかも確かめる。
//
// wrangler.toml は自分の環境の値を入れるファイルで、git の管理に入れていない。
// 無いまま dev やデプロイを始めると wrangler の分かりにくいエラーで止まり、
// <...> のままデプロイすると Cloudflare Access の検証などが通らない本番ができるため、
// 始める前に何を直せばよいかを示して止める。
import { existsSync, readFileSync } from 'node:fs'

const CONFIG_PATH = 'wrangler.toml'
const GUIDE =
  'docs/deploy/README.md の「wrangler.toml で書き換える値」を参照してください'

if (!existsSync(CONFIG_PATH)) {
  console.error(
    [
      `${CONFIG_PATH} がありません。次のコマンドでコピーし、自分の環境の値を入れてください。`,
      '',
      '  cp wrangler.toml.example wrangler.toml',
      '',
      GUIDE,
    ].join('\n'),
  )
  process.exit(1)
}

if (process.argv.includes('--deploy')) {
  const placeholders = readFileSync(CONFIG_PATH, 'utf8')
    .split('\n')
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(({ line }) => !line.startsWith('#') && /<[^>]+>/.test(line))
  if (placeholders.length > 0) {
    console.error(
      [
        `${CONFIG_PATH} に書き換えていない値があります。`,
        '',
        ...placeholders.map(({ line, number }) => `  ${number}行目: ${line}`),
        '',
        GUIDE,
      ].join('\n'),
    )
    process.exit(1)
  }
}
