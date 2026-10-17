import { useEffect, useId, useRef } from 'react'
import { Button } from './Button'

interface Props {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// Diálogo modal nativo: atrapa el foco, se cierra con Escape y devuelve el foco al botón que lo abrió.
export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, busy, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const bodyId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // Foco en la opción segura: cancelar.
      cancelRef.current?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-lg p-0 backdrop:bg-slate-900/50"
    >
      <div className="flex flex-col gap-4 p-5">
        <h2 id={titleId} className="text-xl font-bold">
          {title}
        </h2>
        <p id={bodyId}>{body}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  )
}
