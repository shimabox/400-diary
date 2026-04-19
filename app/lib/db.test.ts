import { describe, expect, test, vi } from 'vitest'
import {
  countSnapshotsWithImageKey,
  createDiary,
  deleteDiary,
  getDiary,
  updateDiary,
} from './db'
import { createMockDB } from './test-helpers'

vi.mock('nanoid', () => ({
  nanoid: () => 'test-id-1234',
}))

describe('createDiary', () => {
  test('body, diary_date, background_color をDBに渡す', async () => {
    const diary = {
      id: 'test-id-1234',
      body: 'テスト日記',
      diary_date: '2026-04-12',
      background_color: '#FFE4E1',
      image_key: null,
      image_layout: 'left' as const,
      mood: null,
      published_snapshot_id: null,
      created_at: '2026-04-12T00:00:00',
      updated_at: '2026-04-12T00:00:00',
    }
    const db = createMockDB({ first: diary })

    const result = await createDiary(db, {
      body: 'テスト日記',
      diary_date: '2026-04-12',
      background_color: '#FFE4E1',
    })

    expect(result).toEqual(diary)
    expect(db.prepare).toHaveBeenCalledTimes(2) // INSERT + SELECT
    expect(db.boundValues).toContain('test-id-1234')
    expect(db.boundValues).toContain('テスト日記')
    expect(db.boundValues).toContain('#FFE4E1')
  })

  test('image_layout のデフォルトは left', async () => {
    const db = createMockDB({ first: { id: 'test-id-1234' } })

    await createDiary(db, {
      body: '本文',
      diary_date: '2026-04-12',
      background_color: '#FFE4E1',
    })

    expect(db.boundValues).toContain('left')
  })

  test('mood を指定できる', async () => {
    const db = createMockDB({ first: { id: 'test-id-1234' } })

    await createDiary(db, {
      body: '本文',
      diary_date: '2026-04-12',
      background_color: '#FFE4E1',
      mood: 'happy',
    })

    expect(db.boundValues).toContain('happy')
  })

  test('image_x と image_y を指定できる', async () => {
    const db = createMockDB({ first: { id: 'test-id-1234' } })

    await createDiary(db, {
      body: '本文',
      diary_date: '2026-04-12',
      background_color: '#FFE4E1',
      image_x: 150.5,
      image_y: 200,
    })

    expect(db.boundValues).toContain(150.5)
    expect(db.boundValues).toContain(200)
  })

  test('image_x と image_y のデフォルトは null', async () => {
    const db = createMockDB({ first: { id: 'test-id-1234' } })

    await createDiary(db, {
      body: '本文',
      diary_date: '2026-04-12',
      background_color: '#FFE4E1',
    })

    // bind の引数: id, body, bg_color, image_layout, mood, diary_date, image_x, image_y
    const nullCount = db.boundValues.filter((v) => v === null).length
    expect(nullCount).toBeGreaterThanOrEqual(2) // mood=null, image_x=null, image_y=null
  })
})

describe('getDiary', () => {
  test('存在するIDで日記を取得できる', async () => {
    const diary = { id: 'abc', body: 'テスト' }
    const db = createMockDB({ first: diary })

    const result = await getDiary(db, 'abc')

    expect(result).toEqual(diary)
    expect(db.boundValues).toContain('abc')
  })

  test('存在しないIDはnullを返す', async () => {
    const db = createMockDB({ first: null })

    const result = await getDiary(db, 'not-found')

    expect(result).toBeNull()
  })
})

describe('updateDiary', () => {
  test('存在しない日記はnullを返す', async () => {
    const db = createMockDB({ first: null })

    const result = await updateDiary(db, 'not-found', { body: '更新' })

    expect(result).toBeNull()
  })

  test('bodyを更新するとSQLにbodyが含まれる', async () => {
    const diary = { id: 'abc', body: '元の本文' }
    const db = createMockDB({ first: diary })

    await updateDiary(db, 'abc', { body: '更新された本文' })

    // prepare: 1回目=SELECT(存在確認), 2回目=UPDATE, 3回目=SELECT(返却用)
    expect(db.prepare).toHaveBeenCalledTimes(3)
    expect(db.boundValues).toContain('更新された本文')
  })

  test('moodをnullに設定できる', async () => {
    const diary = { id: 'abc', mood: 'happy' }
    const db = createMockDB({ first: diary })

    await updateDiary(db, 'abc', { mood: null })

    expect(db.boundValues).toContain(null)
  })

  test('image_x と image_y を更新できる', async () => {
    const diary = { id: 'abc', image_x: null, image_y: null }
    const db = createMockDB({ first: diary })

    await updateDiary(db, 'abc', { image_x: 100, image_y: 200 })

    expect(db.boundValues).toContain(100)
    expect(db.boundValues).toContain(200)
  })

  test('image_x と image_y を null にリセットできる', async () => {
    const diary = { id: 'abc', image_x: 100, image_y: 200 }
    const db = createMockDB({ first: diary })

    await updateDiary(db, 'abc', { image_x: null, image_y: null })

    expect(db.prepare).toHaveBeenCalledTimes(3)
  })
})

describe('countSnapshotsWithImageKey', () => {
  test('image_key を参照する snapshot 件数を返す', async () => {
    const db = createMockDB({ first: { count: 2 } })

    const result = await countSnapshotsWithImageKey(db, 'diaries/abc/old.jpg')

    expect(result).toBe(2)
    expect(db.boundValues).toContain('diaries/abc/old.jpg')
  })

  test('参照が無ければ 0 を返す', async () => {
    const db = createMockDB({ first: { count: 0 } })

    const result = await countSnapshotsWithImageKey(db, 'diaries/abc/x.jpg')

    expect(result).toBe(0)
  })

  test('結果が無い場合も 0 を返す', async () => {
    const db = createMockDB({ first: null })

    const result = await countSnapshotsWithImageKey(db, 'diaries/abc/x.jpg')

    expect(result).toBe(0)
  })
})

describe('deleteDiary', () => {
  test('削除成功でtrueを返す', async () => {
    const db = createMockDB({
      run: { results: [], meta: { changes: 1 } },
    })

    const result = await deleteDiary(db, 'abc')

    expect(result).toBe(true)
  })

  test('対象がなければfalseを返す', async () => {
    const db = createMockDB({
      run: { results: [], meta: { changes: 0 } },
    })

    const result = await deleteDiary(db, 'not-found')

    expect(result).toBe(false)
  })
})
