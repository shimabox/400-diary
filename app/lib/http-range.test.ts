import { describe, expect, test } from 'vitest'
import { parseRange } from './http-range'

describe('parseRange', () => {
  test('ヘッダが無ければ全体を返す', () => {
    expect(parseRange(null, 100)).toEqual({ type: 'none' })
    expect(parseRange(undefined, 100)).toEqual({ type: 'none' })
    expect(parseRange('', 100)).toEqual({ type: 'none' })
  })

  test('a-b は両端を含む範囲になる', () => {
    expect(parseRange('bytes=0-1', 100)).toEqual({
      type: 'range',
      start: 0,
      end: 1,
    })
    expect(parseRange('bytes=10-19', 100)).toEqual({
      type: 'range',
      start: 10,
      end: 19,
    })
  })

  test('a-b の終端がサイズを超えたら末尾までに丸める', () => {
    expect(parseRange('bytes=90-200', 100)).toEqual({
      type: 'range',
      start: 90,
      end: 99,
    })
  })

  test('a- は末尾までの範囲になる', () => {
    expect(parseRange('bytes=40-', 100)).toEqual({
      type: 'range',
      start: 40,
      end: 99,
    })
  })

  test('-n は末尾 n バイトになり、サイズより大きければ全体になる', () => {
    expect(parseRange('bytes=-10', 100)).toEqual({
      type: 'range',
      start: 90,
      end: 99,
    })
    expect(parseRange('bytes=-500', 100)).toEqual({
      type: 'range',
      start: 0,
      end: 99,
    })
  })

  test('範囲外は unsatisfiable', () => {
    expect(parseRange('bytes=100-', 100)).toEqual({ type: 'unsatisfiable' })
    expect(parseRange('bytes=150-200', 100)).toEqual({ type: 'unsatisfiable' })
    expect(parseRange('bytes=-0', 100)).toEqual({ type: 'unsatisfiable' })
    expect(parseRange('bytes=0-', 0)).toEqual({ type: 'unsatisfiable' })
    expect(parseRange('bytes=-5', 0)).toEqual({ type: 'unsatisfiable' })
  })

  test('複数範囲は無視して全体を返す', () => {
    expect(parseRange('bytes=0-1,5-9', 100)).toEqual({ type: 'none' })
    expect(parseRange('bytes=0-1, -5', 100)).toEqual({ type: 'none' })
  })

  test.each([
    'bytes=',
    'bytes=-',
    'bytes=a-b',
    'bytes=5-1',
    'bytes=1.5-2',
    'items=0-1',
    'bytes 0-1',
    '0-1',
  ])('不正な書式（%s）は無視して全体を返す', (header) => {
    expect(parseRange(header, 100)).toEqual({ type: 'none' })
  })
})
