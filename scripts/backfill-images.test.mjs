import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'vitest'
import {
  createWranglerClient,
  encodeWithSharp,
  measureWithSharp,
  parseArgs,
  processImages,
  reportSummary,
} from './backfill-images.mjs'
import { detectAnimation, TARGET_KEYS_SQL } from './lib/image-backfill.mjs'

const BUCKET = 'test-bucket'
const DATABASE = 'test-db'

const UPDATE_PATTERN =
  /^UPDATE (diaries|diary_snapshots) SET (?:image_key = '([^']+)', )?image_width = (\d+), image_height = (\d+) WHERE image_key = '([^']+)'$/
const REFERENCES_PATTERN =
  /^SELECT \(SELECT COUNT\(\*\) FROM diaries WHERE image_key = '([^']+)'\) AS diaries, \(SELECT COUNT\(\*\) FROM diary_snapshots WHERE image_key = '\1'\) AS snapshots$/

const row = (image_key) => ({
  image_key,
  image_width: null,
  image_height: null,
})

/**
 * wrangler の代わり。D1 の 2 つのテーブルと R2 を手元に持ち、スクリプトが組み立てる
 * コマンドだけを解釈する。fail が true を返した呼び出しは、wrangler の失敗として例外にする
 */
function createFakeWrangler({ diaries = [], snapshots = [], objects = {} }) {
  const state = {
    diaries: diaries.map((r) => ({ ...r })),
    diary_snapshots: snapshots.map((r) => ({ ...r })),
    objects: new Map(Object.entries(objects)),
  }
  const calls = []
  let fail = () => false

  function executeSql(sql) {
    if (sql === TARGET_KEYS_SQL) {
      const keys = new Set()
      for (const table of ['diaries', 'diary_snapshots']) {
        for (const r of state[table]) {
          if (
            r.image_key &&
            (r.image_width === null || r.image_height === null)
          ) {
            keys.add(r.image_key)
          }
        }
      }
      return [...keys].sort().map((image_key) => ({ image_key }))
    }
    const update = UPDATE_PATTERN.exec(sql)
    if (update) {
      const [, table, newKey, width, height, oldKey] = update
      for (const r of state[table]) {
        if (r.image_key !== oldKey) continue
        if (newKey) r.image_key = newKey
        r.image_width = Number(width)
        r.image_height = Number(height)
      }
      return []
    }
    const refs = REFERENCES_PATTERN.exec(sql)
    if (refs) {
      const count = (table) =>
        state[table].filter((r) => r.image_key === refs[1]).length
      return [
        { diaries: count('diaries'), snapshots: count('diary_snapshots') },
      ]
    }
    throw new Error(`fake wrangler does not understand: ${sql}`)
  }

  async function runWrangler(args) {
    calls.push(args)
    if (fail(args)) throw new Error('simulated wrangler failure')
    if (args[0] === 'd1') {
      expect(args.slice(0, 4)).toEqual(['d1', 'execute', DATABASE, '--command'])
      expect(args).toContain('--json')
      const results = executeSql(args[4])
      return { stdout: JSON.stringify([{ results, success: true, meta: {} }]) }
    }
    const [, , op, objectPath] = args
    const key = objectPath.slice(BUCKET.length + 1)
    expect(objectPath.startsWith(`${BUCKET}/`)).toBe(true)
    const file = args[args.indexOf('--file') + 1]
    if (op === 'get') {
      if (!state.objects.has(key)) {
        throw new Error('The specified key does not exist.')
      }
      await writeFile(file, state.objects.get(key))
    } else if (op === 'put') {
      state.objects.set(key, await readFile(file))
    } else if (op === 'delete') {
      state.objects.delete(key)
    } else {
      throw new Error(`fake wrangler does not understand: ${args.join(' ')}`)
    }
    return { stdout: '' }
  }

  return {
    state,
    calls,
    runWrangler,
    failWhen(predicate) {
      fail = predicate
    },
  }
}

/** 呼び出しを読みやすい操作名にする（順序の確認用） */
function describeCall(args) {
  if (args[0] === 'd1') {
    const sql = args[4]
    const update = UPDATE_PATTERN.exec(sql)
    if (update) return `update:${update[1]}`
    const refs = REFERENCES_PATTERN.exec(sql)
    if (refs) return `refs:${refs[1]}`
    return 'select'
  }
  return `${args[2]}:${args[3].slice(BUCKET.length + 1)}`
}

const isWrite = (args) =>
  (args[0] === 'r2' && (args[2] === 'put' || args[2] === 'delete')) ||
  (args[0] === 'd1' && /^\s*UPDATE/i.test(args[4]))

const isUpdateOf = (table) => (args) =>
  args[0] === 'd1' && args[4].startsWith(`UPDATE ${table} `)

let images
let tempDir

beforeAll(async () => {
  const solid = (width, height) =>
    sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 200, g: 120, b: 40 },
      },
    })
  images = {
    // 長辺が 2000px を超える JPEG。長辺 2000px の JPEG に差し替わる
    bigJpeg: await solid(2400, 1800).jpeg({ quality: 95 }).toBuffer(),
    bigJpeg2: await solid(1200, 3000).jpeg({ quality: 95 }).toBuffer(),
    // GIF は変換せず、寸法だけ記録する
    gif: await solid(320, 240).gif().toBuffer(),
    // 長辺が 2000px を超えていても、アニメーションは変換しない
    apng: toApng(await solid(2400, 100).png().toBuffer()),
    // 2 コマのアニメーション WebP（1 コマ 2400x100）
    animatedWebp: await sharp(
      [
        await solid(2400, 100).png().toBuffer(),
        await solid(2400, 100).negate().png().toBuffer(),
      ],
      { join: { animated: true } },
    )
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer(),
  }
})

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes) {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** 静止画の PNG の IHDR の直後に acTL を差し込み、APNG と判定される PNG にする */
function toApng(pngBytes) {
  const body = Buffer.from([0x61, 0x63, 0x54, 0x4c, 0, 0, 0, 1, 0, 0, 0, 0])
  const chunk = Buffer.alloc(4 + body.length + 4)
  chunk.writeUInt32BE(8, 0)
  body.copy(chunk, 4)
  chunk.writeUInt32BE(crc32(body), 4 + body.length)
  // シグネチャ(8) + IHDR(4 + 4 + 13 + 4)
  const ihdrEnd = 8 + 25
  return Buffer.concat([
    pngBytes.subarray(0, ihdrEnd),
    chunk,
    pngBytes.subarray(ihdrEnd),
  ])
}

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'backfill-images-test-'))
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
})

