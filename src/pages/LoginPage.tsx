import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeading } from '../components/PageHeading'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { useSupabase } from '../lib/client-context'

type Mode = 'signIn' | 'signUp'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginPage() {
  const { t } = useTranslation()
  const client = useSupabase()
  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const title = mode === 'signIn' ? t('auth.signInTitle') : t('auth.signUpTitle')

  function validate() {
    const next: typeof errors = {}
    if (!email.trim()) next.email = t('auth.errors.emailRequired')
    else if (!EMAIL_PATTERN.test(email.trim())) next.email = t('auth.errors.emailInvalid')
    if (password.length < 8) next.password = t('auth.errors.passwordShort')
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    setNotice(null)
    if (!validate()) return

    setBusy(true)
    const credentials = { email: email.trim(), password }
    if (mode === 'signIn') {
      const { error } = await client.auth.signInWithPassword(credentials)
      if (error) {
        setFormError(
          error.code === 'invalid_credentials' ? t('auth.errors.invalidCredentials') : t('auth.errors.generic'),
        )
      }
    } else {
      const { data, error } = await client.auth.signUp(credentials)
      if (error) setFormError(t('auth.errors.generic'))
      else if (!data.session) setNotice(t('auth.checkEmail'))
    }
    setBusy(false)
  }

  function switchMode() {
    setMode(mode === 'signIn' ? 'signUp' : 'signIn')
    setErrors({})
    setFormError(null)
    setNotice(null)
  }

  return (
    <main id="contenido" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <p className="text-lg font-bold">{t('app.name')}</p>
      <PageHeading title={title}>{title}</PageHeading>

      {formError && <Alert tone="error">{formError}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4 rounded-lg border border-line bg-white p-5">
        <TextField
          label={t('auth.email')}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <TextField
          label={t('auth.password')}
          type="password"
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          required
          hint={mode === 'signUp' ? t('auth.passwordHint') : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <Button type="submit" busy={busy}>
          {mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')}
        </Button>
      </form>

      <Button variant="ghost" onClick={switchMode}>
        {mode === 'signIn' ? t('auth.toSignUp') : t('auth.toSignIn')}
      </Button>
    </main>
  )
}
