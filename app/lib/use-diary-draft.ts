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
}

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
}: Options) {
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishedAt, setPublishedAt] = useState(initialPublishedAt)
  const [savedId, setSavedId] = useState(diaryId ?? '')
  const [error, setError] = useState('')

  const currentDiaryId = diaryId || savedId

  const saveDraft = useCallback(async (): Promise<string | null> => {
    const draft: DiaryDraft = {
      body,
      date,
      backgroundColor,
      imageLayout,
      mood,
      imageX,
      imageY,
      imageScale,
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
        }),
      })

      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error || '保存に失敗しました')
        return null
      }

      const data = (await res.json()) as { id: string }
      setSavedId(data.id)
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
      const data = (await res.json()) as { published_at: string }
      setPublishedAt(data.published_at)
    } catch {
      setError('公開に失敗しました')
    } finally {
      setPublishing(false)
    }
  }, [saveDraft])

  return {
    currentDiaryId,
    error,
    publishedAt,
    publishing,
    saveDraft,
    savedId,
    saving,
    publishDraft,
  }
}
