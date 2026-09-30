import { describe, expect, test } from 'vitest'
import type { DiaryWithPublished } from './db'
import { toCardSpeech, toDiaryCard, toDiaryListPage } from './diary-cards'

function makeRow(
  overrides: Partial<DiaryWithPublished> = {},
): DiaryWithPublished {
  return {
    id: 'diary-1',
    body: '下書き本文',
    image_key: null,
    image_layout: 'left',
    image_x: null,
    image_y: null,
    image_scale: null,
    image_rotation: null,
    background_color: '#FFE4E1',
    mood: 'happy',
    speech_key: null,
    speech_public: 0,
    diary_date: '2026-07-05',
    published_snapshot_id: 'snap-1',
    created_at: '2026-07-05T00:00:00',
    updated_at: '2026-07-05T00:00:00',
    published_at: '2026-07-05T00:00:00',
    snapshot_body: '公開本文',
    snapshot_background_color: '#FFE4E1',
    snapshot_image_key: null,
    snapshot_image_layout: 'left',
    snapshot_image_x: null,
    snapshot_image_y: null,
    snapshot_image_scale: null,
    snapshot_image_rotation: null,
    snapshot_mood: 'happy',
    snapshot_speech_key: null,
    snapshot_speech_public: 0,
    ...overrides,
  }
}

describe('toDiaryCard', () => {
  test('未認証・公開済みなら snapshot 由来の値を返す', () => {
    const row = makeRow()

    const card = toDiaryCard(row, false)

    expect(card).toEqual({
      id: 'diary-1',
      diary_date: '2026-07-05',
      body: '公開本文',
      background_color: '#FFE4E1',
      is_draft: false,
      has_unpublished_changes: false,
      speech: null,
    })
  })

  test('未認証・未公開（published_snapshot_id が無い）なら null を返す（防御的フィルタ）', () => {
    const row = makeRow({ published_snapshot_id: null, snapshot_body: null })

    const card = toDiaryCard(row, false)

    expect(card).toBeNull()
  })

  test('未認証レスポンスに下書き専用の本文が一切現れない', () => {
    const row = makeRow({ body: '絶対に見せてはいけない下書き本文' })

    const card = toDiaryCard(row, false)

    expect(JSON.stringify(card)).not.toContain(
      '絶対に見せてはいけない下書き本文',
    )
  })

  test('認証済み・未公開なら下書き本文を返し is_draft は true', () => {
    const row = makeRow({
      published_snapshot_id: null,
      published_at: null,
      snapshot_body: null,
      snapshot_background_color: null,
      snapshot_image_key: null,
      snapshot_image_layout: null,
      snapshot_image_x: null,
      snapshot_image_y: null,
      snapshot_image_scale: null,
      snapshot_image_rotation: null,
      snapshot_mood: null,
    })

    const card = toDiaryCard(row, true)

    expect(card).toEqual({
      id: 'diary-1',
      diary_date: '2026-07-05',
      body: '下書き本文',
      background_color: '#FFE4E1',
      is_draft: true,
      has_unpublished_changes: false,
      speech: null,
    })
  })

  test('認証済み・公開済みで下書きと snapshot が完全一致なら has_unpublished_changes は false', () => {
    const row = makeRow({ body: '公開本文' }) // body 以外は snapshot と一致させる

    const card = toDiaryCard(row, true)

    expect(card?.is_draft).toBe(false)
    expect(card?.has_unpublished_changes).toBe(false)
    expect(card?.body).toBe('公開本文') // 公開済みは常に snapshot の値を表示
  })

  test('image_scale の 1.0 と null は表示が同じため変更扱いにしない', () => {
    const row = makeRow({
      body: '公開本文',
      image_scale: 1,
      snapshot_image_scale: null,
    })

    const card = toDiaryCard(row, true)

    expect(card?.has_unpublished_changes).toBe(false)
  })

  test('image_rotation の 0 と null は表示が同じため変更扱いにしない', () => {
    const row = makeRow({
      body: '公開本文',
      image_rotation: 0,
      snapshot_image_rotation: null,
    })

    const card = toDiaryCard(row, true)

    expect(card?.has_unpublished_changes).toBe(false)
  })

  test.each([
    ['body', { body: '編集後の本文' }],
    ['background_color', { background_color: '#000000' }],
    ['image_key', { image_key: 'diaries/x/img.jpg' }],
    ['image_layout', { image_layout: 'right' as const }],
    ['image_x', { image_x: 10 }],
    ['image_y', { image_y: 20 }],
    ['image_scale', { image_scale: 1.2 }],
    ['image_rotation', { image_rotation: -10 }],
    ['mood', { mood: 'sad' }],
    ['speech_public', { speech_public: 1 }],
  ])('認証済みで %s が snapshot と異なる場合 has_unpublished_changes は true', (_field, overrides) => {
    const row = makeRow(overrides)

    const card = toDiaryCard(row, true)

    expect(card?.has_unpublished_changes).toBe(true)
  })

  test('公開版の音声が公開されていれば、未認証でも speech は public', () => {
    const row = makeRow({
      snapshot_speech_key: 'speech/diary-1/a.wav',
      snapshot_speech_public: 1,
    })

    expect(toDiaryCard(row, false)?.speech).toBe('public')
  })

  test('未認証レスポンスに非公開の音声の有無が現れない', () => {
    const row = makeRow({ speech_key: 'speech/diary-1/draft.wav' })

    const card = toDiaryCard(row, false)

    expect(card?.speech).toBeNull()
    expect(JSON.stringify(card)).not.toContain('private')
  })
})

