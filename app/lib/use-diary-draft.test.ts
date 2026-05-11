import { afterEach, describe, expect, test, vi } from 'vitest'
import { MAX_BODY_LENGTH } from './constants'
import {
  type DiaryDraft,
  useDiaryDraft,
  validateDiaryDraft,
} from './use-diary-draft'

function makeDraft(overrides: Partial<DiaryDraft> = {}): DiaryDraft {
  return {
    body: '今日は晴れ',
    date: '2026-05-09',
    backgroundColor: '#fff',
    imageLayout: 'left',
    imageX: null,
    imageY: null,
    mood: null,
    ...overrides,
  }
}

function makeOptions(
  overrides: Partial<Parameters<typeof useDiaryDraft>[0]> = {},
): Parameters<typeof useDiaryDraft>[0] {
  return {
    body: '今日は晴れ',
    date: '2026-05-09',
    backgroundColor: '#fff',
    imageLayout: 'left',
    imageX: null,
    imageY: null,
    mood: null,
    ...overrides,
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
    ...init,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('validateDiaryDraft', () => {
  test('有効な下書きはエラーなし', () => {
    expect(validateDiaryDraft(makeDraft())).toBeNull()
  })

  test('本文が空ならエラー', () => {
    expect(validateDiaryDraft(makeDraft({ body: '   ' }))).toBe(
      '本文を入力してください',
    )
  })

  test('日付が空ならエラー', () => {
    expect(validateDiaryDraft(makeDraft({ date: '' }))).toBe(
      '日付を入力してください',
    )
  })

  test('本文が最大文字数を超えたらエラー', () => {
    expect(
      validateDiaryDraft(makeDraft({ body: 'あ'.repeat(MAX_BODY_LENGTH + 1) })),
    ).toBe(`本文は${MAX_BODY_LENGTH}文字以内で入力してください`)
  })
})

describe('useDiaryDraft', () => {
  test('未保存の日記を POST で保存する', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'diary-1' }))
    vi.stubGlobal('fetch', fetchMock)

    const { saveDraft } = useDiaryDraft(
      makeOptions({
        backgroundColor: '#ffdd57',
        imageLayout: 'right',
        imageX: 12,
        imageY: 34,
        mood: 'happy',
      }),
    )

    await expect(saveDraft()).resolves.toBe('diary-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/diaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: '今日は晴れ',
        diary_date: '2026-05-09',
        background_color: '#ffdd57',
        image_layout: 'right',
        mood: 'happy',
        image_x: 12,
        image_y: 34,
      }),
    })
  })

  test('保存済みの日記を PUT で更新する', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'diary-1' }))
    vi.stubGlobal('fetch', fetchMock)

    const { saveDraft } = useDiaryDraft(
      makeOptions({
        diaryId: 'diary-1',
      }),
    )

    await expect(saveDraft()).resolves.toBe('diary-1')
    expect(fetchMock).toHaveBeenCalledWith('/api/diaries/diary-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        body: '今日は晴れ',
        diary_date: '2026-05-09',
        background_color: '#fff',
        image_layout: 'left',
        mood: null,
        image_x: null,
        image_y: null,
      }),
    })
  })

  test('公開時は保存してから保存済み id を公開する', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'diary-1' }))
      .mockResolvedValueOnce(
        jsonResponse({ published_at: '2026-05-09T12:00:00.000Z' }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const { publishDraft } = useDiaryDraft(makeOptions())

    await publishDraft()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/diaries',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/diaries/diary-1/publish',
      { method: 'POST' },
    )
  })

  test('保存できないときは公開 API を呼ばない', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const { publishDraft } = useDiaryDraft(makeOptions({ body: '   ' }))

    await publishDraft()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('保存 API が失敗したら公開 API を呼ばない', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: '保存失敗' }, { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    const { publishDraft } = useDiaryDraft(makeOptions())

    await publishDraft()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/diaries',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
