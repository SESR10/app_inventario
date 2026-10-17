import { createContext, useContext } from 'react'
import type { Membership } from '../lib/types'

export interface CompanyState {
  memberships: Membership[]
  current: Membership | null
  loading: boolean
  error: string | null
  select: (companyId: string) => void
  reload: () => Promise<void>
}

export const CompanyContext = createContext<CompanyState | null>(null)

export function useCompany(): CompanyState {
  const ctx = useContext(CompanyContext)
  if (!ctx) throw new Error('useCompany debe usarse dentro de CompanyProvider')
  return ctx
}
