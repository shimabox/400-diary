import { describe, expect, test } from 'vitest'
import type { DiaryCard } from './diary-cards'
import {
  appendDiaryPage,
  buildDiaryListRequestUrl,
  computeCatchUpLimit,
  hasNextPage,
  parseScrollRestoreState,
  resolveCatchUpSource,
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

describe('parseScrollRestoreState', () => {
  test('raw が null なら null（保存データなし）', () => {
    expect(parseScrollRestoreState(null)).toBeNull()
  })

  test('JSON として壊れていれば null', () => {
    expect(parseScrollRestoreState('{count: 1, x:')).toBeNull()
  })

  test('オブジェクトでなければ null（配列）', () => {
    expect(parseScrollRestoreState('[1, 2]')).toBeNull()
  })

  test('オブジェクトでなければ null（数値）', () => {
    expect(parseScrollRestoreState('42')).toBeNull()
  })

  test('count が無ければ null', () => {
    expect(parseScrollRestoreState(JSON.stringify({ x: 10 }))).toBeNull()
  })

  test('x が無ければ null', () => {
    expect(parseScrollRestoreState(JSON.stringify({ count: 31 }))).toBeNull()
  })

  test('count が有限数でなければ null（NaN）', () => {
    expect(
      parseScrollRestoreState(JSON.stringify({ count: Number.NaN, x: 10 })),
    ).toBeNull()
  })

  test('count が有限数でなければ null（Infinity 相当の文字列は JSON では表現できないため型違反で確認）', () => {
    expect(
      parseScrollRestoreState(JSON.stringify({ count: '31', x: 10 })),
    ).toBeNull()
  })

  test('x が数値でなければ null', () => {
    expect(
      parseScrollRestoreState(JSON.stringify({ count: 31, x: '10' })),
    ).toBeNull()
  })

  test('形式が正しければ ScrollRestoreState を返す', () => {
    expect(
      parseScrollRestoreState(JSON.stringify({ count: 31, x: 120 })),
    ).toEqual({ count: 31, x: 120 })
  })
})

describe('resolveCatchUpSource', () => {
  const sessionState = { count: 62, x: 240 }

  test('history.state に count があれば最優先で採用する（popstate 復帰、挙動変更なし）', () => {
    expect(resolveCatchUpSource({ x: 100, count: 31 }, sessionState)).toEqual({
      count: 31,
      x: 100,
    })
  })

  test('history.state が無ければ sessionStorage 側を採用する', () => {
    expect(resolveCatchUpSource(null, sessionState)).toEqual(sessionState)
  })

  test('history.state はあっても count が無ければ sessionStorage 側にフォールバックする', () => {
    expect(resolveCatchUpSource({ x: 100 }, sessionState)).toEqual(sessionState)
  })

  test('どちらも無ければ null（初回訪問）', () => {
    expect(resolveCatchUpSource(null, null)).toBeNull()
  })

  test('history.state に count が無く sessionStorage も無ければ null', () => {
    expect(resolveCatchUpSource({ x: 100 }, null)).toBeNull()
  })
})
