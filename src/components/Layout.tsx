import { LogOut } from 'lucide-react'
import { Suspense, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { useCompany } from '../company/context'
import { sectionImages } from '../assets/secciones'
import { Logo } from './Logo'

const links = [
  { to: '/', key: 'dashboard', image: sectionImages.panel, end: true },
  { to: '/productos', key: 'products', image: sectionImages.caja },
  { to: '/movimientos', key: 'movements', image: sectionImages.movimientos },
  { to: '/asistente', key: 'assistant', image: sectionImages.asistente },
  { to: '/importar', key: 'import', image: sectionImages.importar },
  { to: '/equipo', key: 'team', image: sectionImages.equipo },
] as const

// Celular: barra superior y menú fijo abajo, al alcance del pulgar.
// Escritorio: una sola barra arriba con el menú en pestañas con foto (se levantan al pasar el mouse).
export function Layout() {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  const { current, memberships, select } = useCompany()
  const companySelectId = useId()

  return (
    <div className="min-h-dvh">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow"
      >
        {t('app.skipToContent')}
      </a>

      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface px-4 py-2 print:hidden md:gap-4 md:px-6 md:py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Logo className="shrink-0" wordClassName="sr-only xl:not-sr-only text-ink" />
          {current && (
            <div className="flex min-w-0 flex-col md:max-lg:hidden">
              <span className="hidden text-xs font-semibold text-muted xl:block">{t('nav.company')}</span>
              {memberships.length > 1 ? (
                <>
                  <label htmlFor={companySelectId} className="sr-only">
                    {t('company.select')}
                  </label>
                  <select
                    id={companySelectId}
                    value={current.company.id}
                    onChange={(e) => select(e.target.value)}
                    className="min-h-11 w-full max-w-48 min-w-0 truncate rounded-lg border border-slate-500 bg-surface px-2 font-semibold text-brand-700"
                  >
                    {memberships.map((m) => (
                      <option key={m.company.id} value={m.company.id}>
                        {m.company.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <span className="truncate font-semibold text-brand-700">{current.company.name}</span>
              )}
            </div>
          )}
        </div>

        <nav
          aria-label={t('nav.label')}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_rgb(0_0_0/0.35)] md:static md:mx-auto md:rounded-2xl md:border md:bg-slate-50 md:p-1.5 md:pb-1.5 md:shadow-none"
        >
          <ul className="grid grid-cols-6 gap-0.5 px-1 py-1.5 md:flex md:gap-1 md:p-0">
            {links.map(({ to, key, image, ...rest }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={'end' in rest}
                  className={({ isActive }) =>
                    `group flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-semibold transition-all duration-200 ease-out motion-safe:hover:-translate-y-0.5 md:min-h-12 md:flex-row md:gap-2.5 md:py-1.5 md:pr-4 md:pl-1.5 md:text-sm ${
                      isActive
                        ? 'btn-solid shadow-lg shadow-black/40'
                        : 'text-muted hover:bg-slate-100 hover:text-ink hover:shadow-lg hover:shadow-black/40'
                    }`
                  }
                >
                  <img
                    src={image}
                    alt=""
                    width={36}
                    height={36}
                    className="size-7 shrink-0 rounded-lg object-cover ring-1 ring-black/30 transition-transform duration-200 ease-out group-hover:scale-110 group-aria-[current=page]:ring-2 group-aria-[current=page]:ring-white/70 md:size-8 xl:size-9"
                  />
                  <span className="max-w-full truncate text-[11px] tracking-tight md:text-sm md:tracking-normal xl:hidden">{t(`navShort.${key}`)}</span>
                  <span className="hidden xl:inline">{t(`nav.${key}`)}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <button
          type="button"
          onClick={() => void signOut()}
          className="ml-auto inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl px-2 font-medium text-muted transition-colors hover:bg-slate-100 hover:text-ink md:ml-0 md:px-3"
        >
          <LogOut aria-hidden="true" className="size-5" />
          <span className="sr-only lg:not-sr-only">{t('nav.signOut')}</span>
        </button>
      </header>

      <main id="contenido" tabIndex={-1} className="min-w-0 px-4 pt-6 pb-28 md:px-8 md:pt-8 md:pb-12 print:p-0">
        <div className="mx-auto max-w-7xl">
          <Suspense fallback={<p role="status">{t('app.loading')}</p>}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  )
}
