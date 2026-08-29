import { useEffect, useRef } from 'hono/jsx'

type Props = {
  open: boolean
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  message,
  onConfirm,
  onCancel,
}: Props) {
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
            border: '1px solid var(--danger)',
            borderRadius: '4px',
            background: 'var(--danger)',
            color: 'var(--on-accent)',
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          OK
        </button>
      </div>
    </dialog>
  )
}