function setup(options) {
  const fake = createFakeWrangler(options)
  const client = createWranglerClient({
    databaseName: DATABASE,
    bucketName: BUCKET,
    local: true,
    runWrangler: fake.runWrangler,
    tempDir,
  })
  let suffix = 0
  const logs = []
  const run = (apply) =>
    processImages({
      client,
      apply,
      measure: (bytes) => measureWithSharp(sharp, bytes),
      encode: (bytes, type, resized) =>
        encodeWithSharp(sharp, bytes, type, resized),
      createKeySuffix: () => `s${++suffix}`,
      now: () => 1700000000000,
      log: (line) => logs.push(line),
      warn: (line) => logs.push(line),
    })
  return { ...fake, client, run, logs }
}

describe('--apply の 1 枚ごとの手順', () => {
  test('保存 → D1 更新 → 古いキーの参照の確認 → 古い画像の削除 の順に進む', async () => {
    const env = setup({
      diaries: [row('diaries/a/old.jpg')],
      snapshots: [row('diaries/a/old.jpg')],
      objects: { 'diaries/a/old.jpg': images.bigJpeg },
    })

    const summary = await env.run(true)

    const newKey = 'diaries/a/1700000000000-s1.jpg'
    expect(env.calls.map(describeCall)).toEqual([
      'select',
      'get:diaries/a/old.jpg',
      `put:${newKey}`,
      'update:diaries',
      'update:diary_snapshots',
      'refs:diaries/a/old.jpg',
      'delete:diaries/a/old.jpg',
    ])
    // 消す前に、消す予定の古いキーを出力している
    const announce = env.logs.indexOf(
      '  これから消す古いキー: diaries/a/old.jpg',
    )
    expect(announce).toBeGreaterThan(-1)
    expect(summary).toMatchObject({ replaced: 1, failed: 0, leftovers: [] })

    // 両テーブルのキーが新しいキーになり、寸法は長辺 2000px
    for (const table of ['diaries', 'diary_snapshots']) {
      expect(env.state[table]).toEqual([
        { image_key: newKey, image_width: 2000, image_height: 1500 },
      ])
    }
    expect(env.state.objects.has('diaries/a/old.jpg')).toBe(false)
    const stored = env.state.objects.get(newKey)
    const meta = await sharp(stored).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 2000, 1500])
    // Content-Type は書き出した形式に合わせる
    const put = env.calls.find((args) => args[2] === 'put')
    expect(put[put.indexOf('--content-type') + 1]).toBe('image/jpeg')
  })

  test('変換しない画像は寸法だけ入れ、R2 には書き込まない', async () => {
    const env = setup({
      diaries: [row('diaries/a/anim.gif')],
      objects: { 'diaries/a/anim.gif': images.gif },
    })

    const summary = await env.run(true)

    expect(env.calls.map(describeCall)).toEqual([
      'select',
      'get:diaries/a/anim.gif',
      'update:diaries',
      'update:diary_snapshots',
    ])
    expect(env.state.diaries).toEqual([
      { image_key: 'diaries/a/anim.gif', image_width: 320, image_height: 240 },
    ])
    expect(env.state.objects.get('diaries/a/anim.gif')).toEqual(images.gif)
    expect(summary).toMatchObject({ dimensionsOnly: 1, replaced: 0 })
  })

  test('APNG とアニメーション WebP は、sharp が 1 コマとして読めても差し替えず寸法だけ入れる', async () => {
    // 用意した画像が、ブラウザと同じ判定でアニメーションになっていること
    expect(detectAnimation(images.apng, 'image/png')).toBe('animated')
    expect(detectAnimation(images.animatedWebp, 'image/webp')).toBe('animated')
    expect((await sharp(images.apng).metadata()).pages ?? 1).toBe(1)

    const env = setup({
      diaries: [row('diaries/a/anim.png'), row('diaries/b/anim.webp')],
      objects: {
        'diaries/a/anim.png': images.apng,
        'diaries/b/anim.webp': images.animatedWebp,
      },
    })

    const summary = await env.run(true)

    expect(summary).toMatchObject({
      dimensionsOnly: 2,
      replaced: 0,
      skipped: 0,
    })
    expect(
      env.calls.filter((args) => args[0] === 'r2' && args[2] !== 'get'),
    ).toEqual([])
    expect(env.state.diaries).toEqual([
      { image_key: 'diaries/a/anim.png', image_width: 2400, image_height: 100 },
      {
        image_key: 'diaries/b/anim.webp',
        image_width: 2400,
        image_height: 100,
      },
    ])
  })

  test('確認だけの実行では put・delete・UPDATE を 1 回も呼ばず、見込みは --apply の結果と一致する', async () => {
    const options = {
      diaries: [row('diaries/a/old.jpg'), row('diaries/b/anim.gif')],
      snapshots: [row('diaries/a/old.jpg')],
      objects: {
        'diaries/a/old.jpg': images.bigJpeg,
        'diaries/b/anim.gif': images.gif,
      },
    }
    const env = setup(options)
    const before = structuredClone({
      diaries: env.state.diaries,
      snapshots: env.state.diary_snapshots,
    })

    const dryRun = await env.run(false)

    expect(env.calls.filter(isWrite)).toEqual([])
    expect(env.state.diaries).toEqual(before.diaries)
    expect(env.state.diary_snapshots).toEqual(before.snapshots)
    expect([...env.state.objects.keys()].sort()).toEqual([
      'diaries/a/old.jpg',
      'diaries/b/anim.gif',
    ])
    const plannedLines = env.logs.filter((line) => line.includes(' → '))

    const applied = await setup(options).run(true)
    expect({
      replaced: dryRun.replaced,
      dimensionsOnly: dryRun.dimensionsOnly,
      bytesBefore: dryRun.bytesBefore,
      bytesAfter: dryRun.bytesAfter,
    }).toEqual({
      replaced: applied.replaced,
      dimensionsOnly: applied.dimensionsOnly,
      bytesBefore: applied.bytesBefore,
      bytesAfter: applied.bytesAfter,
    })
    expect(plannedLines).toHaveLength(2)
    expect(plannedLines[0]).toContain('差し替え image/jpeg 2000x1500')
    expect(plannedLines[1]).toContain('寸法だけ記録')
  })

  test('古い画像の削除に失敗したら、キーを報告して終了コードを 0 以外にし、残りの画像も処理する', async () => {
    const env = setup({
      diaries: [row('diaries/a/old.jpg'), row('diaries/b/old.jpg')],
      objects: {
        'diaries/a/old.jpg': images.bigJpeg,
        'diaries/b/old.jpg': images.bigJpeg2,
      },
    })
    env.failWhen(
      (args) =>
        args[2] === 'delete' && args[3] === `${BUCKET}/diaries/a/old.jpg`,
    )

    const summary = await env.run(true)

    expect(summary.leftovers).toEqual([
      {
        key: 'diaries/a/old.jpg',
        reason: expect.stringContaining('削除に失敗'),
      },
    ])
    // 2 枚目も差し替えまで進む
    expect(summary.replaced).toBe(2)
    expect(env.state.objects.has('diaries/b/old.jpg')).toBe(false)
    expect(env.state.diaries[1]).toEqual({
      image_key: 'diaries/b/1700000000000-s2.jpg',
      image_width: 800,
      image_height: 2000,
    })

    const lines = []
    const hasProblems = reportSummary(summary, {
      apply: true,
      bucketName: BUCKET,
      target: '--local',
      log: (line) => lines.push(line),
    })
    expect(hasProblems).toBe(true)
    expect(lines).toContain(
      `    pnpm exec wrangler r2 object delete ${BUCKET}/diaries/a/old.jpg --local`,
    )
    expect(lines.join('\n')).toContain('image_key に持つ行が無いことを確かめて')
  })

  test('D1 の更新が全部失敗したら、古い画像は消さず、新しいキーの参照が 0 件と確かめて新しい画像を消す', async () => {
    const env = setup({
      diaries: [row('diaries/a/old.jpg')],
      snapshots: [row('diaries/a/old.jpg')],
      objects: { 'diaries/a/old.jpg': images.bigJpeg },
    })
    env.failWhen(
      (args) =>
        isUpdateOf('diaries')(args) || isUpdateOf('diary_snapshots')(args),
    )

    const summary = await env.run(true)

    const newKey = 'diaries/a/1700000000000-s1.jpg'
    expect(env.calls.map(describeCall).slice(2)).toEqual([
      `put:${newKey}`,
      'update:diaries',
      'update:diary_snapshots',
      `refs:${newKey}`,
      `delete:${newKey}`,
    ])
    expect([...env.state.objects.keys()]).toEqual(['diaries/a/old.jpg'])
    expect(summary).toMatchObject({ failed: 1, replaced: 0, leftovers: [] })
    expect(
      reportSummary(summary, {
        apply: true,
        bucketName: BUCKET,
        target: '--local',
        log: () => {},
      }),
    ).toBe(true)
  })

  test('D1 の更新が片方のテーブルだけ成功したら、古い画像も新しい画像も消さず、再実行で残りを処理して元の画像を消す', async () => {
    const env = setup({
      diaries: [row('diaries/a/old.jpg')],
      snapshots: [row('diaries/a/old.jpg')],
      objects: { 'diaries/a/old.jpg': images.bigJpeg },
    })
    env.failWhen(isUpdateOf('diary_snapshots'))

    const first = await env.run(true)

    const firstKey = 'diaries/a/1700000000000-s1.jpg'
    expect(first.failed).toBe(1)
    expect(first.leftovers).toEqual([
      { key: firstKey, reason: expect.stringContaining('参照が残っていた') },
    ])
    expect(env.calls.filter((args) => args[2] === 'delete')).toEqual([])
    expect([...env.state.objects.keys()].sort()).toEqual([
      firstKey,
      'diaries/a/old.jpg',
    ])
    expect(env.state.diaries[0].image_key).toBe(firstKey)
    expect(env.state.diary_snapshots[0]).toEqual(row('diaries/a/old.jpg'))

    // 再実行: スナップショットに残った元のキーがもう一度処理される
    env.failWhen(() => false)
    env.calls.length = 0
    const second = await env.run(true)

    const secondKey = 'diaries/a/1700000000000-s2.jpg'
    expect(second).toMatchObject({
      targets: 1,
      replaced: 1,
      failed: 0,
      leftovers: [],
    })
    expect(env.state.diary_snapshots[0]).toEqual({
      image_key: secondKey,
      image_width: 2000,
      image_height: 1500,
    })
    // 参照がなくなった元の画像は消え、どちらの新しい画像も残る（同じ内容の画像）
    expect([...env.state.objects.keys()].sort()).toEqual([firstKey, secondKey])

    // 処理が終わった状態でもう一度実行すると、対象は 0 件で何も書き換えない
    env.calls.length = 0
    const third = await env.run(true)
    expect(third.targets).toBe(0)
    expect(env.calls.filter(isWrite)).toEqual([])
  })

  test('参照の確認の問い合わせが失敗したら、どのオブジェクトも消さない', async () => {
    const env = setup({
      diaries: [row('diaries/a/old.jpg'), row('diaries/b/old.jpg')],
      snapshots: [row('diaries/b/old.jpg')],
      objects: {
        'diaries/a/old.jpg': images.bigJpeg,
        'diaries/b/old.jpg': images.bigJpeg2,
      },
    })
    // a は D1 の更新が成功したあとの古いキーの確認、b は更新に失敗したあとの新しいキーの確認が失敗する
    env.failWhen(
      (args) =>
        (args[0] === 'd1' && REFERENCES_PATTERN.test(args[4])) ||
        (args[0] === 'd1' &&
          args[4].includes("WHERE image_key = 'diaries/b/old.jpg'") &&
          args[4].startsWith('UPDATE diary_snapshots')),
    )

    const summary = await env.run(true)

    expect(env.calls.filter((args) => args[2] === 'delete')).toEqual([])
    expect(summary.leftovers.map(({ key }) => key)).toEqual([
      'diaries/a/old.jpg',
      'diaries/b/1700000000000-s2.jpg',
    ])
    for (const { reason } of summary.leftovers) {
      expect(reason).toContain('参照を確かめられなかった')
    }
    expect(env.state.objects.has('diaries/a/old.jpg')).toBe(true)
    expect(env.state.objects.has('diaries/b/old.jpg')).toBe(true)
  })

  test('新しい画像の保存に失敗したら D1 を書き換えず、失敗として報告する', async () => {
    const env = setup({
      diaries: [row('diaries/a/old.jpg')],
      objects: { 'diaries/a/old.jpg': images.bigJpeg },
    })
    env.failWhen((args) => args[2] === 'put')

    const summary = await env.run(true)

    expect(env.calls.some(isUpdateOf('diaries'))).toBe(false)
    expect(env.state.diaries).toEqual([row('diaries/a/old.jpg')])
    expect(env.state.objects.has('diaries/a/old.jpg')).toBe(true)
    expect(summary.failed).toBe(1)
  })
})

