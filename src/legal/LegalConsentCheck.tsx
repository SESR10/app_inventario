import { useId } from 'react'
import { Trans } from 'react-i18next'
import { Link } from 'react-router-dom'
import { LEGAL_PATHS } from './config'

// Casilla de autorización (Ley 1581 de 2012): previa, expresa e informada, con enlaces a los
// documentos en otra pestaña para no perder lo escrito en el formulario.
export function LegalConsentCheck({
  checked,
  onChange,
  errorId,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  errorId?: string
}) {
  const id = useId()
  const link = (to: string) => (
    <Link to={to} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-4" />
  )
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required
        aria-invalid={errorId ? true : undefined}
        aria-describedby={errorId}
        className="mt-1 size-5 shrink-0 accent-brand-700"
      />
      <label htmlFor={id} className="leading-relaxed">
        <Trans
          i18nKey="legal.consent.label"
          components={{ terms: link(LEGAL_PATHS.terms), privacy: link(LEGAL_PATHS.privacy), tab: <span className="sr-only" /> }}
        />
      </label>
    </div>
  )
}
