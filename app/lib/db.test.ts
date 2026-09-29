import { describe, expect, test, vi } from 'vitest'
import {
  clearDiarySpeechKeys,
  countSnapshotsWithImageKey,
  createDiary,
  DiaryDateConflictError,
  deleteDiary,
  getDiary,
  getDiaryDateRange,
  getDiaryIdByDate,
  listAllDiaries,
  listDiariesPage,
  listPublishedFeedItems,
  listSpeechKeysInUse,
  publishDiary,
  setDiarySpeechKey,
  updateDiary,
} from './db'
import { expectedSpeechKey } from './speech'
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

  test('image_scale を指定できる', async () => {
    const db = createMockDB({ first: { id: 'test-id-1234' } })

    await createDiary(db, {
      body: '本文',
      diary_date: '2026-04-12',
      background_color: '#FFE4E1',
      image_scale: 1.2,
    })

    expect(db.boundValues).toContain(1.2)
  })

  test('image_rotation を指定できる', async () => {
    const db = createMockDB({ first: { id: 'test-id-1234' } })

    await createDiary(db, {
      body: '本文',
      diary_date: '2026-04-12',
      background_color: '#FFE4E1',
      image_rotation: -8,
    })

    expect(db.boundValues).toContain(-8)
  })

  test('image_x と image_y のデフォルトは null', async () => {
    const db = createMockDB({ first: { id: 'test-id-1234' } })

    await createDiary(db, {
      body: '本文',
      diary_date: '2026-04-12',
      background_color: '#FFE4E1',
    })

    // bind の引数: id, body, bg_color, image_layout, mood, diary_date, image_x, image_y, image_scale, image_rotation
    const nullCount = db.boundValues.filter((v) => v === null).length
    expect(nullCount).toBeGreaterThanOrEqual(2) // mood, image_x, image_y, image_scale, image_rotation = null
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

  test('image_scale を更新・リセットできる', async () => {
    const diary = { id: 'abc', image_scale: null }
    const db = createMockDB({ first: diary })

    await updateDiary(db, 'abc', { image_scale: 0.8 })

    expect(db.boundValues).toContain(0.8)

    const db2 = createMockDB({ first: { id: 'abc', image_scale: 0.8 } })
    await updateDiary(db2, 'abc', { image_scale: null })
    expect(db2.prepare).toHaveBeenCalledTimes(3)
  })

  test('image_rotation を更新・リセットできる', async () => {
    const diary = { id: 'abc', image_rotation: null }
    const db = createMockDB({ first: diary })

    await updateDiary(db, 'abc', { image_rotation: 12 })

    expect(db.boundValues).toContain(12)

    const db2 = createMockDB({ first: { id: 'abc', image_rotation: 12 } })
    await updateDiary(db2, 'abc', { image_rotation: null })
    expect(db2.prepare).toHaveBeenCalledTimes(3)
  })

  test('speech_public を 1 / 0 で保存する', async () => {
    const db = createMockDB({ first: { id: 'abc', speech_public: 0 } })

    await updateDiary(db, 'abc', { speech_public: true })

    const sql = vi.mocked(db.prepare).mock.calls[1][0] as string
    expect(sql).toContain('speech_public = ?')
    expect(db.boundValues).toContain(1)

    const db2 = createMockDB({ first: { id: 'abc', speech_public: 1 } })
    await updateDiary(db2, 'abc', { speech_public: false })
    expect(db2.boundValues).toContain(0)
  })

  test('speech_public を指定しなければ UPDATE に含めず、speech_key も書き換えない', async () => {
    const db = createMockDB({ first: { id: 'abc' } })

    await updateDiary(db, 'abc', { body: '本文' })

    const sql = vi.mocked(db.prepare).mock.calls[1][0] as string
    expect(sql).not.toContain('speech_public')
    expect(sql).not.toContain('speech_key')
  })
})

