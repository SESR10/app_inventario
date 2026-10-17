import type { SupabaseClient } from '@supabase/supabase-js'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/context'
import { CompanyProvider } from './company/CompanyProvider'
import { useCompany } from './company/context'
import { Layout } from './components/Layout'
import { Alert } from './components/ui/Alert'
import { SupabaseContext } from './lib/client-context'
import { CreateCompanyPage } from './pages/CreateCompanyPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage, PendingPage } from './pages/SimplePages'

function FullScreenMessage({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">{children}</main>
}

function Loading() {
  const { t } = useTranslation()
  return (
    <FullScreenMessage>
      <p role="status">{t('app.loading')}</p>
    </FullScreenMessage>
  )
}

function CompanyGate() {
  const { memberships, loading, error } = useCompany()
  if (loading && memberships.length === 0) return <Loading />
  if (error)
    return (
      <FullScreenMessage>
        <Alert tone="error">{error}</Alert>
      </FullScreenMessage>
    )
  if (memberships.length === 0) return <CreateCompanyPage />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="productos" element={<PendingPage titleKey="nav.products" />} />
        <Route path="movimientos" element={<PendingPage titleKey="nav.movements" />} />
        <Route path="importar" element={<PendingPage titleKey="nav.import" />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

function SessionGate({ client }: { client: SupabaseClient }) {
  const { session, loading } = useAuth()
  if (loading) return <Loading />
  if (!session) return <LoginPage />
  return (
    <CompanyProvider key={session.user.id} client={client} userId={session.user.id}>
      <CompanyGate />
    </CompanyProvider>
  )
}

export default function App({ client }: { client: SupabaseClient | null }) {
  const { t } = useTranslation()

  if (!client) {
    return (
      <FullScreenMessage>
        <h1 className="text-2xl font-bold">{t('config.title')}</h1>
        <p>{t('config.body')}</p>
      </FullScreenMessage>
    )
  }

  return (
    <SupabaseContext.Provider value={client}>
      <AuthProvider client={client}>
        <BrowserRouter>
          <SessionGate client={client} />
        </BrowserRouter>
      </AuthProvider>
    </SupabaseContext.Provider>
  )
}
