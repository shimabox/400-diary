import { useCallback, useRef, useState } from 'hono/jsx'
import { MAX_IMAGE_SIZE } from '../lib/constants'
import {
  buildImageUploadForm,
  compressImageForUpload,
} from '../lib/image-compress'
import {
  type ImagePreview,
  type SavedImage,
  toImageSize,
} from '../lib/image-dimensions'
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
  /** 保存済みの画像（キーと、サーバーが保存した寸法）が変わったとき。削除では null */
  onSavedImageChange: (image: SavedImage | null) => void
  /** アップロード中のプレビュー（送る画像と、その寸法）。終わったら null */
  onImagePreviewChange: (preview: ImagePreview | null) => void
}

export default function ImageAttachmentEditor({
  diaryId,
  imageKey,
  onSavedImageChange,
  onImagePreviewChange,
}: Props) {
  const [imageError, setImageError] = useState('')
  const [showImageDeleteConfirm, setShowImageDeleteConfirm] = useState(false)
  // 確認を通った画像の圧縮とアップロードが終わるまで true。その間は選び直しと削除を止める
  const [processing, setProcessing] = useState(false)
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

      setProcessing(true)
      try {
        // 形式と大きさは選んだ時点のファイルで確かめ済み。通ったものだけを圧縮する。
        // 圧縮できないときや圧縮しないほうがよいときは、元のファイルが返る
        // 寸法は送るファイルの表示寸法。測れなければ null で、そのときも送るファイルは変わらない
        const { file: uploadFile, size } = await compressImageForUpload(file)

        // プレビューは実際に送るファイルから作り、寸法もそのファイルのものを添える
        // （前の画像の寸法でプレビューを組まないため）
        const reader = new FileReader()
        reader.onload = () =>
          onImagePreviewChange({ src: reader.result as string, size })
        reader.readAsDataURL(uploadFile)

        const res = await fetch(`/api/diaries/${diaryId}/image`, {
          method: 'POST',
          body: buildImageUploadForm(uploadFile, size),
        })
        if (!res.ok) {
          const data = (await res.json()) as { error?: string }
          setImageError(data.error || 'アップロードに失敗しました')
          onImagePreviewChange(null)
          return
        }
        const data = (await res.json()) as {
          image_key: string
          image_width?: number | null
          image_height?: number | null
        }
        // 寸法はサーバーが保存した値を使う（形式が合わず NULL で保存されたなら寸法なし）
        onSavedImageChange({
          key: data.image_key,
          size: toImageSize(data.image_width, data.image_height),
        })
        onImagePreviewChange(null)
      } catch {
        setImageError('アップロードに失敗しました')
        onImagePreviewChange(null)
      } finally {
        if (imageInputRef.current) imageInputRef.current.value = ''
        setProcessing(false)
      }
    },
    [diaryId, onSavedImageChange, onImagePreviewChange],
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
      onSavedImageChange(null)
      onImagePreviewChange(null)
    } catch {
      setImageError('削除に失敗しました')
    }
  }, [diaryId, onSavedImageChange, onImagePreviewChange])

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
        <label
          // hono/jsx は true を空文字の属性にする（ARIA では false 扱い）ため、文字列で渡す
          aria-busy={processing ? 'true' : undefined}
          style={{
            padding: '0.2rem 0.5rem',
            border: '1px solid var(--border-strong)',
            borderRadius: '4px',
            fontSize: '0.85rem',
            cursor: processing ? 'default' : 'pointer',
            opacity: processing ? 0.6 : 1,
          }}
        >
          {processing ? '処理中…' : imageKey ? '画像を変更' : '画像を追加'}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleImageChange}
            disabled={processing}
            style={{ display: 'none' }}
          />
        </label>
        {imageKey && (
          <button
            type="button"
            onClick={() => setShowImageDeleteConfirm(true)}
            disabled={processing}
            style={{
              padding: '0.2rem 0.5rem',
              background: 'transparent',
              color: 'var(--danger)',
              border: '1px solid var(--danger)',
              borderRadius: '4px',
              fontSize: '0.85rem',
              cursor: processing ? 'default' : 'pointer',
              opacity: processing ? 0.6 : 1,
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