describe('対象と飛ばす画像', () => {
  test('同じキーは 1 回だけ処理し、形の違うキー・R2 に無いキー・画像でないものは飛ばして続ける', async () => {
    const env = setup({
      diaries: [
        row('diaries/a/old.jpg'),
        row("diaries/x/it's.jpg"),
        row('diaries/c/missing.jpg'),
        row('diaries/d/text.jpg'),
      ],
      snapshots: [row('diaries/a/old.jpg')],
      objects: {
        'diaries/a/old.jpg': images.bigJpeg,
        'diaries/d/text.jpg': Buffer.from('not an image'),
      },
    })

    const summary = await env.run(true)

    expect(summary).toMatchObject({
      targets: 4,
      replaced: 1,
      skipped: 3,
      failed: 0,
    })
    expect(
      env.calls.filter((args) => args[2] === 'get').map(describeCall),
    ).toEqual([
      'get:diaries/a/old.jpg',
      'get:diaries/c/missing.jpg',
      'get:diaries/d/text.jpg',
    ])
    // 形の違うキーは SQL にもコマンドにも渡さない
    expect(env.calls.flat().some((arg) => arg.includes("it's"))).toBe(false)
  })
})

describe('wrangler のコマンド', () => {
  async function commandsFor(local) {
    const calls = []
    const client = createWranglerClient({
      databaseName: DATABASE,
      bucketName: BUCKET,
      local,
      tempDir,
      runWrangler: async (args) => {
        calls.push(args)
        if (args[2] === 'get') {
          await writeFile(args[args.indexOf('--file') + 1], 'x')
        }
        return {
          stdout: JSON.stringify([
            { results: [{ diaries: 0, snapshots: 0 }], success: true },
          ]),
        }
      },
    })
    await client.listTargetKeys()
    await client.updateTable('diaries', 'diaries/a/x.jpg', null, {
      width: 1,
      height: 1,
    })
    await client.countReferences('diaries/a/x.jpg')
    await client.getObject('diaries/a/x.jpg')
    await client.putObject('diaries/a/y.jpg', Buffer.from('y'), 'image/jpeg')
    await client.deleteObject('diaries/a/x.jpg')
    return calls
  }

  test('--local を付けなければ、すべてのコマンドが本番（--remote）を指す', async () => {
    const calls = await commandsFor(false)
    expect(calls).toHaveLength(6)
    for (const args of calls) {
      expect(args.at(-1)).toBe('--remote')
      expect(args).not.toContain('--local')
    }
  })

  test('--local を付けると、すべてのコマンドがローカル（--local）を指す', async () => {
    const calls = await commandsFor(true)
    for (const args of calls) {
      expect(args.at(-1)).toBe('--local')
      expect(args).not.toContain('--remote')
    }
  })

  test('D1 は --json で実行し、R2 はバケット名/キーで指す', async () => {
    const calls = await commandsFor(true)
    expect(calls[0].slice(0, 3)).toEqual(['d1', 'execute', DATABASE])
    expect(calls[0]).toContain('--json')
    expect(calls[3].slice(0, 4)).toEqual([
      'r2',
      'object',
      'get',
      `${BUCKET}/diaries/a/x.jpg`,
    ])
    expect(calls[4]).toEqual(
      expect.arrayContaining([
        'put',
        `${BUCKET}/diaries/a/y.jpg`,
        '--content-type',
        'image/jpeg',
      ]),
    )
    expect(calls[5].slice(0, 4)).toEqual([
      'r2',
      'object',
      'delete',
      `${BUCKET}/diaries/a/x.jpg`,
    ])
  })

  test('D1 が失敗を返したら例外にする', async () => {
    const client = createWranglerClient({
      databaseName: DATABASE,
      bucketName: BUCKET,
      local: true,
      tempDir,
      runWrangler: async () => ({
        stdout: JSON.stringify([{ results: [], success: false }]),
      }),
    })
    await expect(client.listTargetKeys()).rejects.toThrow()
  })
})

