import { describe, expect, test } from 'vitest'
import {
  COLS,
  countColumns,
  countUsedCells,
  insertAtSelection,
  ROWS,
  trimToGrid,
} from './grid'

describe('グリッド定数', () => {
  test('COLSは20', () => {
    expect(COLS).toBe(20)
  })

  test('ROWSは20', () => {
    expect(ROWS).toBe(20)
  })
})

describe('countColumns', () => {
  test('空文字は0列', () => {
    expect(countColumns('')).toBe(0)
  })

  test('1文字は1列', () => {
    expect(countColumns('あ')).toBe(1)
  })

  test('20文字ちょうどは1列', () => {
    expect(countColumns('あ'.repeat(20))).toBe(1)
  })

  test('21文字は2列', () => {
    expect(countColumns('あ'.repeat(21))).toBe(2)
  })

  test('40文字ちょうどは2列', () => {
    expect(countColumns('あ'.repeat(40))).toBe(2)
  })

  test('改行で列が進む', () => {
    expect(countColumns('あ\nい')).toBe(2)
  })

  test('改行のみは1列', () => {
    expect(countColumns('\n')).toBe(2)
  })

  test('複数の改行', () => {
    expect(countColumns('あ\nい\nう')).toBe(3)
  })

  test('1行が20文字を超えると複数列になる', () => {
    expect(countColumns(`${'あ'.repeat(21)}\nい`)).toBe(3)
  })
})

describe('trimToGrid', () => {
  test('短いテキストはそのまま', () => {
    expect(trimToGrid('こんにちは')).toBe('こんにちは')
  })

  test('空文字はそのまま', () => {
    expect(trimToGrid('')).toBe('')
  })

  test('400文字ちょうどはそのまま', () => {
    const text = 'あ'.repeat(400)
    expect(trimToGrid(text)).toBe(text)
  })

  test('400文字を超えると切り詰め', () => {
    const text = 'あ'.repeat(401)
    expect(trimToGrid(text).length).toBe(400)
  })

  test('改行が多く列数を超える場合は切り詰め', () => {
    // 21行 = 21列 > 20列なので切り詰められる
    const text = Array.from({ length: 21 }, () => 'あ').join('\n')
    const result = trimToGrid(text)
    expect(countColumns(result)).toBeLessThanOrEqual(20)
  })

  test('切り詰め後も有効なテキスト', () => {
    const text = Array.from({ length: 25 }, () => 'あいう').join('\n')
    const result = trimToGrid(text)
    expect(countColumns(result)).toBeLessThanOrEqual(20)
    expect(result.length).toBeLessThanOrEqual(400)
  })
})

describe('insertAtSelection', () => {
  test('位置0で先頭挿入できる', () => {
    const r = insertAtSelection('いろは', 'ABC', 0, 0)
    expect(r.text).toBe('ABCいろは')
    expect(r.caret).toBe(3)
  })

  test('中間位置で挿入できる', () => {
    const r = insertAtSelection('いろは', 'ABC', 1, 1)
    expect(r.text).toBe('いABCろは')
    expect(r.caret).toBe(4)
  })

  test('末尾位置で末尾挿入できる', () => {
    const r = insertAtSelection('いろは', 'ABC', 3, 3)
    expect(r.text).toBe('いろはABC')
    expect(r.caret).toBe(6)
  })

  test('選択範囲を置換できる', () => {
    const r = insertAtSelection('いろはにほ', 'XY', 1, 4)
    expect(r.text).toBe('いXYほ')
    expect(r.caret).toBe(3)
  })

  test('start と end が逆転していても範囲として扱える', () => {
    const r = insertAtSelection('いろは', 'X', 2, 1)
    expect(r.text).toBe('いろXは')
    expect(r.caret).toBe(3)
  })

  test('負のインデックスは0にクランプされる', () => {
    const r = insertAtSelection('いろは', 'X', -5, -5)
    expect(r.text).toBe('Xいろは')
    expect(r.caret).toBe(1)
  })

  test('length より大きいインデックスは末尾にクランプされる', () => {
    const r = insertAtSelection('いろは', 'X', 100, 100)
    expect(r.text).toBe('いろはX')
    expect(r.caret).toBe(4)
  })

  test('空文字への挿入は挿入テキストが全体になる', () => {
    const r = insertAtSelection('', 'ABC', 0, 0)
    expect(r.text).toBe('ABC')
    expect(r.caret).toBe(3)
  })

  test('400文字制限を超えると結果が切り詰められる', () => {
    const prev = 'あ'.repeat(399)
    const r = insertAtSelection(prev, 'いうえ', 399, 399)
    expect(r.text.length).toBe(400)
    expect(r.text).toBe(`${'あ'.repeat(399)}い`)
    expect(r.caret).toBe(400)
  })

  test('列数制約で切り詰められてもcaretは文字列長にクランプされる', () => {
    const prev = Array.from({ length: 20 }, () => 'あ').join('\n')
    const r = insertAtSelection(prev, '\nい', prev.length, prev.length)
    expect(countColumns(r.text)).toBeLessThanOrEqual(20)
    expect(r.caret).toBeLessThanOrEqual(r.text.length)
  })

  test('選択範囲を音声テキストで置換したあと、caretが挿入テキスト直後に来る', () => {
    const r = insertAtSelection('今日は晴れです', 'とても', 2, 4)
    expect(r.text).toBe('今日とてもれです')
    expect(r.caret).toBe(5)
  })
})

describe('countUsedCells', () => {
  test('空文字は0マス', () => {
    expect(countUsedCells('')).toBe(0)
  })

  test('改行なしの本文は文字数と同じ(まだ列を閉じていない)', () => {
    expect(countUsedCells('今日は晴れ')).toBe(5)
    expect(countUsedCells('あ'.repeat(400))).toBe(400)
  })

  test('改行で閉じた行は列の残りマスも消費する', () => {
    // 「あ」1文字で改行 → 1列(20マス)消費 + 開いている行「い」の1マス
    expect(countUsedCells('あ\nい')).toBe(21)
    // 21文字で改行 → 2列(40マス)消費
    expect(countUsedCells(`${'あ'.repeat(21)}\n`)).toBe(40)
  })

  test('ちょうど1列(20文字)で改行した場合は無駄マスが出ない', () => {
    expect(countUsedCells(`${'あ'.repeat(20)}\nい`)).toBe(21)
  })

  test('空行は1列(20マス)を丸ごと消費する', () => {
    // 「あ」+改行(1列) + 空行(1列) + 開いている「い」1マス
    expect(countUsedCells('あ\n\nい')).toBe(41)
  })

  test('末尾が改行のとき、開いている行は0マス', () => {
    expect(countUsedCells('あ\n')).toBe(20)
  })

  test('20列を使い切った本文はちょうど400マスにはならないこともある(開き行は文字数分)', () => {
    // 閉じた19列(19行×1文字) + 開いている行3文字 = 19*20 + 3 = 383
    const text = `${Array.from({ length: 19 }, () => 'あ').join('\n')}\nいうえ`
    expect(countUsedCells(text)).toBe(383)
    expect(countColumns(text)).toBe(20)
  })
})
