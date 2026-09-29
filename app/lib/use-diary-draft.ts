import { useCallback, useState } from 'hono/jsx'
import { MAX_BODY_LENGTH } from './constants'

export type DiaryDraft = {
  body: string
  date: string
  backgroundColor: string
  imageLayout: 'left' | 'right'
  mood: string | null
  imageX: number | null
  imageY: number | null
  imageScale: number | null
  imageRotation: number | null
}

type Options = {
  diaryId?: string
  publishedAt?: string | null
  body: string
  date: string
  backgroundColor: string
  imageLayout: 'left' | 'right'
  mood: string | null
  imageX: number | null
  imageY: number | null
  imageScale: number | null
  imageRotation: number | null
  /** 「訪問者も声で聞ける」。指定したときだけ保存に含める（音声操作のある編集画面だけが渡す） */
  speechPublic?: boolean
  /** 開いた時点の公開版の音声のキー */
  publishedSpeechKey?: string | null
}

/** 最後に保存した本文と気分。音声は保存済みの値から作るため、未保存の変更の判定に使う */
export type SavedSpeechSource = { body: string; mood: string | null }

export function validateDiaryDraft(draft: DiaryDraft): string | null {
  if (!draft.body.trim()) {
    return '本文を入力してください'
  }
  if (!draft.date) {
    return '日付を入力してください'
  }
  if (draft.body.length > MAX_BODY_LENGTH) {
    return `本文は${MAX_BODY_LENGTH}文字以内で入力してください`
  }
  return null
}

export function useDiaryDraft({
  diaryId,
  publishedAt: initialPublishedAt = null,
  body,
  date,
  backgroundColor,
  imageLayout,
  mood,
  imageX,
  imageY,
  imageScale,
  imageRotation,
  speechPublic,
  publishedSpeechKey: initialPublishedSpeechKey = null,
}: Options) {
  // 既存の日記は、開いた時点の値が保存済みの値
  const [savedSpeechSource, setSavedSpeechSource] =
    useState<SavedSpeechSource | null>(diaryId ? { body, mood } : null)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishedAt, setPublishedAt] = useState(initialPublishedAt)
  const [publishedSpeechKey, setPublishedSpeechKey] = useState(
    initialPublishedSpeechKey,
  )
  const [savedId, setSavedId] = useState(diaryId ?? '')
  const [error, setError] = useState('')
  const [dateConflict, setDateConflict] = useState<{
    date: string
    id: string | null
    message: string
  } | null>(null)

  const currentDiaryId = diaryId || savedId

  const saveDraft = useCallback(async (): Promise<string | null> => {
    setDateConflict(null)
    const draft: DiaryDraft = {
      body,
      date,
      backgroundColor,
      imageLayout,
      mood,
      imageX,
      imageY,
      imageScale,
      imageRotation,
    }
    const validationError = validateDiaryDraft(draft)
    if (validationError) {
      setError(validationError)
      return null
    }

    setSaving(true)
    setError('')

    const url = currentDiaryId
      ? `/api/diaries/${currentDiaryId}`
      : '/api/diaries'
    const method = currentDiaryId ? 'PUT' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: draft.body,
          diary_date: draft.date,
          background_color: draft.backgroundColor,
          image_layout: draft.imageLayout,
          mood: draft.mood,
          image_x: draft.imageX,
          image_y: draft.imageY,
          image_scale: draft.imageScale,
          image_rotation: draft.imageRotation,
          ...(speechPublic === undefined
            ? {}
            : { speech_public: speechPublic }),
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as {
          error?: string
          existing_diary_id?: string | null
        }
        if (res.status === 409) {
          setDateConflict({
            date: draft.date,
            id: data.existing_diary_id ?? null,
            message: data.error || 'この日の日記はすでにあります。',
          })
          return null
        }
        setError(data.error || '保存に失敗しました')
        return null
      }

      const data = (await res.json()) as { id: string }
      setSavedId(data.id)
      setSavedSpeechSource({ body: draft.body, mood: draft.mood })
      return data.id
    } catch {
      setError('保存に失敗しました')
      return null
    } finally {
      setSaving(false)
    }
  }, [
    body,
    date,
    backgroundColor,
    imageLayout,
    mood,
    imageX,
    imageY,
    imageScale,
    imageRotation,
    speechPublic,
    currentDiaryId,
  ])

  const publishDraft = useCallback(async () => {
    setPublishing(true)
    setError('')
    try {
      const savedDiaryId = await saveDraft()
      if (!savedDiaryId) return

      const res = await fetch(`/api/diaries/${savedDiaryId}/publish`, {
        method: 'POST',
      })
      if (!res.ok) {
        setError('公開に失敗しました')
        return
      }
      const data = (await res.json()) as {
        published_at: string
        speech_key?: string | null
      }
      setPublishedAt(data.published_at)
      setPublishedSpeechKey(data.speech_key ?? null)
    } catch {
      setError('公開に失敗しました')
    } finally {
      setPublishing(false)
    }
  }, [saveDraft])

  // 音声の削除は公開版の音声も消すので、手元の公開版のキーも合わせて消す
  const clearPublishedSpeechKey = useCallback(() => {
    setPublishedSpeechKey(null)
  }, [])

  return {
    clearPublishedSpeechKey,
    currentDiaryId,
    error: dateConflict?.date === date ? dateConflict.message : error,
    conflictingDiaryId: dateConflict?.date === date ? dateConflict.id : null,
    publishedAt,
    publishedSpeechKey,
    publishing,
    saveDraft,
    savedId,
    savedSpeechSource,
    saving,
    publishDraft,
  }
}