describe('publishDiary の読み上げ音声の引き継ぎ', () => {
  const baseDiary = {
    id: 'abc',
    body: '本文',
    image_key: null,
    image_layout: 'left' as const,
    image_x: null,
    image_y: null,
    image_scale: null,
    image_rotation: null,
    background_color: '#FFE4E1',
    mood: 'happy',
    speech_public: 1,
  }

  /** スナップショットの INSERT に bind した値（末尾 2 つが speech_key, speech_public） */
  function insertValues(db: ReturnType<typeof createMockDB>) {
    const sqls = vi.mocked(db.prepare).mock.calls.map(([sql]) => sql as string)
    expect(
      sqls.some((sql) => sql.includes('INSERT INTO diary_snapshots')),
    ).toBe(true)
    const stmt = db.prepare('')
    return vi.mocked(stmt.bind).mock.calls.find((args) => args.length === 13)!
  }

  test('音声が保存済みの本文・気分に合えば、speech_key と speech_public を写す', async () => {
    const key = await expectedSpeechKey(baseDiary, 'voice_a')
    const db = createMockDB({ first: { ...baseDiary, speech_key: key } })

    await publishDiary(db, 'abc', { voiceId: 'voice_a' })

    const values = insertValues(db)
    expect(values.at(-2)).toBe(key)
    expect(values.at(-1)).toBe(1)
  })

  test('初めての公開で音声が古ければ speech_key は NULL にする', async () => {
    const staleKey = await expectedSpeechKey(
      { ...baseDiary, mood: 'sad' },
      'voice_a',
    )
    const db = createMockDB({
      first: {
        ...baseDiary,
        speech_key: staleKey,
        published_snapshot_id: null,
      },
    })

    await publishDiary(db, 'abc', { voiceId: 'voice_a' })

    const values = insertValues(db)
    expect(values.at(-2)).toBeNull()
    expect(values.at(-1)).toBe(1)
  })

  /**
   * 公開済みの日記を再公開する。first() は 1 回目が下書き、2 回目が直前の公開版を返す
   * （3 回目の公開後のスナップショット取得は既定の null）
   */
  function republishDB(
    draft: Record<string, unknown>,
    previous: { body: string; speech_key: string | null },
  ) {
    const db = createMockDB()
    vi.mocked(db.prepare('').first)
      .mockResolvedValueOnce({
        ...baseDiary,
        published_snapshot_id: 'prev-snap',
        ...draft,
      })
      .mockResolvedValueOnce(previous)
    vi.mocked(db.prepare).mockClear()
    return db
  }

  test('再公開でも音声が今の本文・気分に合えば、直前の公開版を見ずに下書きの音声を写す', async () => {
    const key = await expectedSpeechKey(baseDiary, 'voice_a')
    const db = republishDB(
      { speech_key: key },
      { body: baseDiary.body, speech_key: 'speech/abc/published.wav' },
    )

    await publishDiary(db, 'abc', { voiceId: 'voice_a' })

    expect(insertValues(db).at(-2)).toBe(key)
    expect(db.boundValues).not.toContain('prev-snap')
  })

  test('気分だけ変えて公開すると、本文が同じ直前の公開版の音声を引き継ぐ', async () => {
    const staleKey = await expectedSpeechKey(
      { ...baseDiary, mood: 'sad' },
      'voice_a',
    )
    const db = republishDB(
      { speech_key: staleKey },
      { body: baseDiary.body, speech_key: staleKey },
    )

    await publishDiary(db, 'abc', { voiceId: 'voice_a' })

    const sqls = vi.mocked(db.prepare).mock.calls.map(([sql]) => sql as string)
    expect(sqls).toContain(
      'SELECT body, speech_key FROM diary_snapshots WHERE id = ?',
    )
    expect(db.boundValues).toContain('prev-snap')
    expect(insertValues(db).at(-2)).toBe(staleKey)
  })

  test('本文を変えて公開すると、直前の公開版に音声があっても NULL にする', async () => {
    const staleKey = await expectedSpeechKey(
      { ...baseDiary, body: '前の本文' },
      'voice_a',
    )
    const db = republishDB(
      { speech_key: staleKey },
      { body: '前の本文', speech_key: staleKey },
    )

    await publishDiary(db, 'abc', { voiceId: 'voice_a' })

    expect(insertValues(db).at(-2)).toBeNull()
  })

  test('本文が同じでも直前の公開版に音声が無ければ NULL にする', async () => {
    const staleKey = await expectedSpeechKey(
      { ...baseDiary, mood: 'sad' },
      'voice_a',
    )
    const db = republishDB(
      { speech_key: staleKey },
      { body: baseDiary.body, speech_key: null },
    )

    await publishDiary(db, 'abc', { voiceId: 'voice_a' })

    expect(insertValues(db).at(-2)).toBeNull()
  })

  test('声 ID が未設定なら下書きの音声は写さないが、本文が同じ直前の公開版の音声は引き継ぐ', async () => {
    const key = await expectedSpeechKey(baseDiary, 'voice_a')
    const db = republishDB(
      { speech_key: key },
      { body: baseDiary.body, speech_key: 'speech/abc/published.wav' },
    )

    await publishDiary(db, 'abc')

    expect(insertValues(db).at(-2)).toBe('speech/abc/published.wav')
  })

  test('声 ID が未設定で直前の公開版も無ければ NULL にする', async () => {
    const key = await expectedSpeechKey(baseDiary, 'voice_a')
    const db = createMockDB({ first: { ...baseDiary, speech_key: key } })

    await publishDiary(db, 'abc')

    expect(insertValues(db).at(-2)).toBeNull()
  })

  test('speech_public が 0 ならそのまま 0 を写す', async () => {
    const db = createMockDB({
      first: { ...baseDiary, speech_key: null, speech_public: 0 },
    })

    await publishDiary(db, 'abc', { voiceId: 'voice_a' })

    const values = insertValues(db)
    expect(values.at(-2)).toBeNull()
    expect(values.at(-1)).toBe(0)
  })
})

