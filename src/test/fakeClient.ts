import type { SupabaseClient } from '@supabase/supabase-js'
import { vi } from 'vitest'
import type { Membership } from '../lib/types'

type Row = Record<string, unknown>

interface Options {
  signedIn?: boolean
  memberships?: Membership[]
  // Filas que devuelve cada tabla al consultarla.
  tables?: Record<string, Row[]>
  // Respuesta de cada función RPC según sus argumentos.
  rpc?: Record<string, (args: Record<string, unknown>) => unknown>
}

// Cliente mínimo de Supabase para pruebas de interfaz, sin red.
export function fakeClient({ signedIn = false, memberships = [], tables = {}, rpc = {} }: Options = {}) {
  const session = signedIn ? { user: { id: 'u1', email: 'ana@empresa.com' } } : null
  const writes: { table: string; op: string; payload?: unknown; filters: [string, unknown][] }[] = []

  function query(table: string) {
    const rows = table === 'company_members' ? (memberships as unknown as Row[]) : (tables[table] ?? [])
    const filters: [string, unknown][] = []
    let op = 'select'
    let payload: Row | undefined
    let single = false

    const result = () => {
      if (op !== 'select') writes.push({ table, op, payload, filters })
      if (op === 'insert') return { data: { id: 'nuevo', ...payload, sku: payload?.sku ?? 'P-000001' }, error: null }
      if (op === 'update') return { data: { id: filters[0]?.[1], ...payload }, error: null }
      if (op === 'delete') return { data: null, error: null }
      const matching = rows.filter((r) =>
        filters.every(([col, val]) => !(col in r) || (Array.isArray(val) ? val.includes(r[col]) : r[col] === val)),
      )
      return { data: single ? (matching[0] ?? null) : matching, error: null }
    }

    const builder = {
      select: () => builder,
      order: () => builder,
      eq: (col: string, val: unknown) => (filters.push([col, val]), builder),
      in: (col: string, val: unknown[]) => (filters.push([col, val]), builder),
      insert: (row: Row) => ((op = 'insert'), (payload = row), builder),
      update: (row: Row) => ((op = 'update'), (payload = row), builder),
      delete: () => ((op = 'delete'), builder),
      single: () => ((single = true), builder),
      maybeSingle: () => ((single = true), builder),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    }
    return builder
  }

  const storageBucket = {
    upload: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    remove: vi.fn(() => Promise.resolve({ data: [], error: null })),
    createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: 'https://img.test/a.png' }, error: null })),
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
    from: vi.fn(query),
    rpc: vi.fn((name: string, args: Record<string, unknown> = {}) => {
      const handler = rpc[name] ?? (name === 'create_company' ? () => 'c1' : () => null)
      return Promise.resolve({ data: handler(args), error: null })
    }),
    storage: { from: vi.fn(() => storageBucket) },
    writes,
    storageBucket,
  }
  return client as typeof client & SupabaseClient
}
