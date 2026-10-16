import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Membership } from '../lib/types'
import { CompanyContext } from './context'

const STORAGE_KEY = 'inventario.empresa'

function readStoredId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function CompanyProvider({
  client,
  userId,
  children,
}: {
  client: SupabaseClient
  userId: string
  children: ReactNode
}) {
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(readStoredId)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMemberships = useCallback(
    () =>
      client
        .from('company_members')
        .select('role, company:companies!inner(id, name)')
        .eq('user_id', userId)
        .order('created_at'),
    [client, userId],
  )

  const apply = useCallback(({ data, error: err }: Awaited<ReturnType<typeof fetchMemberships>>) => {
    setError(err ? err.message : null)
    setMemberships((data as unknown as Membership[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void fetchMemberships().then(apply)
  }, [fetchMemberships, apply])

  const reload = useCallback(async () => {
    setLoading(true)
    apply(await fetchMemberships())
  }, [fetchMemberships, apply])

  const select = useCallback((companyId: string) => {
    setSelectedId(companyId)
    try {
      localStorage.setItem(STORAGE_KEY, companyId)
    } catch {
      // Sin almacenamiento local solo se pierde la preferencia.
    }
  }, [])

  const value = useMemo(() => {
    const current = memberships.find((m) => m.company.id === selectedId) ?? memberships[0] ?? null
    return { memberships, current, loading, error, select, reload }
  }, [memberships, selectedId, loading, error, select, reload])

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
}
