import { ArrowLeftRight, FileSpreadsheet, LayoutDashboard, LogOut, Package, Users } from 'lucide-react'
import { Suspense, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { useCompany } from '../company/context'
import { Logo } from './Logo'

const links = [
  { to: '/', key: 'dashboard', icon: LayoutDashboard, end: true },
  { to: '/productos', key: 'products', icon: Package },
  { to: '/movimientos', key: 'movements', icon: ArrowLeftRight },
  { to: '/importar', key: 'import', icon: FileSpreadsheet },
  { to: '/equipo', key: 'team', icon: Users },
] as const

// Celular: barra superior y menú fijo abajo, al alcance del pulgar.
// Escritorio: barra lateral oscura con el menú completo.
export function Layout() {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  const { current, memberships, select } = useCompany()
  const companySelectId = useId()

  return (
    <div className="min-h-dvh md:flex">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        {t('app.skipToContent')}
      </a>

      <header className="sticky top-0 z-30 flex md:self-start items-center gap-3 border-b border-line bg-white px-4 py-2 print:hidden md:h-dvh md:w-64 md:shrink-0 md:flex-col md:items-stretch md:gap-6 md:border-0 md:bg-brand-950 md:px-4 md:py-6 md:[&_*:focus-visible]:outline-accent-300">
        <Logo className="shrink-0 md:px-2" wordClassName="text-brand-950 md:text-white" />

        {current && (
          <div className="flex min-w-0 flex-col gap-1 md:rounded-xl md:bg-white/5 md:p-3">
            <span className="hidden text-xs font-semibold tracking-wide text-brand-200 uppercase md:block">
              {t('nav.company')}
            </span>
            {memberships.length > 1 ? (
              <>
                <label htmlFor={companySelectId} className="sr-only">
                  {t('company.select')}
                </label>
                <select
                  id={companySelectId}
                  value={current.company.id}
                  onChange={(e) => select(e.target.value)}
                  className="min-h-11 w-full min-w-0 truncate rounded-lg border border-slate-500 bg-white px-2 font-medium md:border-white/40 md:bg-brand-900 md:text-white"
                >
                  {memberships.map((m) => (
                    <option key={m.company.id} value={m.company.id}>
                      {m.company.name}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <span className="truncate font-medium text-muted md:text-white">{current.company.name}</span>
            )}
          </div>
        )}

        <nav
          aria-label={t('nav.label')}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(30_27_75/0.08)] md:static md:flex-1 md:border-0 md:bg-transparent md:pb-0 md:shadow-none"
        >
          <ul className="grid grid-cols-5 gap-1 px-1 py-1.5 md:flex md:flex-col md:p-0">
            {links.map(({ to, key, icon: Icon, ...rest }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={'end' in rest}
                  className={({ isActive }) =>
                    `flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-xs font-semibold md:min-h-11 md:flex-row md:justify-start md:gap-3 md:px-3 md:text-base ${
                      isActive
                        ? 'bg-brand-50 text-brand-700 md:bg-accent-400 md:text-brand-950 md:shadow-sm'
                        : 'text-muted hover:bg-slate-100 md:text-brand-100 md:hover:bg-white/10'
                    }`
                  }
                >
                  <Icon aria-hidden="true" className="size-6 shrink-0 md:size-5" />
                  <span className="md:hidden">{t(`navShort.${key}`)}</span>
                  <span className="hidden md:inline">{t(`nav.${key}`)}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <button
          type="button"
          onClick={() => void signOut()}
          className="ml-auto inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-3 rounded-xl px-2 font-medium text-muted hover:bg-slate-100 md:ml-0 md:justify-start md:px-3 md:text-brand-100 md:hover:bg-white/10"
        >
          <LogOut aria-hidden="true" className="size-5" />
          <span className="sr-only md:not-sr-only">{t('nav.signOut')}</span>
        </button>
      </header>

      <main id="contenido" tabIndex={-1} className="min-w-0 flex-1 px-4 pt-6 pb-28 md:px-8 md:pt-8 md:pb-12 print:p-0">
        <div className="mx-auto max-w-6xl">
          <Suspense fallback={<p role="status">{t('app.loading')}</p>}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  )
}
