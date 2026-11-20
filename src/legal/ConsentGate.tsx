import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Logo } from '../components/Logo'
import { PageHeading } from '../components/PageHeading'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { LEGAL_VERSION } from './config'
import { LegalConsentCheck } from './LegalConsentCheck'

type Status = 'checking' | 'pending' | 'ok'

// Pide aceptar los términos y la política a quien no los ha aceptado en su versión actual
// (cuentas creadas antes de que existieran, o documentos actualizados). Si la consulta falla
// (por ejemplo, la base aún no tiene la función), no bloquea la app.
export function ConsentGate({ client, onSignOut, children }: { client: SupabaseClient; onSignOut: () => void; children: ReactNode }) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<Status>('checking')
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const errorId = useId()

  useEffect(() => {
    let active = true
    void Promise.resolve(client.rpc('legal_pending', { p_version: LEGAL_VERSION })).then(
      ({ data, error: rpcError }) => {
        if (active) setStatus(!rpcError && data === true ? 'pending' : 'ok')
      },
      () => active && setStatus('ok'),
    )
    return () => {
      active = false
    }
  }, [client])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!accepted) {
      setError(t('legal.consent.required'))
      return
    }
    setBusy(true)
    const { error: rpcError } = await client.rpc('accept_legal', { p_version: LEGAL_VERSION })
    setBusy(false)
    if (rpcError) setError(t('auth.errors.generic'))
    else setStatus('ok')
  }

  if (status === 'checking')
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
        <p role="status">{t('app.loading')}</p>
      </main>
    )
  if (status === 'ok') return <>{children}</>

  return (
    <main id="contenido" className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-6 px-4 py-10">
      <Logo />
      <div className="flex flex-col gap-2">
        <PageHeading title={t('legal.consent.title')}>{t('legal.consent.title')}</PageHeading>
        <p className="leading-relaxed text-muted">{t('legal.consent.intro')}</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <LegalConsentCheck
          checked={accepted}
          onChange={(value) => {
            setAccepted(value)
            if (value) setError(null)
          }}
          errorId={error ? errorId : undefined}
        />
        {error && (
          <p id={errorId} className="sr-only">
            {error}
          </p>
        )}
        <Button type="submit" busy={busy}>
          {t('legal.consent.accept')}
        </Button>
      </form>
      <Button variant="ghost" onClick={onSignOut}>
        {t('nav.signOut')}
      </Button>
    </main>
  )
}
