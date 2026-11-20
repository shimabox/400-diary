// 寸法の無い既存の画像に寸法を記録し、新しいアップロードと同じ基準で再圧縮して
// 軽くなるものは新しいキーへ差し替える一括パッチ。
//
// 使い方:
//   node scripts/backfill-images.mjs                  # 本番を確認だけ（書き換えない）
//   node scripts/backfill-images.mjs --apply          # 本番を書き換える
//   node scripts/backfill-images.mjs --local          # ローカルの D1・R2 を確認だけ
//   node scripts/backfill-images.mjs --local --apply  # ローカルの D1・R2 を書き換える
//
// 既定は確認だけで、D1 と R2 を一切書き換えない。確認だけでも R2 から画像を読み、
// 手元で圧縮を試して、--apply を付けたときの結果を一覧で出す。
//
// D1 と R2 には wrangler の CLI でアクセスする（認証は wrangler に任せ、このスクリプトは
// API トークンなどを読まない）。画像の処理には sharp を使う。判断の規則は
// scripts/lib/image-backfill.mjs にあり、ブラウザの圧縮と同じ基準にそろえている。
//
// 1 枚ごとの手順は、表示中の画像を失わない順にする。
//   1. 差し替える場合は、新しいキーで R2 に保存する（既存のキーには上書きしない）
//   2. diaries と diary_snapshots の、元のキーを参照する行を 1 文ずつ更新する
//   3. すべて成功したら、消す前に元のキーを出力し、参照が 0 件と確かめてから消す
//   4. 更新が失敗したら元の画像は消さず、新しい画像は参照が 0 件と確かめられたときだけ消す
// R2 のオブジェクトは、消す直前に D1 で参照が 0 件と確かめられたときだけ消す。
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import {
  buildReferenceCountSql,
  buildUpdateSql,
  chooseUploadSource,
  computeResizedSize,
  decideConversion,
  IMAGE_COMPRESS_MAX_EDGE,
  IMAGE_TABLES,
  isSafeImageKey,
  isStorableSize,
  MAX_IMAGE_SIZE,
  newImageKey,
  orientedSize,
  readWranglerNames,
  SHARP_QUALITY,
  sniffImageType,
  TARGET_KEYS_SQL,
} from './lib/image-backfill.mjs'

const execFileAsync = promisify(execFile)

const USAGE = 'node scripts/backfill-images.mjs [--local] [--apply]'

/** 実際に wrangler を起動する。stdin は閉じ、確認の入力を待たない */
export async function runWranglerCli(args) {
  const require = createRequire(import.meta.url)
  const wranglerBin = require.resolve('wrangler/bin/wrangler.js')
  const child = execFileAsync(process.execPath, [wranglerBin, ...args], {
    maxBuffer: 64 * 1024 * 1024,
  })
  child.child.stdin?.end()
  const { stdout } = await child
  return { stdout }
}