describe('sharp での測り方と書き出し', () => {
  test('EXIF の向きで縦横が入れ替わる JPEG は、向きを反映した寸法で測り、向きを反映して書き出す', async () => {
    const rotated = await sharp({
      create: { width: 3000, height: 1000, channels: 3, background: '#336699' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()

    const size = await measureWithSharp(sharp, rotated)
    expect(size).toEqual({ width: 1000, height: 3000 })
    expect(size).toEqual((await sharp(rotated).metadata()).autoOrient)

    const encoded = await encodeWithSharp(sharp, rotated, 'image/jpeg', {
      width: 667,
      height: 2000,
      resized: true,
    })
    const meta = await sharp(encoded.data).metadata()
    expect([encoded.width, encoded.height]).toEqual([667, 2000])
    expect([meta.width, meta.height]).toEqual([667, 2000])
    // 書き出した画像に向きの指定は残らない（表示寸法が実寸と一致する）
    expect(meta.orientation ?? 1).toBe(1)
  })

  test('PNG は透過を残して WebP（品質 85）に書き出す', async () => {
    const transparent = await sharp({
      create: {
        width: 40,
        height: 30,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer()

    const encoded = await encodeWithSharp(sharp, transparent, 'image/webp', {
      width: 40,
      height: 30,
      resized: false,
    })
    const meta = await sharp(encoded.data).metadata()
    expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual([
      'webp',
      40,
      30,
      true,
    ])
  })
})

describe('parseArgs', () => {
  test('既定は本番を確認だけ', () => {
    expect(parseArgs([])).toEqual({ local: false, apply: false })
    expect(parseArgs(['--local', '--apply'])).toEqual({
      local: true,
      apply: true,
    })
  })

  test('知らない引数では始めない', () => {
    expect(parseArgs(['--aply']).error).toContain('--aply')
  })
})
