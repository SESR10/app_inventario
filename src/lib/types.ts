export type AppRole = 'admin' | 'editor' | 'viewer'

export interface Membership {
  role: AppRole
  company: { id: string; name: string }
}
