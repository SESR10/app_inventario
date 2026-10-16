import type { SupabaseClient } from '@supabase/supabase-js'
import { vi } from 'vitest'
import type { Membership } from '../lib/types'

// Cliente mínimo de Supabase para pruebas de interfaz, sin red.
export function fakeClient({ signedIn = false, memberships = [] as Membership[] } = {}) {
  const session = signedIn ? { user: { id: 'u1', email: 'ana@empresa.com' } } : null
  const query = {
    select: () => query,
    eq: () => query,
    order: () => Promise.resolve({ data: memberships, error: null }),
  }
  const client = {
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signInWithPassword: vi.fn(() =>
        Promise.resolve({ data: {}, error: { code: 'invalid_credentials', message: 'Invalid login credentials' } }),
      ),
      signUp: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
    from: vi.fn(() => query),
    rpc: vi.fn(() => Promise.resolve({ data: 'c1', error: null })),
  }
  return client as typeof client & SupabaseClient
}
