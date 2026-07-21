import { describe, expect, test } from 'vitest'
import type { Diary } from './db'
import { buildExportFiles } from './export'

function makeDiary(overrides: Partial<Diary> = {}): Diary {
  return {
    id: 'diary-1',
    body: '本文テスト',
    image_key: null,
    image_layout: 'left',
    image_x: null,
    image_y: null,
    image_scale: null,
    background_color: '#FFE4E1',
    mood: null,
    diary_date: '2026-07-05',
    published_snapshot_id: null,
    created_at: '2026-07-05T00:00:00',
    updated_at: '2026-07-05T00:00:00',
    ...overrides,
  }
}

describe('buildExportFiles', () => {
  test('1件なら YYYY-MM-DD.md というファイル名になる', () => {
    const files = buildExportFiles([makeDiary({ diary_date: '2026-07-05' })])

    expect(files).toHaveLength(1)
    expect(files[0].filename).toBe('2026-07-05.md')
  })

  test('同日複数件は日付昇順・id昇順で -2, -3 と採番される', () => {
    const files = buildExportFiles([
      makeDiary({ id: 'c', diary_date: '2026-07-05' }),
      makeDiary({ id: 'a', diary_date: '2026-07-05' }),
      makeDiary({ id: 'b', diary_date: '2026-07-05' }),
    ])

    expect(files.map((f) => f.filename)).toEqual([
      '2026-07-05.md',
      '2026-07-05-2.md',
      '2026-07-05-3.md',
    ])
  })

  test('日付が異なる場合は日付昇順に並ぶ', () => {
    const files = buildExportFiles([
      makeDiary({ id: 'x', diary_date: '2026-07-10' }),
      makeDiary({ id: 'y', diary_date: '2026-07-01' }),
    ])

    expect(files.map((f) => f.filename)).toEqual([
      '2026-07-01.md',
      '2026-07-10.md',
    ])
  })

  test('frontmatter に date / draft / background_color を含み、null な mood / image_key は省略する', () => {
    const files = buildExportFiles([
      makeDiary({
        diary_date: '2026-07-05',
        mood: null,
        image_key: null,
        background_color: '#FFE4E1',
        published_snapshot_id: null,
        body: '本文です',
      }),
    ])

    expect(files[0].content).toBe(
      [
        '---',
        'date: "2026-07-05"',
        'draft: true',
        'background_color: "#FFE4E1"',
        '---',
        '',
        '本文です',
      ].join('\n'),
    )
  })

  test('mood と image_key が非null なら frontmatter に含まれる', () => {
    const files = buildExportFiles([
      makeDiary({
        mood: 'happy',
        image_key: 'diaries/abc.png',
        published_snapshot_id: 'snap-1',
      }),
    ])

    expect(files[0].content).toContain('mood: "happy"')
    expect(files[0].content).toContain('image_key: "diaries/abc.png"')
    expect(files[0].content).toContain('draft: false')
  })

  test('published_snapshot_id が null なら draft: true になる（未公開判定）', () => {
    const files = buildExportFiles([makeDiary({ published_snapshot_id: null })])

    expect(files[0].content).toContain('draft: true')
  })

  test('published_snapshot_id があれば draft: false になる', () => {
    const files = buildExportFiles([
      makeDiary({ published_snapshot_id: 'snap-1' }),
    ])

    expect(files[0].content).toContain('draft: false')
  })

  test('本文は常に diaries.body（現行値）を使う', () => {
    const files = buildExportFiles([
      makeDiary({ body: '現行本文（下書き含む）' }),
    ])

    expect(files[0].content).toContain('現行本文（下書き含む）')
  })

  test('空配列なら空配列を返す', () => {
    expect(buildExportFiles([])).toEqual([])
  })
})