describe('読み上げ音声のキー', () => {
  test('setDiarySpeechKey は updated_at が生成開始時のままのときだけ speech_key を書き、updated_at は変えない', async () => {
    const db = createMockDB({ run: { results: [], meta: { changes: 1 } } })

    await expect(
      setDiarySpeechKey(db, 'abc', 'speech/abc/new.wav', '2026-09-29 00:00:00'),
    ).resolves.toBe(true)

    const sql = vi.mocked(db.prepare).mock.calls[0][0] as string
    expect(sql).toBe(
      'UPDATE diaries SET speech_key = ? WHERE id = ? AND updated_at = ?',
    )
    expect(db.boundValues).toEqual([
      'speech/abc/new.wav',
      'abc',
      '2026-09-29 00:00:00',
    ])
  })

  test('setDiarySpeechKey は updated_at が変わっていて書けなければ false を返す', async () => {
    const db = createMockDB({ run: { results: [], meta: { changes: 0 } } })

    await expect(
      setDiarySpeechKey(db, 'abc', 'speech/abc/new.wav', '2026-09-29 00:00:00'),
    ).resolves.toBe(false)
  })

  test('clearDiarySpeechKeys は下書きとスナップショットの speech_key を batch で NULL にし、下書きの updated_at をミリ秒まで進める', async () => {
    const db = createMockDB()

    await clearDiarySpeechKeys(db, 'abc')

    expect(db.batch).toHaveBeenCalledTimes(1)
    const sqls = vi.mocked(db.prepare).mock.calls.map(([sql]) => sql as string)
    // 秒単位の datetime('now') では、生成開始と同じ秒の削除を生成が検知できない
    expect(sqls).toContain(
      "UPDATE diaries SET speech_key = NULL, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now') WHERE id = ?",
    )
    expect(sqls).toContain(
      'UPDATE diary_snapshots SET speech_key = NULL WHERE diary_id = ?',
    )
    expect(db.boundValues).toEqual(['abc', 'abc'])
  })

  test('listSpeechKeysInUse は下書きと公開中のキーを返し、NULL は除く', async () => {
    const db = createMockDB({
      first: { draft_key: 'speech/abc/a.wav', published_key: null },
    })

    await expect(listSpeechKeysInUse(db, 'abc')).resolves.toEqual([
      'speech/abc/a.wav',
    ])

    const db2 = createMockDB({
      first: {
        draft_key: 'speech/abc/a.wav',
        published_key: 'speech/abc/b.wav',
      },
    })
    await expect(listSpeechKeysInUse(db2, 'abc')).resolves.toEqual([
      'speech/abc/a.wav',
      'speech/abc/b.wav',
    ])
  })

  test('listSpeechKeysInUse は日記が無ければ空配列', async () => {
    await expect(listSpeechKeysInUse(createMockDB(), 'abc')).resolves.toEqual(
      [],
    )
  })
})

