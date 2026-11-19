import { MessageCircle, Phone, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

// Botón flotante del asistente de WhatsApp. Por ahora solo muestra un aviso de "Próximamente":
// todavía no está conectado a WhatsApp.
export function WhatsAppButton() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const titleId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const close = () => {
    setOpen(false)
    buttonRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="fixed right-4 bottom-24 z-40 flex flex-col items-end gap-3 md:right-6 md:bottom-6 print:hidden">
      {open && (
        <section
          id={panelId}
          role="dialog"
          aria-labelledby={titleId}
          className="w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-4 shadow-xl shadow-black/50"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id={titleId} className="font-semibold text-ink">
                {t('whatsapp.title')}
              </h2>
              <p className="mt-1 w-fit rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-medium text-ink">
                {t('whatsapp.soon')}
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-ink hover:bg-slate-100"
            >
              <X aria-hidden="true" className="size-5" />
              <span className="sr-only">{t('whatsapp.close')}</span>
            </button>
          </div>
          <p className="mt-3 text-sm text-ink">{t('whatsapp.body')}</p>
        </section>
      )}
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        className="relative inline-flex size-14 items-center justify-center rounded-full bg-[#128c7e] text-white shadow-lg shadow-black/50 transition-transform duration-200 hover:bg-[#0f7a6e] motion-safe:hover:-translate-y-0.5"
      >
        <MessageCircle aria-hidden="true" className="size-8" strokeWidth={2} />
        <Phone aria-hidden="true" className="absolute size-3.5" fill="currentColor" strokeWidth={0} />
        <span className="sr-only">{t('whatsapp.open')}</span>
      </button>
    </div>
  )
}
