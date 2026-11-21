import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import * as appConstants from '../../app/lib/constants'
import * as appCompress from '../../app/lib/image-compress'
import {
  buildReferenceCountSql,
  buildUpdateSql,
  chooseOutputType,
  chooseUploadSource,
  computeResizedSize,
  decideConversion,
  detectAnimation,
  IMAGE_COMPRESS_MAX_EDGE,
  IMAGE_COMPRESS_QUALITY,
  IMAGE_DIMENSION_MAX,
  isSafeImageKey,
  isStorableSize,
  MAX_IMAGE_SIZE,
  newImageKey,
  orientedSize,
  readWranglerNames,
  SHARP_QUALITY,
  sniffImageType,
  TARGET_KEYS_SQL,
} from './image-backfill.mjs'

const ascii = (s) => Array.from(s, (c) => c.charCodeAt(0))
const u32be = (n) => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
]
const u32le = (n) => [
  n & 0xff,
  (n >>> 8) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 24) & 0xff,
]
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const pngChunk = (type, data = []) => [
  ...u32be(data.length),
  ...ascii(type),
  ...data,
  0,
  0,
  0,
  0,
]
const png = (...chunks) => new Uint8Array([...PNG_SIGNATURE, ...chunks.flat()])
const IHDR = pngChunk('IHDR', new Array(13).fill(0))
const IDAT = pngChunk('IDAT', [1, 2, 3])
const IEND = pngChunk('IEND')
const acTL = pngChunk('acTL', [...u32be(2), ...u32be(0)])
const tEXt = pngChunk('tEXt', ascii('Comment\0hello'))

function webp(chunkType, data) {
  const chunk = [...ascii(chunkType), ...u32le(data.length), ...data]
  return new Uint8Array([
    ...ascii('RIFF'),
    ...u32le(4 + chunk.length),
    ...ascii('WEBP'),
    ...chunk,
  ])
}
const vp8xData = (flags) => [flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]
const GIF = new Uint8Array([...ascii('GIF89a'), 1, 0, 1, 0, 0, 0, 0, 0x3b])

/** 判定を突き合わせる入力。名前は失敗したときに分かるように付ける */
const ANIMATION_FIXTURES = {
  apng: { bytes: png(IHDR, acTL, IDAT, IEND), mime: 'image/png' },
  'apng（acTL の前にほかのチャンク）': {
    bytes: png(IHDR, tEXt, acTL, IDAT, IEND),
    mime: 'image/png',
  },
  '静止画の PNG': { bytes: png(IHDR, IDAT, IEND), mime: 'image/png' },
  'IDAT の後に acTL がある PNG': {
    bytes: png(IHDR, IDAT, acTL, IEND),
    mime: 'image/png',
  },
  'アニメーション WebP': {
    bytes: webp('VP8X', vp8xData(0x02)),
    mime: 'image/webp',
  },
  '静止画の WebP（VP8X）': {
    bytes: webp('VP8X', vp8xData(0x10)),
    mime: 'image/webp',
  },
  '静止画の WebP（VP8）': {
    bytes: webp('VP8 ', [0, 0, 0, 0]),
    mime: 'image/webp',
  },
  '静止画の WebP（VP8L）': {
    bytes: webp('VP8L', [0, 0, 0, 0]),
    mime: 'image/webp',
  },
  '知らないチャンクの WebP': {
    bytes: webp('ABCD', [0, 0, 0, 0]),
    mime: 'image/webp',
  },
  GIF: { bytes: GIF, mime: 'image/gif' },
  JPEG: { bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), mime: 'image/jpeg' },
  '長さが壊れた PNG': {
    bytes: new Uint8Array([
      ...PNG_SIGNATURE,
      0xff,
      0xff,
      0xff,
      0xff,
      ...ascii('IHDR'),
    ]),
    mime: 'image/png',
  },
  'MIME と中身が違う（PNG と申告した WebP）': {
    bytes: webp('VP8X', vp8xData(0x02)),
    mime: 'image/png',
  },
}