describe('publishDiary', () => {
  test('公開スナップショットに現在の本文と画像をコピーする', async () => {
    const diary = {
      id: 'abc',
      body: '本文',
      image_key: 'diaries/abc/image.jpg',
      image_layout: 'left' as const,
      image_x: null,
      image_y: null,
      image_scale: 1.2,
      image_rotation: -8,
      background_color: '#FFE4E1',
      mood: null,
    }
    const db = createMockDB({ first: diary })

    await publishDiary(db, 'abc')

    expect(db.boundValues).toContain('本文')
    expect(db.boundValues).toContain('diaries/abc/image.jpg')
    expect(db.boundValues).toContain(1.2)
    expect(db.boundValues).toContain(-8)
  })

  test('snapshot の INSERT と published_snapshot_id の UPDATE を batch で原子的に実行する', async () => {
    const diary = {
      id: 'abc',
      body: '本文',
      image_key: null,
      image_layout: 'left' as const,
      image_x: null,
      image_y: null,
      background_color: '#FFE4E1',
      mood: null,
    }
    const db = createMockDB({ first: diary })

    await publishDiary(db, 'abc')

    // 部分失敗で孤児 snapshot が残らないよう、INSERT と UPDATE をまとめて1回の batch で実行する
    expect(db.batch).toHaveBeenCalledTimes(1)
    const batchedStatements = vi.mocked(db.batch).mock.calls[0][0]
    expect(batchedStatements).toHaveLength(2)
    expect(db.boundValues).toContain('test-id-1234') // snapshotId
    expect(db.boundValues).toContain('abc') // diary id
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

describe('listPublishedFeedItems', () => {
  test('公開中スナップショットを指定件数で取得する', async () => {
    const items = [
      {
        id: 'diary-1',
        diary_date: '2026-04-13',
        body: '公開本文',
        published_at: '2026-04-13 12:34:56',
      },
    ]
    const db = createMockDB({ all: { results: items, meta: { changes: 0 } } })

    const result = await listPublishedFeedItems(db, 10)

    expect(result).toEqual(items)
    expect(db.boundValues).toContain(10)
  })
})

describe('listDiariesPage', () => {
  test('before 未指定なら WHERE に before 条件を含めず limit だけ bind する', async () => {
    const rows = [{ id: 'a', diary_date: '2026-07-05' }]
    const db = createMockDB({ all: { results: rows, meta: { changes: 0 } } })

    const result = await listDiariesPage(db, {
      limit: 31,
      publishedOnly: false,
    })

    expect(result).toEqual(rows)
    const sql = vi.mocked(db.prepare).mock.calls[0][0] as string
    expect(sql).not.toContain('before')
    expect(sql).not.toContain('published_snapshot_id IS NOT NULL')
    expect(sql).toContain('ORDER BY d.diary_date DESC')
    expect(sql).not.toContain('d.id DESC')
    expect(db.boundValues).toEqual([31])
  })

  test('before 指定時は日付のみを境界にし、互換用の id は検索条件に使わない', async () => {
    const db = createMockDB()

    await listDiariesPage(db, {
      limit: 10,
      before: { diaryDate: '2026-07-01', id: 'cursor-id' },
      publishedOnly: false,
    })

    const sql = vi.mocked(db.prepare).mock.calls[0][0] as string
    expect(sql).toContain('WHERE d.diary_date < ?')
    expect(sql).not.toContain(' OR ')
    expect(sql).not.toContain('d.id <')
    expect(db.boundValues).toEqual(['2026-07-01', 10])
  })

  test('publishedOnly 指定時は published_snapshot_id IS NOT NULL を条件に含める', async () => {
    const db = createMockDB()

    await listDiariesPage(db, { limit: 31, publishedOnly: true })

    const sql = vi.mocked(db.prepare).mock.calls[0][0] as string
    expect(sql).toContain('d.published_snapshot_id IS NOT NULL')
  })

  test('publishedOnly と before を同時に指定すると AND で結合される', async () => {
    const db = createMockDB()

    await listDiariesPage(db, {
      limit: 5,
      before: { diaryDate: '2026-07-01', id: 'cursor-id' },
      publishedOnly: true,
    })

    const sql = vi.mocked(db.prepare).mock.calls[0][0] as string
    expect(sql).toContain(
      'WHERE d.published_snapshot_id IS NOT NULL AND d.diary_date < ?',
    )
    expect(db.boundValues).toEqual(['2026-07-01', 5])
  })
})

describe('getDiaryDateRange', () => {
  test('publishedOnly=false なら WHERE 無しで MIN/MAX を取得する', async () => {
    const db = createMockDB({ first: { min: '2026-01-01', max: '2026-07-05' } })

    const result = await getDiaryDateRange(db, false)

    expect(result).toEqual({ min: '2026-01-01', max: '2026-07-05' })
    const sql = vi.mocked(db.prepare).mock.calls[0][0] as string
    expect(sql).not.toContain('WHERE')
  })

  test('publishedOnly=true なら published_snapshot_id IS NOT NULL を条件に含める', async () => {
    const db = createMockDB({ first: { min: '2026-02-01', max: '2026-06-01' } })

    const result = await getDiaryDateRange(db, true)

    expect(result).toEqual({ min: '2026-02-01', max: '2026-06-01' })
    const sql = vi.mocked(db.prepare).mock.calls[0][0] as string
    expect(sql).toContain('WHERE published_snapshot_id IS NOT NULL')
  })

  test('日記が1件も無ければ null を返す', async () => {
    const db = createMockDB({ first: { min: null, max: null } })

    const result = await getDiaryDateRange(db, false)

    expect(result).toBeNull()
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

describe('listAllDiaries', () => {
  test('diary_date ASC, id ASC で LIMIT なしの一発クエリを発行する', async () => {
    const rows = [
      { id: 'a', diary_date: '2026-07-01' },
      { id: 'b', diary_date: '2026-07-02' },
    ]
    const db = createMockDB({ all: { results: rows, meta: { changes: 0 } } })

    const result = await listAllDiaries(db)

    expect(result).toEqual(rows)
    const sql = vi.mocked(db.prepare).mock.calls[0][0] as string
    expect(sql).toContain('ORDER BY diary_date ASC, id ASC')
    expect(sql).not.toContain('LIMIT')
    expect(sql).not.toContain('JOIN')
  })
})

describe('日付の重複', () => {
  const uniqueError = new Error(
    'D1_ERROR: UNIQUE constraint failed: diaries.diary_date: SQLITE_CONSTRAINT',
  )

  test('日付から下書きも含めて既存の日記を取得する', async () => {
    const db = createMockDB({ first: { id: 'existing' } })
    await expect(getDiaryIdByDate(db, '2026-09-08')).resolves.toBe('existing')
    expect(db.boundValues).toEqual(['2026-09-08'])
    await expect(
      getDiaryIdByDate(createMockDB(), '2026-09-08'),
    ).resolves.toBeNull()
  })

  test('新規作成のDB制約違反を既存ID付きの重複エラーに変換する', async () => {
    const db = createMockDB({ first: { id: 'existing' } })
    vi.mocked(db.prepare('').run).mockRejectedValueOnce(uniqueError)
    await expect(
      createDiary(db, {
        body: '新しい本文',
        diary_date: '2026-09-08',
        background_color: '#FFFFFF',
      }),
    ).rejects.toMatchObject({
      name: 'DiaryDateConflictError',
      existingDiaryId: 'existing',
    })
  })

  test('日付変更の制約違反でも変更先の日記IDを返す', async () => {
    const db = createMockDB()
    const stmt = db.prepare('')
    vi.mocked(stmt.first)
      .mockResolvedValueOnce({ id: 'editing', diary_date: '2026-09-07' })
      .mockResolvedValueOnce({ id: 'existing' })
    vi.mocked(stmt.run).mockRejectedValueOnce(uniqueError)
    await expect(
      updateDiary(db, 'editing', {
        body: '編集中の本文',
        diary_date: '2026-09-08',
      }),
    ).rejects.toMatchObject({ existingDiaryId: 'existing' })
    expect(db.boundValues.at(-1)).toBe('2026-09-08')
  })

  test.each([
    'create',
    'update',
  ])('既存IDの取得に失敗しても重複エラーを保つ: %s', async (operation) => {
    const db = createMockDB()
    const stmt = db.prepare('')
    if (operation === 'update') {
      vi.mocked(stmt.first).mockResolvedValueOnce({ id: 'editing' })
    }
    vi.mocked(stmt.first).mockRejectedValueOnce(new Error('D1 lookup failed'))
    vi.mocked(stmt.run).mockRejectedValueOnce(uniqueError)
    const params = {
      body: '本文',
      diary_date: '2026-09-08',
      background_color: '#FFFFFF',
    }
    const write =
      operation === 'create'
        ? createDiary(db, params)
        : updateDiary(db, 'editing', params)
    await expect(write).rejects.toBeInstanceOf(DiaryDateConflictError)
    await expect(write).rejects.toMatchObject({ existingDiaryId: null })
  })

  test('競合した日記が直後に削除されても重複エラーを返す', async () => {
    const db = createMockDB()
    vi.mocked(db.prepare('').run).mockRejectedValueOnce(uniqueError)
    await expect(
      createDiary(db, {
        body: '本文',
        diary_date: '2026-09-08',
        background_color: '#FFFFFF',
      }),
    ).rejects.toEqual(new DiaryDateConflictError(null))
  })

  test.each([
    'D1_ERROR: database unavailable',
    'D1_ERROR: UNIQUE constraint failed: diaries.id: SQLITE_CONSTRAINT',
  ])('日付以外のDBエラーを重複扱いしない: %s', async (message) => {
    const db = createMockDB()
    const error = new Error(message)
    vi.mocked(db.prepare('').run).mockRejectedValueOnce(error)
    await expect(
      createDiary(db, {
        body: '本文',
        diary_date: '2026-09-08',
        background_color: '#FFFFFF',
      }),
    ).rejects.toBe(error)
  })
})