describe('toCardSpeech', () => {
  const publicSpeech = {
    speech_key: 'speech/diary-1/a.wav',
    snapshot_speech_key: 'speech/diary-1/a.wav',
    snapshot_speech_public: 1,
  }
  const draftOnly = {
    speech_key: 'speech/diary-1/draft.wav',
    snapshot_speech_key: null,
    snapshot_speech_public: 0,
  }
  const publishedButHidden = {
    speech_key: null,
    snapshot_speech_key: 'speech/diary-1/a.wav',
    snapshot_speech_public: 0,
  }
  const noSpeech = {
    speech_key: null,
    snapshot_speech_key: null,
    snapshot_speech_public: 0,
  }

  test.each([
    ['公開中の音声', publicSpeech, true, 'public'],
    ['公開中の音声', publicSpeech, false, 'public'],
    ['下書きにだけ音声', draftOnly, true, 'private'],
    ['下書きにだけ音声', draftOnly, false, null],
    [
      '公開版に音声があるが speech_public = 0',
      publishedButHidden,
      true,
      'private',
    ],
    ['公開版に音声があるが speech_public = 0', publishedButHidden, false, null],
    ['音声なし', noSpeech, true, null],
    ['音声なし', noSpeech, false, null],
  ] as const)('%s・認証 %s なら %s', (_label, row, isAuthenticated, expected) => {
    expect(toCardSpeech(row, isAuthenticated)).toBe(expected)
  })

  test('下書きの speech_public = 1 だけでは公開扱いにしない（公開版の設定で決める）', () => {
    const row = makeRow({
      speech_key: 'speech/diary-1/a.wav',
      speech_public: 1,
      snapshot_speech_key: 'speech/diary-1/a.wav',
      snapshot_speech_public: 0,
    })

    expect(toCardSpeech(row, true)).toBe('private')
    expect(toCardSpeech(row, false)).toBeNull()
  })

  test('未公開の日記（snapshot 列が null）で下書きに音声があれば private', () => {
    const row = {
      speech_key: 'speech/diary-1/draft.wav',
      snapshot_speech_key: null,
      snapshot_speech_public: null,
    }

    expect(toCardSpeech(row, true)).toBe('private')
  })
})

describe('toDiaryListPage', () => {
  test('取得件数が limit と一致する場合、最終行から next カーソルを生成する', () => {
    const rows = [
      makeRow({ id: 'a', diary_date: '2026-07-05' }),
      makeRow({ id: 'b', diary_date: '2026-07-04' }),
    ]

    const { next } = toDiaryListPage(rows, true, 2)

    expect(next).toEqual({ before_date: '2026-07-04', before_id: 'b' })
  })

  test('取得件数が limit 未満なら next は null（打ち止め）', () => {
    const rows = [makeRow({ id: 'a' })]

    const { next } = toDiaryListPage(rows, true, 31)

    expect(next).toBeNull()
  })

  test('rows が空なら items は空配列で next は null', () => {
    const { items, next } = toDiaryListPage([], false, 31)

    expect(items).toEqual([])
    expect(next).toBeNull()
  })

  test('未認証時、防御的フィルタで除外された行があっても next は生の最終行から生成される', () => {
    const rows = [
      makeRow({ id: 'a', diary_date: '2026-07-05' }),
      makeRow({
        id: 'b',
        diary_date: '2026-07-04',
        published_snapshot_id: null,
        snapshot_body: null,
      }),
    ]

    const { items, next } = toDiaryListPage(rows, false, 2)

    expect(items).toHaveLength(1) // b は防御的フィルタで除外される
    expect(next).toEqual({ before_date: '2026-07-04', before_id: 'b' })
  })
})
