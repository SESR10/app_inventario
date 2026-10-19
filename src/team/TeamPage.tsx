import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/context'
import { useCompany } from '../company/context'
import { PageHeading } from '../components/PageHeading'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { SelectField } from '../components/ui/SelectField'
import { TextField } from '../components/ui/TextField'
import { useSupabase } from '../lib/client-context'
import type { AppRole, Invitation, TeamMember } from '../lib/types'
import { errorHint } from '../movements/api'

const ROLES: AppRole[] = ['admin', 'editor', 'viewer']
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function TeamPage() {
  const { t } = useTranslation()
  const client = useSupabase()
  const { session } = useAuth()
  const { current, reload } = useCompany()
  const companyId = current!.company.id
  const isAdmin = current?.role === 'admin'
  const myId = session?.user.id

  const [members, setMembers] = useState<TeamMember[] | null>(null)
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loadError, setLoadError] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AppRole>('editor')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<TeamMember | null>(null)

  const fetchTeam = useCallback(
    () =>
      Promise.all([
        client.rpc('company_people', { p_company: companyId }),
        isAdmin
          ? client.from('company_invitations').select('email, role, created_at').eq('company_id', companyId).order('created_at')
          : Promise.resolve({ data: [], error: null }),
      ]),
    [client, companyId, isAdmin],
  )

  const apply = useCallback(([people, invites]: Awaited<ReturnType<typeof fetchTeam>>) => {
    if (people.error || invites.error) return setLoadError(true)
    setLoadError(false)
    setMembers((people.data ?? []) as TeamMember[])
    setInvitations((invites.data ?? []) as Invitation[])
  }, [])

  useEffect(() => {
    void fetchTeam().then(apply)
  }, [fetchTeam, apply])

  const refresh = async () => apply(await fetchTeam())

  const errorText = (err: unknown) => {
    const hint = errorHint(err)
    if (hint === 'last_admin') return t('team.errors.lastAdmin')
    if (hint === 'already_member') return t('team.errors.alreadyMember')
    if (hint === 'invalid_email') return t('team.errors.emailInvalid')
    return t('team.errors.generic')
  }

  async function onInvite(event: FormEvent) {
    event.preventDefault()
    setNotice(null)
    const value = email.trim().toLowerCase()
    if (!EMAIL.test(value)) {
      setEmailError(t('team.errors.emailInvalid'))
      document.querySelector<HTMLElement>('[name="email"]')?.focus()
      return
    }
    setEmailError(null)
    setBusy(true)
    const { data, error } = await client.rpc('invite_member', { p_company: companyId, p_email: value, p_role: role })
    setBusy(false)
    if (error) {
      setEmailError(errorText(error))
      document.querySelector<HTMLElement>('[name="email"]')?.focus()
      return
    }
    setEmail('')
    setNotice({ tone: 'success', text: t(data === 'added' ? 'team.added' : 'team.invited', { email: value }) })
    await refresh()
  }

  async function changeRole(member: TeamMember, next: AppRole) {
    setNotice(null)
    const { error } = await client
      .from('company_members')
      .update({ role: next })
      .eq('company_id', companyId)
      .eq('user_id', member.user_id)
    if (error) setNotice({ tone: 'error', text: errorText(error) })
    else setNotice({ tone: 'success', text: t('team.roleChanged', { email: member.email, role: t(`roles.${next}`) }) })
    await refresh()
    // Si cambié mi propio rol, los permisos de la app cambian.
    if (!error && member.user_id === myId) await reload()
  }

  async function confirmRemove() {
    if (!removing) return
    setBusy(true)
    const { error } = await client
      .from('company_members')
      .delete()
      .eq('company_id', companyId)
      .eq('user_id', removing.user_id)
    setBusy(false)
    setNotice(error ? { tone: 'error', text: errorText(error) } : { tone: 'success', text: t('team.removed', { email: removing.email }) })
    const self = removing.user_id === myId
    setRemoving(null)
    if (!error && self) return reload()
    await refresh()
  }

  async function cancelInvite(invitation: Invitation) {
    setNotice(null)
    const { error } = await client
      .from('company_invitations')
      .delete()
      .eq('company_id', companyId)
      .eq('email', invitation.email)
    setNotice(error ? { tone: 'error', text: errorText(error) } : { tone: 'success', text: t('team.inviteCanceled', { email: invitation.email }) })
    await refresh()
  }

  const title = t('team.title')

  return (
    <section className="flex max-w-4xl flex-col gap-6">
      <PageHeading title={title}>{title}</PageHeading>

      <div className="flex flex-col gap-2">
        <p>{t('team.intro')}</p>
        <ul className="list-disc pl-6 text-muted">
          {ROLES.map((r) => (
            <li key={r}>{t(`team.roleHelp.${r}`)}</li>
          ))}
        </ul>
      </div>

      <div aria-live="polite">{notice && <Alert tone={notice.tone}>{notice.text}</Alert>}</div>
      {loadError && <Alert tone="error">{t('team.loadError')}</Alert>}

      {isAdmin ? (
        <form noValidate onSubmit={onInvite} className="flex flex-col gap-3 rounded-lg border border-line bg-white p-4">
          <h2 className="text-xl font-semibold">{t('team.inviteTitle')}</h2>
          <div className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-start">
            <TextField
              name="email"
              type="email"
              autoComplete="off"
              label={t('team.email')}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={emailError}
            />
            <SelectField label={t('team.role')} value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </SelectField>
            <Button type="submit" busy={busy} className="sm:mt-7">
              {t('team.invite')}
            </Button>
          </div>
        </form>
      ) : (
        <Alert>{t('team.adminOnly')}</Alert>
      )}

      <section aria-labelledby="miembros-titulo" className="flex flex-col gap-3">
        <h2 id="miembros-titulo" className="text-xl font-semibold">
          {t('team.members')}
        </h2>
        {members === null && !loadError && <p role="status">{t('app.loading')}</p>}
        {members && (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {members.map((m) => (
              <li key={m.user_id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 break-words font-medium">
                  {m.email} {m.user_id === myId && <span className="font-normal text-muted">{t('team.you')}</span>}
                </span>
                {isAdmin ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <SelectField
                      label={t('team.roleFor', { email: m.email })}
                      value={m.role}
                      onChange={(e) => void changeRole(m, e.target.value as AppRole)}
                      className="w-48 [&_label]:sr-only"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`roles.${r}`)}
                        </option>
                      ))}
                    </SelectField>
                    <Button variant="ghost" aria-label={t('team.removeFor', { email: m.email })} onClick={() => setRemoving(m)}>
                      {t('team.remove')}
                    </Button>
                  </div>
                ) : (
                  <span className="text-muted">{t(`roles.${m.role}`)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isAdmin && invitations.length > 0 && (
        <section aria-labelledby="pendientes-titulo" className="flex flex-col gap-3">
          <h2 id="pendientes-titulo" className="text-xl font-semibold">
            {t('team.pending')}
          </h2>
          <p className="text-muted">{t('team.pendingHelp')}</p>
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {invitations.map((inv) => (
              <li key={inv.email} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 break-words">
                  {inv.email} · <span className="text-muted">{t(`roles.${inv.role}`)}</span>
                </span>
                <Button
                  variant="ghost"
                  aria-label={t('team.cancelInviteFor', { email: inv.email })}
                  onClick={() => void cancelInvite(inv)}
                >
                  {t('team.cancelInvite')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={t('team.confirmRemoveTitle', { email: removing?.email })}
        body={t('team.confirmRemoveBody')}
        confirmLabel={t('team.confirmRemove')}
        cancelLabel={t('team.cancel')}
        busy={busy}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoving(null)}
      />
    </section>
  )
}
