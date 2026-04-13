import { useCallback, useRef, useState } from 'hono/jsx'
import { MAX_IMAGE_SIZE } from '../lib/constants'
import ConfirmDialog from './confirm-dialog'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

type Props = {
  diaryId: string
  initialImageKey: string | null
}

export default function ImageUploader({ diaryId, initialImageKey }: Props) {
  const [imageKey, setImageKey] = useState(initialImageKey)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const imageSrc = preview ?? (imageKey ? `/api/images/${imageKey}` : null)

  const handleFileChange = useCallback(
    async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      setError('')

      if (!ALLOWED_TYPES.includes(file.type)) {
        setError('JPEG, PNG, WebP, GIF のみアップロードできます')
        return
      }
      if (file.size > MAX_IMAGE_SIZE) {
        setError(`画像は${MAX_IMAGE_SIZE / (1024 * 1024)}MB以内にしてください`)
        return
      }

      const reader = new FileReader()
      reader.onload = () => setPreview(reader.result as string)
      reader.readAsDataURL(file)

      setUploading(true)
      try {
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch(`/api/diaries/${diaryId}/image`, {
          method: 'POST',
          body: formData,
        })
        if (!res.ok) {
          const data = (await res.json()) as { error?: string }
          setError(data.error || 'アップロードに失敗しました')
          setPreview(null)
          return
        }
        const data = (await res.json()) as { image_key: string }
        setImageKey(data.image_key)
        setPreview(null)
      } catch {
        setError('アップロードに失敗しました')
        setPreview(null)
      } finally {
        setUploading(false)
        if (inputRef.current) inputRef.current.value = ''
      }
    },
    [diaryId],
  )

  const handleDelete = useCallback(async () => {
    setShowDeleteConfirm(false)
    setError('')
    try {
      const res = await fetch(`/api/diaries/${diaryId}/image`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        setError('削除に失敗しました')
        return
      }
      setImageKey(null)
      setPreview(null)
    } catch {
      setError('削除に失敗しました')
    }
  }, [diaryId])

  return (
    <div style={{ padding: '0 1rem 1rem' }}>
      <p style={{ fontSize: '0.9rem', color: '#555', marginBottom: '0.5rem' }}>
        写真
      </p>

      {error && (
        <p
          role="alert"
          style={{
            color: '#c0392b',
            fontSize: '0.85rem',
            marginBottom: '0.5rem',
          }}
        >
          {error}
        </p>
      )}

      {imageSrc && (
        <div
          style={{
            position: 'relative',
            marginBottom: '0.75rem',
            display: 'inline-block',
          }}
        >
          <img
            src={imageSrc}
            alt="添付画像"
            style={{
              maxWidth: '320px',
              maxHeight: '240px',
              borderRadius: '8px',
              display: 'block',
            }}
          />
          {uploading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(255,255,255,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                fontSize: '0.9rem',
                color: '#333',
              }}
            >
              アップロード中...
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <label
          style={{
            padding: '0.3rem 0.8rem',
            border: '1px solid #999',
            borderRadius: '4px',
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          {imageKey ? '画像を変更' : '画像を追加'}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </label>
        {imageKey && (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            style={{
              padding: '0.3rem 0.8rem',
              background: 'transparent',
              color: '#c0392b',
              border: '1px solid #c0392b',
              borderRadius: '4px',
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            画像を削除
          </button>
        )}
      </div>
      <ConfirmDialog
        open={showDeleteConfirm}
        message="画像を削除しますか？"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}
