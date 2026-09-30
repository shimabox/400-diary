import { useEffect, useRef } from 'hono/jsx'

type Props = {
  open: boolean
  message: string
  /** message の下に添える補足（費用や影響範囲など） */
  detail?: string
  /** 実行ボタンの文言。既定は OK */
  confirmLabel?: string
  /** 実行ボタンの色。削除など取り消せない操作は danger（既定） */
  confirmTone?: 'danger' | 'accent'
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  message,
  detail,
  confirmLabel = 'OK',
  confirmTone = 'danger',
  onConfirm,
  onCancel,
}: Props) {
  const confirmColor =
    confirmTone === 'danger' ? 'var(--danger)' : 'var(--accent-bg)'
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) {
      el.showModal()
    } else if (!open && el.open) {
      el.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-message"
      onClose={onCancel}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '1.5rem',
        maxWidth: '320px',
        boxShadow: '0 4px 12px var(--shadow)',
      }}
    >
      <p
        id="confirm-dialog-message"
        style={{ margin: '0 0 1.25rem', fontSize: '0.95rem' }}
      >
        {message}
      </p>
      {detail && (
        <p
          style={{
            margin: '-0.75rem 0 1.25rem',
            fontSize: '0.85rem',
            color: 'var(--fg-muted)',
          }}
        >
          {detail}
        </p>
      )}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.5rem',
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '0.4rem 1rem',
            border: '1px solid var(--border-strong)',
            borderRadius: '4px',
            background: 'transparent',
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={onConfirm}
          style={{
            padding: '0.4rem 1rem',
            border: `1px solid ${confirmColor}`,
            borderRadius: '4px',
            background: confirmColor,
            color: 'var(--on-accent)',
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
