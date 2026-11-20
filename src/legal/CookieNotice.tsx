import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { COOKIE_NOTICE_KEY, LEGAL_PATHS, LEGAL_VERSION } from './config'

function seen() {
  try {
    return localStorage.getItem(COOKIE_NOTICE_KEY) === LEGAL_VERSION
  } catch {
    return false
  }
}

// Aviso de cookies. La app solo usa almacenamiento necesario (sesión y preferencias), así que
// es informativo: no hay cookies opcionales que activar. Si algún día se agregan (analítica),
// este aviso debe pedir permiso antes de activarlas.
export function CookieNotice() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(() => !seen())
  if (!visible) return null

  function dismiss() {
    try {
      localStorage.setItem(COOKIE_NOTICE_KEY, LEGAL_VERSION)
    } catch {
      // Sin almacenamiento: el aviso se oculta solo en esta visita.
    }
    setVisible(false)
  }

  return (
    <section
      aria-label={t('legal.cookieNotice.label')}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-6px_20px_rgb(0_0_0/0.45)] print:hidden"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="leading-relaxed">
          {t('legal.cookieNotice.text')}{' '}
          <Link to={LEGAL_PATHS.cookies} className="font-semibold text-ink underline underline-offset-4">
            {t('legal.cookieNotice.more')}
          </Link>
        </p>
        <Button onClick={dismiss} className="shrink-0">
          {t('legal.cookieNotice.ok')}
        </Button>
      </div>
    </section>
  )
}
