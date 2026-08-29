import { useCallback, useState } from 'hono/jsx'
import ConfirmDialog from './confirm-dialog'

type Props = {
  diaryId: string
}

export default function DeleteDiaryButton({ diaryId }: Props) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')

  const handleDelete = useCallback(async () => {
    setShowConfirm(false)
    setError('')
    try {
      const res = await fetch(`/api/diaries/${diaryId}`, { method: 'DELETE' })
      if (res.ok) {
        window.location.href = '/'
      } else {
        setError('削除に失敗しました')
      }
    } catch {
      setError('削除に失敗しました')
    }
  }, [diaryId])

  return (
    <>
      <button
        type="button"
        onClick={() => setShowConfirm(true)}
        style={{
          padding: '0.3rem 0.8rem',
          background: 'transparent',
          color: 'var(--danger)',
          border: '1px solid var(--danger)',
          borderRadius: '4px',
          fontSize: '0.85rem',
          cursor: 'pointer',
        }}
      >
        この日記を削除
      </button>
      {error && (
        <p
          role="alert"
          style={{
            color: 'var(--danger)',
            fontSize: '0.85rem',
            marginTop: '0.5rem',
          }}
        >
          {error}
        </p>
      )}
      <ConfirmDialog
        open={showConfirm}
        message="この日記を削除しますか？"
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  )
}
