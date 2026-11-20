import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext } from './context'

export function AuthProvider({ client, children }: { client: SupabaseClient; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  // Entró con el enlace de "¿Olvidaste tu contraseña?": debe crear una nueva antes de seguir.
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    void client.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = client.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (event === 'SIGNED_OUT') setRecovering(false)
      setSession(next)
    })
    return () => data.subscription.unsubscribe()
  }, [client])

  const value = useMemo(
    () => ({
      session,
      loading,
      recovering,
      finishRecovery: () => setRecovering(false),
      signOut: async () => {
        await client.auth.signOut()
      },
    }),
    [client, session, loading, recovering],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
