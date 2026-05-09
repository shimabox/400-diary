import { describe, expect, test } from 'vitest'
import { MAX_BODY_LENGTH } from './constants'
import { type DiaryDraft, validateDiaryDraft } from './use-diary-draft'

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