/** wrangler の --json の出力から、最後の文の結果の行を取り出す */
function parseD1Rows(stdout) {
  const start = stdout.search(/[[{]/)
  if (start < 0) throw new Error('wrangler d1 execute の出力を読めませんでした')
  const parsed = JSON.parse(stdout.slice(start))
  const results = Array.isArray(parsed) ? parsed : [parsed]
  const last = results.at(-1)
  if (!last || last.success === false || !Array.isArray(last.results)) {
    throw new Error(`D1 の実行に失敗しました: ${stdout.trim()}`)
  }
  return last.results
}

/**
 * wrangler の呼び出しをまとめたクライアント。runWrangler を差し替えれば、wrangler を
 * 起動せずに手順を確かめられる。local でなければ、すべてのコマンドに --remote を付ける
 */
export function createWranglerClient({
  databaseName,
  bucketName,
  local,
  runWrangler,
  tempDir,
}) {
  const target = local ? '--local' : '--remote'
  let fileCount = 0
  const tempFile = () => path.join(tempDir, `object-${++fileCount}`)

  async function d1(sql) {
    const { stdout } = await runWrangler([
      'd1',
      'execute',
      databaseName,
      '--command',
      sql,
      '--json',
      target,
    ])
    return parseD1Rows(stdout)
  }

  return {
    target,
    bucketName,
    async listTargetKeys() {
      const rows = await d1(TARGET_KEYS_SQL)
      return rows.map((row) => row.image_key)
    },
    async updateTable(table, oldKey, newKey, size) {
      await d1(buildUpdateSql(table, oldKey, newKey, size))
    },
    async countReferences(key) {
      const [row] = await d1(buildReferenceCountSql(key))
      const diaries = Number(row?.diaries)
      const snapshots = Number(row?.snapshots)
      if (!Number.isInteger(diaries) || !Number.isInteger(snapshots)) {
        throw new Error('参照の件数を読めませんでした')
      }
      return { diaries, snapshots }
    },
    async getObject(key) {
      const file = tempFile()
      try {
        await runWrangler([
          'r2',
          'object',
          'get',
          `${bucketName}/${key}`,
          '--file',
          file,
          target,
        ])
        return await readFile(file)
      } finally {
        await rm(file, { force: true })
      }
    },
    async putObject(key, data, contentType) {
      const file = tempFile()
      try {
        await writeFile(file, data)
        await runWrangler([
          'r2',
          'object',
          'put',
          `${bucketName}/${key}`,
          '--file',
          file,
          '--content-type',
          contentType,
          target,
        ])
      } finally {
        await rm(file, { force: true })
      }
    },
    async deleteObject(key) {
      await runWrangler([
        'r2',
        'object',
        'delete',
        `${bucketName}/${key}`,
        target,
      ])
    },
  }
}

/** sharp で、EXIF の向きを反映した寸法を測る */
export async function measureWithSharp(sharp, bytes) {
  const meta = await sharp(bytes).metadata()
  return orientedSize(meta.width, meta.height, meta.orientation ?? 1)
}

/**
 * sharp で、向きを反映し、必要なら縮めて、指定の形式（品質 85）で書き出す。
 * 書き出した画像には EXIF の向きを残さないので、出力の寸法がそのまま表示寸法になる
 */
export async function encodeWithSharp(sharp, bytes, outputType, resized) {
  let pipeline = sharp(bytes).autoOrient()
  if (resized.resized) {
    pipeline = pipeline.resize(resized.width, resized.height, { fit: 'fill' })
  }
  pipeline =
    outputType === 'image/jpeg'
      ? pipeline.jpeg({ quality: SHARP_QUALITY })
      : pipeline.webp({ quality: SHARP_QUALITY })
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

function describeReason(reason) {
  switch (reason) {
    case 'not-compressible':
      return '圧縮しない形式'
    case 'animated':
      return 'アニメーション'
    case 'animation-unknown':
      return 'アニメーションか判定できない'
    case 'not-smaller':
      return '書き出しても軽くならない'
    case 'too-large':
      return '書き出すと上限を超える'
    case 'encode-failed':
      return '書き出しに失敗した'
    default:
      return reason
  }
}

const formatSize = (size) => `${size.width}x${size.height}`

/**
 * 1 枚の画像について、--apply を付けたときの結果を決める（R2 も D1 も書き換えない）。
 * 飛ばすときは { skip: 理由 } を返す
 */
export async function planImage(bytes, { measure, encode }) {
  const mime = sniffImageType(bytes)
  if (!mime) return { skip: '画像として読めません（形式が分かりません）' }
  let size
  try {
    size = await measure(bytes)
  } catch (error) {
    return { skip: `画像として読めません（${error.message}）` }
  }
  if (!isStorableSize(size)) {
    return {
      skip: `寸法が保存できる範囲にありません（${JSON.stringify(size)}）`,
    }
  }

  const base = { mime, size, bytes: bytes.length }
  const decision = decideConversion(bytes, mime)
  if (!decision.convert) {
    return { ...base, action: 'dimensions', reason: decision.reason }
  }

  const resized = computeResizedSize(
    size.width,
    size.height,
    IMAGE_COMPRESS_MAX_EDGE,
  )
  let encoded
  try {
    encoded = await encode(bytes, decision.outputType, resized)
  } catch {
    return { ...base, action: 'dimensions', reason: 'encode-failed' }
  }
  const outputSize = { width: encoded.width, height: encoded.height }
  const source = chooseUploadSource({
    resized: resized.resized,
    compressedSize: encoded.data.length,
    originalSize: bytes.length,
    maxSize: MAX_IMAGE_SIZE,
  })
  if (source === 'original' || !isStorableSize(outputSize)) {
    const reason =
      encoded.data.length > MAX_IMAGE_SIZE ? 'too-large' : 'not-smaller'
    return { ...base, action: 'dimensions', reason }
  }
  return {
    ...base,
    action: 'replace',
    output: {
      type: decision.outputType,
      size: outputSize,
      data: encoded.data,
    },
  }
}

function describePlan(key, plan) {
  const current = `${plan.mime} ${formatSize(plan.size)} ${plan.bytes} bytes`
  if (plan.action === 'replace') {
    const out = plan.output
    return `${key}: ${current} → 差し替え ${out.type} ${formatSize(out.size)} ${out.data.length} bytes`
  }
  return `${key}: ${current} → 寸法だけ記録（${describeReason(plan.reason)}）`
}

/**
 * 対象の画像を順に処理する。apply が false なら書き込みのコマンドを 1 回も呼ばない。
 * 失敗した画像があっても残りを続け、最後に件数と R2 に残ったキーを返す
 */
export async function processImages({
  client,
  apply,
  measure,
  encode,
  createKeySuffix,
  now = () => Date.now(),
  log = console.log,
  warn = console.warn,
}) {
  const summary = {
    targets: 0,
    replaced: 0,
    dimensionsOnly: 0,
    skipped: 0,
    failed: 0,
    bytesBefore: 0,
    bytesAfter: 0,
    leftovers: [],
    failures: [],
  }
  const leaveKey = (key, reason) => {
    summary.leftovers.push({ key, reason })
    warn(`R2 に残ったキー: ${key}（${reason}）`)
  }
  const fail = (key, reason) => {
    summary.failed++
    summary.failures.push({ key, reason })
    warn(`失敗: ${key}（${reason}）`)
  }

  /** 参照が両テーブルで 0 件と確かめられたときだけ消す。そうでなければ残して報告する */
  async function deleteIfUnreferenced(key) {
    let refs
    try {
      refs = await client.countReferences(key)
    } catch (error) {
      leaveKey(key, `参照を確かめられなかった: ${error.message}`)
      return
    }
    if (refs.diaries + refs.snapshots > 0) {
      leaveKey(
        key,
        `参照が残っていた（diaries ${refs.diaries} 件・diary_snapshots ${refs.snapshots} 件）`,
      )
      return
    }
    try {
      await client.deleteObject(key)
    } catch (error) {
      leaveKey(key, `削除に失敗した: ${error.message}`)
    }
  }

  const keys = await client.listTargetKeys()
  summary.targets = keys.length
  log(`対象の画像: ${keys.length} 件`)

  for (const key of keys) {
    if (!isSafeImageKey(key)) {
      summary.skipped++
      warn(`飛ばします: ${JSON.stringify(key)}（キーの形が想定と違います）`)
      continue
    }

    let bytes
    try {
      bytes = await client.getObject(key)
    } catch (error) {
      summary.skipped++
      warn(`飛ばします: ${key}（R2 から読めません: ${error.message}）`)
      continue
    }

    const plan = await planImage(bytes, { measure, encode })
    if (plan.skip) {
      summary.skipped++
      warn(`飛ばします: ${key}（${plan.skip}）`)
      continue
    }
    log(describePlan(key, plan))

    const replace = plan.action === 'replace'
    if (!apply) {
      if (replace) {
        summary.replaced++
        summary.bytesBefore += plan.bytes
        summary.bytesAfter += plan.output.data.length
      } else {
        summary.dimensionsOnly++
      }
      continue
    }

    // 1. 差し替える場合は、新しいキーで先に保存する
    let newKey = null
    if (replace) {
      newKey = newImageKey(key, plan.output.type, {
        now: now(),
        suffix: createKeySuffix(),
      })
      try {
        await client.putObject(newKey, plan.output.data, plan.output.type)
      } catch (error) {
        fail(key, `新しい画像を保存できなかった: ${error.message}`)
        // 保存が途中まで進んでいたときに備え、参照が無いと確かめて片付ける
        await deleteIfUnreferenced(newKey)
        continue
      }
    }

    // 2. 両テーブルを 1 文ずつ更新する。片方だけ成功することがある
    const size = replace ? plan.output.size : plan.size
    const tableErrors = []
    for (const table of IMAGE_TABLES) {
      try {
        await client.updateTable(table, key, newKey, size)
      } catch (error) {
        tableErrors.push(`${table}: ${error.message}`)
      }
    }

    if (tableErrors.length > 0) {
      // 4. 元の画像は消さない。新しい画像は、参照が 0 件と確かめられたときだけ消す
      fail(key, `D1 を更新できなかった（${tableErrors.join(' / ')}）`)
      if (newKey) await deleteIfUnreferenced(newKey)
      continue
    }

    if (!replace) {
      summary.dimensionsOnly++
      continue
    }

    summary.replaced++
    summary.bytesBefore += plan.bytes
    summary.bytesAfter += plan.output.data.length
    log(`  新しいキー: ${newKey}`)
    // 3. 消す前に記録を残す。ここで止まっても、どのキーを消す予定だったかが分かる
    log(`  これから消す古いキー: ${key}`)
    await deleteIfUnreferenced(key)
  }

  return summary
}

/** 最後の報告。失敗か R2 に残ったキーがあれば true を返す（終了コードを 0 以外にする） */
export function reportSummary(summary, { apply, bucketName, target, log }) {
  const label = apply ? '' : '（見込み）'
  log('')
  log(`=== 結果${label} ===`)
  log(`対象: ${summary.targets} 件`)
  log(`差し替え: ${summary.replaced} 件`)
  log(`寸法だけ: ${summary.dimensionsOnly} 件`)
  log(`飛ばした: ${summary.skipped} 件`)
  log(`失敗: ${summary.failed} 件`)
  log(
    `差し替えた画像の合計: ${summary.bytesBefore} bytes → ${summary.bytesAfter} bytes`,
  )
  for (const { key, reason } of summary.failures) {
    log(`  失敗: ${key}（${reason}）`)
  }
  if (summary.leftovers.length > 0) {
    log('')
    log('=== R2 に残ったキー ===')
    log(
      '手で消す前に、diaries と diary_snapshots のどちらにも、そのキーを image_key に持つ行が無いことを確かめてください。参照されていないものは、残しても表示には影響しません。',
    )
    for (const { key, reason } of summary.leftovers) {
      log(`  ${key}（${reason}）`)
      log(
        `    pnpm exec wrangler r2 object delete ${bucketName}/${key} ${target}`,
      )
    }
  }
  if (!apply) {
    log('')
    log('確認だけを行いました。書き換えるには --apply を付けて実行します。')
  }
  return summary.failed > 0 || summary.leftovers.length > 0
}

export function parseArgs(argv) {
  const known = new Set(['--local', '--apply'])
  const unknown = argv.filter((arg) => !known.has(arg))
  if (unknown.length > 0) {
    return { error: `知らない引数です: ${unknown.join(' ')}\n使い方: ${USAGE}` }
  }
  return { local: argv.includes('--local'), apply: argv.includes('--apply') }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.error) {
    console.error(args.error)
    return 2
  }
  const { local, apply } = args

  // dev・デプロイと同じ確認をしてから始める。本番が対象のときは <...> の残りも確かめる
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  try {
    await execFileAsync(
      process.execPath,
      [
        path.join(root, 'scripts/check-wrangler-config.mjs'),
        ...(local ? [] : ['--deploy']),
      ],
      { cwd: root },
    ).then(({ stderr }) => {
      if (stderr) process.stderr.write(stderr)
    })
  } catch (error) {
    process.stderr.write(error.stderr ?? `${error.message}\n`)
    return 1
  }

  const names = readWranglerNames(
    await readFile(path.join(root, 'wrangler.toml'), 'utf8'),
  )
  if (!names.databaseName || !names.bucketName) {
    console.error(
      'wrangler.toml から D1 の database_name（binding = "DB"）と R2 の bucket_name（binding = "BUCKET"）を読めませんでした。',
    )
    return 1
  }

  console.log(
    `=== ${local ? 'ローカル' : '本番（リモート）'}の D1「${names.databaseName}」と R2「${names.bucketName}」 / ${apply ? '書き換える（--apply）' : '確認だけ'} ===`,
  )

  const [{ default: sharp }, { nanoid }] = await Promise.all([
    import('sharp'),
    import('nanoid'),
  ])
  const tempDir = await mkdtemp(path.join(tmpdir(), 'backfill-images-'))
  try {
    process.chdir(root)
    const client = createWranglerClient({
      ...names,
      local,
      runWrangler: runWranglerCli,
      tempDir,
    })
    const summary = await processImages({
      client,
      apply,
      measure: (bytes) => measureWithSharp(sharp, bytes),
      encode: (bytes, type, resized) =>
        encodeWithSharp(sharp, bytes, type, resized),
      createKeySuffix: () => nanoid(8),
    })
    const hasProblems = reportSummary(summary, {
      apply,
      bucketName: names.bucketName,
      target: client.target,
      log: console.log,
    })
    return hasProblems ? 1 : 0
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().then(
    (code) => {
      process.exitCode = code
    },
    (error) => {
      console.error(error)
      process.exitCode = 1
    },
  )
}