describe('値が app/lib/constants.ts と同じ', () => {
  test('長辺・品質・上限・寸法の上限', () => {
    expect(IMAGE_COMPRESS_MAX_EDGE).toBe(appConstants.IMAGE_COMPRESS_MAX_EDGE)
    expect(IMAGE_COMPRESS_QUALITY).toBe(appConstants.IMAGE_COMPRESS_QUALITY)
    expect(MAX_IMAGE_SIZE).toBe(appConstants.MAX_IMAGE_SIZE)
    expect(IMAGE_DIMENSION_MAX).toBe(appConstants.IMAGE_DIMENSION_MAX)
  })

  test('sharp に渡す品質は IMAGE_COMPRESS_QUALITY の百分率', () => {
    expect(SHARP_QUALITY).toBe(
      Math.round(appConstants.IMAGE_COMPRESS_QUALITY * 100),
    )
    expect(SHARP_QUALITY).toBe(85)
  })
})

describe('detectAnimation が app/lib/image-compress.ts と同じ結果になる', () => {
  test.each(Object.entries(ANIMATION_FIXTURES))('%s', (_name, {
    bytes,
    mime,
  }) => {
    expect(detectAnimation(bytes, mime)).toBe(
      appCompress.detectAnimation(bytes, mime),
    )
  })

  test.each(
    Object.entries(ANIMATION_FIXTURES),
  )('%s を途中で切ったどの長さでも同じ結果', (_name, { bytes, mime }) => {
    for (let length = 0; length <= bytes.length; length++) {
      const cut = bytes.slice(0, length)
      expect(detectAnimation(cut, mime), `${length} bytes`).toBe(
        appCompress.detectAnimation(cut, mime),
      )
    }
  })

  test('期待する判定（突き合わせの前提が崩れていないこと）', () => {
    const { apng, GIF: gif } = ANIMATION_FIXTURES
    expect(detectAnimation(apng.bytes, apng.mime)).toBe('animated')
    expect(
      detectAnimation(ANIMATION_FIXTURES['静止画の PNG'].bytes, 'image/png'),
    ).toBe('static')
    expect(
      detectAnimation(
        ANIMATION_FIXTURES['アニメーション WebP'].bytes,
        'image/webp',
      ),
    ).toBe('animated')
    expect(
      detectAnimation(
        ANIMATION_FIXTURES['静止画の WebP（VP8X）'].bytes,
        'image/webp',
      ),
    ).toBe('static')
    expect(detectAnimation(apng.bytes.slice(0, 40), 'image/png')).toBe(
      'unknown',
    )
    // GIF は detectAnimation を通さず、decideConversion で常に変換しない
    expect(decideConversion(gif.bytes, gif.mime).convert).toBe(false)
  })
})

describe('computeResizedSize が app/lib/image-compress.ts と同じ結果になる', () => {
  const sizes = [1, 2, 3, 999, 1000, 1999, 2000, 2001, 3024, 4032, 4999, 12345]
  test('幅・高さ・長辺の上限の組み合わせ', () => {
    for (const maxEdge of [
      1,
      100,
      2000,
      appConstants.IMAGE_COMPRESS_MAX_EDGE,
    ]) {
      for (const width of sizes) {
        for (const height of sizes) {
          expect(
            computeResizedSize(width, height, maxEdge),
            `${width}x${height} / ${maxEdge}`,
          ).toEqual(appCompress.computeResizedSize(width, height, maxEdge))
        }
      }
    }
  })
})

describe('chooseOutputType が app/lib/image-compress.ts と同じ結果になる', () => {
  test.each([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/svg+xml',
    '',
  ])('%s', (mime) => {
    expect(chooseOutputType(mime)).toBe(appCompress.chooseOutputType(mime))
  })
})

describe('chooseUploadSource が app/lib/image-compress.ts と同じ結果になる', () => {
  test('縮小の有無・大きさの組み合わせ', () => {
    const maxSize = appConstants.MAX_IMAGE_SIZE
    const values = [0, 1, 1000, maxSize - 1, maxSize, maxSize + 1]
    for (const resized of [true, false]) {
      for (const compressedSize of values) {
        for (const originalSize of values) {
          const input = { resized, compressedSize, originalSize, maxSize }
          expect(chooseUploadSource(input), JSON.stringify(input)).toBe(
            appCompress.chooseUploadSource(input),
          )
        }
      }
    }
  })
})

