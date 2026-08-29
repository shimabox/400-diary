import { useCallback, useRef, useState } from 'hono/jsx'
import { MAX_IMAGE_SIZE } from '../lib/constants'
import ConfirmDialog from './confirm-dialog'

const IMAGE_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]

type Props = {
  diaryId: string | null
  imageKey: string | null
  onImageKeyChange: (imageKey: string | null) => void
  onImagePreviewChange: (preview: string | null) => void
}

export default function ImageAttachmentEditor({
  diaryId,
  imageKey,
  onImageKeyChange,
  onImagePreviewChange,
}: Props) {
  const [imageError, setImageError] = useState('')
  const [showImageDeleteConfirm, setShowImageDeleteConfirm] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const handleImageChange = useCallback(
    async (e: Event) => {
      if (!diaryId) {
        setImageError('先に日記を保存してください')
        return
      }

      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      setImageError('')

      if (!IMAGE_ALLOWED_TYPES.includes(file.type)) {
        setImageError('JPEG, PNG, WebP, GIF のみアップロードできます')
        return
      }
      if (file.size > MAX_IMAGE_SIZE) {
        setImageError(
          `画像は${MAX_IMAGE_SIZE / (1024 * 1024)}MB以内にしてください`,
        )
        return
      }

      const reader = new FileReader()
      reader.onload = () => onImagePreviewChange(reader.result as string)
      reader.readAsDataURL(file)

      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch(`/api/diaries/${diaryId}/image`, {
          method: 'POST',
          body: formData,
        })
        if (!res.ok) {
          const data = (await res.json()) as { error?: string }
          setImageError(data.error || 'アップロードに失敗しました')
          onImagePreviewChange(null)
          return
        }
        const data = (await res.json()) as { image_key: string }
        onImageKeyChange(data.image_key)
        onImagePreviewChange(null)
      } catch {
        setImageError('アップロードに失敗しました')
        onImagePreviewChange(null)
      } finally {
        if (imageInputRef.current) imageInputRef.current.value = ''
      }
    },
    [diaryId, onImageKeyChange, onImagePreviewChange],
  )

  const handleImageDelete = useCallback(async () => {
    setShowImageDeleteConfirm(false)
    if (!diaryId) return

    setImageError('')
    try {
      const res = await fetch(`/api/diaries/${diaryId}/image`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        setImageError('削除に失敗しました')
        return
      }
      onImageKeyChange(null)
      onImagePreviewChange(null)
    } catch {
      setImageError('削除に失敗しました')
    }
  }, [diaryId, onImageKeyChange, onImagePreviewChange])

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
        <label
          style={{
            padding: '0.2rem 0.5rem',
            border: '1px solid var(--border-strong)',
            borderRadius: '4px',
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          {imageKey ? '画像を変更' : '画像を追加'}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleImageChange}
            style={{ display: 'none' }}
          />
        </label>
        {imageKey && (
          <button
            type="button"
            onClick={() => setShowImageDeleteConfirm(true)}
            style={{
              padding: '0.2rem 0.5rem',
              background: 'transparent',
              color: 'var(--danger)',
              border: '1px solid var(--danger)',
              borderRadius: '4px',
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            画像を削除
          </button>
        )}
      </div>
      {imageError && (
        <p
          role="alert"
          style={{
            color: 'var(--danger)',
            fontSize: '0.85rem',
            marginTop: '0.5rem',
          }}
        >
          {imageError}
        </p>
      )}
      <ConfirmDialog
        open={showImageDeleteConfirm}
        message="画像を削除しますか？"
        onConfirm={handleImageDelete}
        onCancel={() => setShowImageDeleteConfirm(false)}
      />
    </div>
  )
}
