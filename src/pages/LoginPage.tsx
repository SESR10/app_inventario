import { sectionImages } from '../assets/secciones'
import { SectionIcon, type IconName } from '../components/SectionIcon'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Logo } from '../components/Logo'
import { PageHeading } from '../components/PageHeading'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { MAX_FAILED_SIGN_INS, passwordError, SIGN_IN_PAUSE_MS } from '../auth/password'
import { LEGAL_VERSION } from '../legal/config'
import { LegalConsentCheck } from '../legal/LegalConsentCheck'
import { LegalLinks } from '../legal/LegalLinks'
import { useSupabase } from '../lib/client-context'

type Mode = 'signIn' | 'signUp' | 'reset'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function LoginPage() {
  const { t } = useTranslation()
  const client = useSupabase()
  const [mode, setMode] = useState<Mode>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string; consent?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Pausa tras varios intentos fallidos seguidos (además del límite por IP de Supabase).
  const failures = useRef(0)
  const [paused, setPaused] = useState(false)
  const pauseTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const consentErrorId = useId()

  useEffect(() => () => clearTimeout(pauseTimer.current), [])

  const title = t(mode === 'signIn' ? 'auth.signInTitle' : mode === 'signUp' ? 'auth.signUpTitle' : 'auth.resetTitle')
  const intro = t(mode === 'signIn' ? 'auth.signInIntro' : mode === 'signUp' ? 'auth.signUpIntro' : 'auth.resetIntro')

  function pause() {
    setPaused(true)
    setFormError(t('auth.errors.tooManyAttempts'))
    clearTimeout(pauseTimer.current)
    pauseTimer.current = setTimeout(() => {
      failures.current = 0
      setPaused(false)
      setFormError(null)
    }, SIGN_IN_PAUSE_MS)
  }

  function validate() {
    const next: typeof errors = {}
    if (!email.trim()) next.email = t('auth.errors.emailRequired')
    else if (!EMAIL_PATTERN.test(email.trim())) next.email = t('auth.errors.emailInvalid')
    if (mode === 'signUp') {
      const weak = passwordError(password)
      if (weak) next.password = t(weak)
      if (!accepted) next.consent = t('auth.errors.consentRequired')
    } else if (mode === 'signIn' && password.length < 8) next.password = t('auth.errors.passwordShort')
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
    if (mode === 'reset') {
      // Siempre el mismo mensaje: no revela si el correo tiene cuenta.
      const { error } = await client.auth.resetPasswordForEmail(credentials.email, {
        redirectTo: window.location.origin,
      })
      if (error && isRateLimit(error)) setFormError(t('auth.errors.tooManyAttempts'))
      else setNotice(t('auth.resetSent'))
    } else if (mode === 'signIn') {
      const { error } = await client.auth.signInWithPassword(credentials)
      if (error && isRateLimit(error)) pause()
      else if (error?.code === 'invalid_credentials') {
        failures.current += 1
        if (failures.current >= MAX_FAILED_SIGN_INS) pause()
        else setFormError(t('auth.errors.invalidCredentials'))
      } else if (error?.code === 'email_not_confirmed') setFormError(t('auth.errors.emailNotConfirmed'))
      else if (error) setFormError(t('auth.errors.generic'))
    } else {
      // El correo de confirmación vuelve a esta misma dirección (local o publicada).
      // legal_version: la base guarda la autorización (Ley 1581) con la fecha del servidor.
      const { data, error } = await client.auth.signUp({
        ...credentials,
        options: { emailRedirectTo: window.location.origin, data: { legal_version: LEGAL_VERSION } },
      })
      if (error && isRateLimit(error)) setFormError(t('auth.errors.tooManyAttempts'))
      else if (error?.code === 'weak_password') setErrors({ password: t('auth.errors.passwordWeak') })
      else if (error) setFormError(t('auth.errors.generic'))
      else if (!data.session) setNotice(t('auth.checkEmail'))
    }
    setBusy(false)
  }

  function switchMode(next: Mode) {
    setMode(next)
    setPassword('')
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
          <p className="text-muted">{intro}</p>
        </div>

        {formError && <Alert tone="error">{formError}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}

        <form
          noValidate
          onSubmit={onSubmit}
          className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6"
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
          {mode !== 'reset' && (
            <TextField
              label={t('auth.password')}
              type="password"
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              required
              maxLength={72}
              hint={mode === 'signUp' ? t('auth.passwordHint') : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
            />
          )}
          {mode === 'signUp' && (
            <div className="flex flex-col gap-1">
              <LegalConsentCheck
                checked={accepted}
                onChange={(value) => {
                  setAccepted(value)
                  if (value) setErrors((prev) => ({ ...prev, consent: undefined }))
                }}
                errorId={errors.consent ? consentErrorId : undefined}
              />
              {errors.consent && (
                <p id={consentErrorId} className="text-sm font-medium text-danger">
                  {errors.consent}
                </p>
              )}
            </div>
          )}
          <Button type="submit" busy={busy} disabled={paused && mode === 'signIn'}>
            {t(mode === 'signIn' ? 'auth.signIn' : mode === 'signUp' ? 'auth.signUp' : 'auth.resetSend')}
          </Button>
          {mode === 'signIn' && (
            <Button variant="ghost" onClick={() => switchMode('reset')}>
              {t('auth.forgot')}
            </Button>
          )}
        </form>

        {mode === 'reset' ? (
          <Button variant="ghost" onClick={() => switchMode('signIn')}>
            {t('auth.backToSignIn')}
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
            {mode === 'signIn' ? t('auth.toSignUp') : t('auth.toSignIn')}
          </Button>
        )}
        <LegalLinks />
      </main>
    </div>
  )
}

function isRateLimit(error: { code?: string; status?: number }) {
  return error.status === 429 || error.code === 'over_request_rate_limit' || error.code === 'over_email_send_rate_limit'
}

// Presentación de la app al lado del formulario (solo en pantallas grandes).
function BrandPanel() {
  const { t } = useTranslation()
  const features: { icon: IconName; text: string }[] = [
    { icon: 'labels', text: t('auth.features.labels') },
    { icon: 'import', text: t('auth.features.excel') },
    { icon: 'low', text: t('auth.features.alerts') },
  ]
  return (
    <aside className="relative hidden overflow-hidden border-r border-line bg-brand-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <img src={sectionImages.bodega} alt="" className="pointer-events-none absolute inset-0 size-full object-cover" />
      <div aria-hidden="true" className="absolute inset-0 bg-linear-to-b from-brand-950/85 via-brand-950/55 to-brand-950/90" />
      <Logo className="relative" />
      <div className="relative flex max-w-md flex-col gap-6">
        <p className="text-4xl leading-tight font-extrabold tracking-tight">{t('auth.tagline')}</p>
        <ul className="flex flex-col gap-3">
          {features.map(({ icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-lg text-ink">
              <SectionIcon name={icon} className="size-12" />
              {text}
            </li>
          ))}
        </ul>
      </div>
      <p className="relative text-sm text-ink/80">{t('auth.footer')}</p>
    </aside>
  )
}