describe('decideConversion', () => {
  test('静止画の JPEG・PNG・WebP は変換し、形式は chooseOutputType のとおり', () => {
    expect(
      decideConversion(new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg'),
    ).toEqual({ convert: true, outputType: 'image/jpeg' })
    expect(
      decideConversion(ANIMATION_FIXTURES['静止画の PNG'].bytes, 'image/png'),
    ).toEqual({ convert: true, outputType: 'image/webp' })
    expect(
      decideConversion(
        ANIMATION_FIXTURES['静止画の WebP（VP8L）'].bytes,
        'image/webp',
      ),
    ).toEqual({ convert: true, outputType: 'image/webp' })
  })

  test('GIF・アニメーション・判定できないものは変換しない', () => {
    expect(decideConversion(GIF, 'image/gif')).toEqual({
      convert: false,
      reason: 'not-compressible',
    })
    expect(
      decideConversion(ANIMATION_FIXTURES.apng.bytes, 'image/png'),
    ).toEqual({
      convert: false,
      reason: 'animated',
    })
    expect(
      decideConversion(
        ANIMATION_FIXTURES['アニメーション WebP'].bytes,
        'image/webp',
      ),
    ).toEqual({ convert: false, reason: 'animated' })
    expect(decideConversion(png(IHDR), 'image/png')).toEqual({
      convert: false,
      reason: 'animation-unknown',
    })
  })
})

describe('sniffImageType', () => {
  test('シグネチャから形式を決める', () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'image/jpeg',
    )
    expect(sniffImageType(png(IHDR))).toBe('image/png')
    expect(sniffImageType(webp('VP8 ', [0]))).toBe('image/webp')
    expect(sniffImageType(GIF)).toBe('image/gif')
    expect(sniffImageType(new Uint8Array(ascii('<svg>')))).toBeNull()
    expect(sniffImageType(new Uint8Array())).toBeNull()
  })
})

describe('orientedSize', () => {
  test('EXIF の向き 5〜8 は縦横を入れ替え、それ以外はそのまま', () => {
    for (const orientation of [1, 2, 3, 4, undefined, 0, 9]) {
      expect(orientedSize(4032, 3024, orientation)).toEqual({
        width: 4032,
        height: 3024,
      })
    }
    for (const orientation of [5, 6, 7, 8]) {
      expect(orientedSize(4032, 3024, orientation)).toEqual({
        width: 3024,
        height: 4032,
      })
    }
  })
})

describe('isStorableSize', () => {
  test('1〜上限の整数の組だけ', () => {
    expect(isStorableSize({ width: 1, height: IMAGE_DIMENSION_MAX })).toBe(true)
    expect(isStorableSize({ width: 0, height: 1 })).toBe(false)
    expect(isStorableSize({ width: 1.5, height: 1 })).toBe(false)
    expect(isStorableSize({ width: IMAGE_DIMENSION_MAX + 1, height: 1 })).toBe(
      false,
    )
    expect(isStorableSize(null)).toBe(false)
  })
})

describe('isSafeImageKey', () => {
  test('diaries/<日記 ID>/<ファイル名> の形だけを受け付ける', () => {
    expect(isSafeImageKey('diaries/abc_D-1/1700000000000-xY_9-z.jpg')).toBe(
      true,
    )
    for (const key of [
      'fonts/klee-one-400.ttf',
      'diaries/abc',
      'diaries/abc/def/ghi.jpg',
      "diaries/abc/x'; DROP TABLE diaries; --.jpg",
      'diaries/abc/a b.jpg',
      'diaries/a.b/c.jpg',
      'diaries//c.jpg',
      ' diaries/abc/c.jpg',
      'diaries/abc/c.jpg\n',
      null,
      42,
    ]) {
      expect(isSafeImageKey(key), String(key)).toBe(false)
    }
  })
})

describe('newImageKey', () => {
  test('同じ日記 ID の下に、新規アップロードと同じ形の名前を付け、拡張子を形式に合わせる', () => {
    expect(
      newImageKey('diaries/abc/old.png', 'image/webp', {
        now: 1700000000000,
        suffix: 'AbCd_-12',
      }),
    ).toBe('diaries/abc/1700000000000-AbCd_-12.webp')
    expect(
      newImageKey('diaries/abc/old.jpg', 'image/jpeg', { now: 1, suffix: 'x' }),
    ).toBe('diaries/abc/1-x.jpg')
  })

  test('作ったキーも安全なキーの形になっている', () => {
    const key = newImageKey('diaries/abc/old.jpg', 'image/jpeg', {
      now: 1700000000000,
      suffix: 'V1StGXR8',
    })
    expect(isSafeImageKey(key)).toBe(true)
  })

  test('安全でないキーや知らない形式では作らない', () => {
    expect(() =>
      newImageKey("diaries/a'/x.jpg", 'image/jpeg', { now: 1, suffix: 'x' }),
    ).toThrow()
    expect(() =>
      newImageKey('diaries/abc/x.gif', 'image/gif', { now: 1, suffix: 'x' }),
    ).toThrow()
  })
})

