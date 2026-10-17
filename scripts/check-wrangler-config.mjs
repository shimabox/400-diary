// wrangler.toml があるかを確かめる。--deploy を付けると、wrangler.toml.example の
// <...> の値が書き換えられずに残っていないかも確かめる。
//
// wrangler.toml は自分の環境の値を入れるファイルで、git の管理に入れていない。
// 無いまま dev やデプロイを始めると wrangler の分かりにくいエラーで止まり、
// <...> のままデプロイすると D1 などにつながらない本番ができるため、
// 始める前に何を直せばよいかを示して止める。
// Cloudflare Access の値は、手順書の順番では最初のデプロイで URL が決まった後に決まる。
// それまでは Access の JWT が届かず未ログインとして扱われるだけなので、止めずに知らせる。
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

const ACCESS_KEYS = ['CF_ACCESS_TEAM_DOMAIN', 'CF_ACCESS_AUD']

if (process.argv.includes('--deploy')) {
  const placeholders = readFileSync(CONFIG_PATH, 'utf8')
    .split('\n')
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(({ line }) => !line.startsWith('#') && /<[^>]+>/.test(line))
  const isAccess = ({ line }) =>
    ACCESS_KEYS.some((key) => new RegExp(`^${key}\\s*=`).test(line))
  const formatLines = (items) =>
    items.map(({ line, number }) => `  ${number}行目: ${line}`)

  const accessPlaceholders = placeholders.filter(isAccess)
  const blockingPlaceholders = placeholders.filter((item) => !isAccess(item))
  if (accessPlaceholders.length > 0) {
    console.warn(
      [
        `${CONFIG_PATH} の Cloudflare Access の値がまだ <...> のままです。設定するまでログインできません。`,
        '',
        ...formatLines(accessPlaceholders),
        '',
      ].join('\n'),
    )
  }
  if (blockingPlaceholders.length > 0) {
    console.error(
      [
        `${CONFIG_PATH} に書き換えていない値があります。`,
        '',
        ...formatLines(blockingPlaceholders),
        '',
        GUIDE,
      ].join('\n'),
    )
    process.exit(1)
  }
}
