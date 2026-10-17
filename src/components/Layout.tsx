import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/context'
import { useCompany } from '../company/context'
import { Button } from './ui/Button'

const links = [
  { to: '/', key: 'nav.dashboard', end: true },
  { to: '/productos', key: 'nav.products' },
  { to: '/movimientos', key: 'nav.movements' },
  { to: '/importar', key: 'nav.import' },
] as const

export function Layout() {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  const { current, memberships, select } = useCompany()
  const [menuOpen, setMenuOpen] = useState(false)
  const navId = useId()
  const companySelectId = useId()

  return (
    <div className="min-h-dvh">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow"
      >
        {t('app.skipToContent')}
      </a>

      <header className="border-b border-line bg-white print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <span className="text-lg font-bold">{t('app.name')}</span>

          {current && memberships.length > 1 ? (
            <div className="flex items-center gap-2">
              <label htmlFor={companySelectId} className="sr-only">
                {t('company.select')}
              </label>
              <select
                id={companySelectId}
                value={current.company.id}
                onChange={(e) => select(e.target.value)}
                className="min-h-11 rounded-md border border-slate-500 bg-white px-2"
              >
                {memberships.map((m) => (
                  <option key={m.company.id} value={m.company.id}>
                    {m.company.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            current && <span className="text-muted">{current.company.name}</span>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="secondary"
              className="md:hidden"
              aria-expanded={menuOpen}
              aria-controls={navId}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? t('nav.close') : t('nav.open')}
            </Button>
            <Button variant="ghost" onClick={() => void signOut()}>
              {t('nav.signOut')}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col md:flex-row">
        <nav
          id={navId}
          aria-label={t('nav.label')}
          className={`${menuOpen ? 'block' : 'hidden'} print:hidden border-b border-line bg-white md:block md:w-56 md:shrink-0 md:border-r md:border-b-0 md:bg-transparent`}
        >
          <ul className="flex flex-col p-2">
            {links.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={'end' in link}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center rounded-md px-3 ${isActive ? 'bg-brand-50 font-semibold text-brand-800' : 'hover:bg-slate-100'}`
                  }
                >
                  {t(link.key)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main id="contenido" tabIndex={-1} className="flex-1 px-4 py-6 print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