describe('SQL', () => {
  test('対象は寸法の無い行が参照するキーを、両テーブルから重複なく集める', () => {
    expect(TARGET_KEYS_SQL).toContain('FROM diaries')
    expect(TARGET_KEYS_SQL).toContain('FROM diary_snapshots')
    expect(TARGET_KEYS_SQL).toContain('UNION')
    expect(TARGET_KEYS_SQL).toContain(
      'image_width IS NULL OR image_height IS NULL',
    )
  })

  test('寸法だけの UPDATE は寸法だけを書き、updated_at を変えない', () => {
    const sql = buildUpdateSql('diaries', 'diaries/abc/a.gif', null, {
      width: 320,
      height: 240,
    })
    expect(sql).toBe(
      "UPDATE diaries SET image_width = 320, image_height = 240 WHERE image_key = 'diaries/abc/a.gif'",
    )
    expect(sql).not.toContain('updated_at')
  })

  test('差し替えの UPDATE はキーと寸法を書く', () => {
    expect(
      buildUpdateSql(
        'diary_snapshots',
        'diaries/abc/a.jpg',
        'diaries/abc/b.jpg',
        {
          width: 2000,
          height: 1500,
        },
      ),
    ).toBe(
      "UPDATE diary_snapshots SET image_key = 'diaries/abc/b.jpg', image_width = 2000, image_height = 1500 WHERE image_key = 'diaries/abc/a.jpg'",
    )
  })

  test('安全でないキー・寸法・テーブルは SQL にしない', () => {
    const size = { width: 1, height: 1 }
    expect(() =>
      buildUpdateSql('diaries', "diaries/a/x'.jpg", null, size),
    ).toThrow()
    expect(() =>
      buildUpdateSql('diaries', 'diaries/a/x.jpg', "diaries/a/y'.jpg", size),
    ).toThrow()
    expect(() =>
      buildUpdateSql('diaries', 'diaries/a/x.jpg', null, {
        width: 0,
        height: 1,
      }),
    ).toThrow()
    expect(() =>
      buildUpdateSql('users', 'diaries/a/x.jpg', null, size),
    ).toThrow()
    expect(() => buildReferenceCountSql("diaries/a/x'.jpg")).toThrow()
  })

  test('参照の件数は両テーブルを別々に数える', () => {
    const sql = buildReferenceCountSql('diaries/abc/a.jpg')
    expect(sql).toContain("FROM diaries WHERE image_key = 'diaries/abc/a.jpg'")
    expect(sql).toContain(
      "FROM diary_snapshots WHERE image_key = 'diaries/abc/a.jpg'",
    )
  })
})

describe('readWranglerNames', () => {
  test('ひな形の wrangler.toml.example から DB と BUCKET の名前を読める', () => {
    const toml = readFileSync(
      new URL('../../wrangler.toml.example', import.meta.url),
      'utf8',
    )
    expect(readWranglerNames(toml)).toEqual({
      databaseName: '400-diary-db',
      bucketName: '400-diary-images',
    })
  })

  test('binding で区別し、コメントは読まない', () => {
    const toml = [
      '# database_name = "commented"',
      '[[d1_databases]]',
      'binding = "OTHER"',
      'database_name = "other-db"',
      '[[d1_databases]]',
      'binding = "DB"',
      'database_name = "my-db" # 自分の DB',
      '[[r2_buckets]]',
      'binding = "BUCKET"',
      'bucket_name = "my-bucket"',
    ].join('\n')
    expect(readWranglerNames(toml)).toEqual({
      databaseName: 'my-db',
      bucketName: 'my-bucket',
    })
  })

  test('見つからなければ null', () => {
    expect(readWranglerNames('name = "x"\n')).toEqual({
      databaseName: null,
      bucketName: null,
    })
  })
})
