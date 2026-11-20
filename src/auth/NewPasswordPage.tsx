import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Logo } from '../components/Logo'
import { PageHeading } from '../components/PageHeading'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { useSupabase } from '../lib/client-context'
import { passwordError } from './password'

// Se abre con el enlace del correo de "¿Olvidaste tu contraseña?" (la sesión ya viene en el enlace).
export function NewPasswordPage({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const client = useSupabase()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const next: typeof errors = {}
    const weak = passwordError(password)
    if (weak) next.password = t(weak)
    if (confirm !== password) next.confirm = t('auth.errors.passwordMismatch')
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setBusy(true)
    const { error } = await client.auth.updateUser({ password })
    setBusy(false)
    if (!error) setSaved(true)
    else if (error.code === 'same_password') setFormError(t('auth.errors.samePassword'))
    else if (error.code === 'weak_password') setFormError(t('auth.errors.passwordWeak'))
    else setFormError(t('auth.errors.generic'))
  }

  const title = t('auth.newPasswordTitle')
  return (
    <main id="contenido" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Logo />
      <div className="flex flex-col gap-1">
        <PageHeading title={title}>{title}</PageHeading>
        <p className="text-muted">{t('auth.newPasswordIntro')}</p>
      </div>
      {formError && <Alert tone="error">{formError}</Alert>}
      {saved ? (
        <>
          <Alert tone="success">{t('auth.passwordSaved')}</Alert>
          <Button onClick={onDone}>{t('auth.continue')}</Button>
        </>
      ) : (
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <TextField
            label={t('auth.newPassword')}
            type="password"
            autoComplete="new-password"
            required
            hint={t('auth.passwordHint')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          <TextField
            label={t('auth.confirmPassword')}
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirm}
          />
          <Button type="submit" busy={busy}>
            {t('auth.savePassword')}
          </Button>
        </form>
      )}
    </main>
  )
}
