import { Barcode, BellRing, FileSpreadsheet } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Logo } from '../components/Logo'
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
      // El correo de confirmación vuelve a esta misma dirección (local o publicada).
      const { data, error } = await client.auth.signUp({
        ...credentials,
        options: { emailRedirectTo: window.location.origin },
      })
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
    <div className="min-h-dvh lg:grid lg:grid-cols-2">
      <BrandPanel />
      <main id="contenido" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
        <Logo className="lg:hidden" />
        <div className="flex flex-col gap-1">
          <PageHeading title={title}>{title}</PageHeading>
          <p className="text-muted">{mode === 'signIn' ? t('auth.signInIntro') : t('auth.signUpIntro')}</p>
        </div>

        {formError && <Alert tone="error">{formError}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}

        <form
          noValidate
          onSubmit={onSubmit}
          className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6"
        >
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
    </div>
  )
}

// Presentación de la app al lado del formulario (solo en pantallas grandes).
function BrandPanel() {
  const { t } = useTranslation()
  const features = [
    { icon: Barcode, text: t('auth.features.labels') },
    { icon: FileSpreadsheet, text: t('auth.features.excel') },
    { icon: BellRing, text: t('auth.features.alerts') },
  ]
  return (
    <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-900 to-brand-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <Logo wordClassName="text-white" />
      <div className="relative flex max-w-md flex-col gap-6">
        <p className="text-4xl leading-tight font-extrabold tracking-tight">{t('auth.tagline')}</p>
        <ul className="flex flex-col gap-3">
          {features.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-lg text-brand-100">
              <span className="grid size-10 place-items-center rounded-xl bg-white/10 text-accent-300">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-brand-200">{t('auth.footer')}</p>
    </aside>
  )
}
