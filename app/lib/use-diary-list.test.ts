import { describe, expect, test } from 'vitest'
import type { DiaryCard } from './diary-cards'
import {
  appendDiaryPage,
  buildDiaryListRequestUrl,
  computeCatchUpLimit,
  hasNextPage,
} from './use-diary-list'

function makeCard(id: string): DiaryCard {
  return {
    id,
    diary_date: '2026-07-05',
    body: `本文-${id}`,
    background_color: '#FFE4E1',
    is_draft: false,
    has_unpublished_changes: false,
  }
}

describe('buildDiaryListRequestUrl', () => {
  test('カーソル無しは limit のみのクエリになる', () => {
    expect(buildDiaryListRequestUrl(null, 31)).toBe('/api/diaries?limit=31')
  })

  test('カーソル指定時は before_date と before_id を含む', () => {
    const url = buildDiaryListRequestUrl(
      { before_date: '2026-07-01', before_id: 'cursor-id' },
      31,
    )
    const params = new URL(url, 'http://localhost').searchParams
    expect(params.get('limit')).toBe('31')
    expect(params.get('before_date')).toBe('2026-07-01')
    expect(params.get('before_id')).toBe('cursor-id')
  })
})

describe('appendDiaryPage', () => {
  test('新規 id のみ末尾に追記する', () => {
    const current = [makeCard('a'), makeCard('b')]
    const incoming = [makeCard('c')]

    expect(appendDiaryPage(current, incoming)).toEqual([
      makeCard('a'),
      makeCard('b'),
      makeCard('c'),
    ])
  })

  test('既存 id と重複するものは除外する', () => {
    const current = [makeCard('a'), makeCard('b')]
    const incoming = [makeCard('b'), makeCard('c')]

    expect(appendDiaryPage(current, incoming)).toEqual([
      makeCard('a'),
      makeCard('b'),
      makeCard('c'),
    ])
  })

  test('incoming が空なら current と同内容を返す', () => {
    const current = [makeCard('a')]

    expect(appendDiaryPage(current, [])).toEqual(current)
  })

  test('current を直接変更しない', () => {
    const current = [makeCard('a')]
    const result = appendDiaryPage(current, [makeCard('b')])

    expect(current).toHaveLength(1)
    expect(result).toHaveLength(2)
  })
})

describe('hasNextPage', () => {
  test('next が null なら false（打ち止め）', () => {
    expect(hasNextPage(null)).toBe(false)
  })

  test('next がカーソルなら true', () => {
    expect(
      hasNextPage({ before_date: '2026-07-01', before_id: 'cursor-id' }),
    ).toBe(true)
  })
})

describe('computeCatchUpLimit', () => {
  const cursor = { before_date: '2026-06-01', before_id: 'cursor-id' }

  test('不足が無ければ null（savedCount === currentItemCount）', () => {
    expect(computeCatchUpLimit(31, 31, cursor)).toBeNull()
  })

  test('現在の件数の方が多くても null（savedCount < currentItemCount）', () => {
    expect(computeCatchUpLimit(31, 62, cursor)).toBeNull()
  })

  test('不足があれば差分を返す', () => {
    expect(computeCatchUpLimit(62, 31, cursor)).toBe(31)
  })

  test('cursor が null（サーバー側で打ち止め済み）なら不足があっても null', () => {
    expect(computeCatchUpLimit(62, 31, null)).toBeNull()
  })

  test('不足が100件を超える場合は100にクランプする', () => {
    expect(computeCatchUpLimit(200, 31, cursor)).toBe(100)
  })

  test('不足がちょうど100件なら100を返す（境界値）', () => {
    expect(computeCatchUpLimit(131, 31, cursor)).toBe(100)
  })

  test('不足が101件なら100にクランプする（境界値）', () => {
    expect(computeCatchUpLimit(132, 31, cursor)).toBe(100)
  })
})
