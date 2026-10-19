import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/context'
import { useCompany } from '../company/context'
import { Logo } from '../components/Logo'
import { PageHeading } from '../components/PageHeading'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { useSupabase } from '../lib/client-context'

export function CreateCompanyPage() {
  const { t } = useTranslation()
  const client = useSupabase()
  const { signOut } = useAuth()
  const { reload, select } = useCompany()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    if (!name.trim()) {
      setError(t('company.nameRequired'))
      return
    }
    setError(null)
    setBusy(true)
    const { data, error: rpcError } = await client.rpc('create_company', { company_name: name.trim() })
    if (rpcError) {
      setFormError(t('auth.errors.generic'))
      setBusy(false)
      return
    }
    select(data as string)
    await reload()
  }

  return (
    <main id="contenido" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Logo />
      <PageHeading title={t('company.createTitle')}>{t('company.createTitle')}</PageHeading>
      <p className="text-muted">{t('company.createIntro')}</p>

      {formError && <Alert tone="error">{formError}</Alert>}

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border border-line bg-white shadow-sm p-5">
        <TextField
          label={t('company.name')}
          required
          autoComplete="organization"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
        />
        <Button type="submit" busy={busy}>
          {t('company.create')}
        </Button>
      </form>

      <Button variant="ghost" onClick={() => void signOut()}>
        {t('nav.signOut')}
      </Button>
    </main>
  )
}
