import type { SupabaseClient } from '@supabase/supabase-js'
import type { Movement, MovementType } from '../lib/types'

export const MOVEMENTS_PAGE = 50

export interface MovementFilters {
  productId: string
  type: MovementType | ''
  from: string
  to: string
}

export const emptyMovementFilters: MovementFilters = { productId: '', type: '', from: '', to: '' }

export async function listMovements(
  client: SupabaseClient,
  companyId: string,
  filters: MovementFilters,
  before: Movement | null,
) {
  const { data, error } = await client.rpc('list_movements', {
    p_company: companyId,
    p_product: filters.productId || null,
    p_type: filters.type || null,
    p_from: filters.from || null,
    p_to: filters.to || null,
    p_before_id: before?.id ?? null,
    p_limit: MOVEMENTS_PAGE,
  })
  if (error) throw error
  return (data ?? []) as Movement[]
}

// Devuelve el stock nuevo. En un ajuste, quantity es el stock contado.
export async function recordMovement(
  client: SupabaseClient,
  productId: string,
  type: MovementType,
  quantity: number,
  reason: string,
) {
  const { data, error } = await client.rpc('record_movement', {
    p_product: productId,
    p_type: type,
    p_quantity: quantity,
    p_reason: reason.trim() || null,
  })
  if (error) throw error
  return Number(data)
}

// Código del error de la base (hint), por ejemplo insufficient_stock.
export const errorHint = (error: unknown) =>
  typeof error === 'object' && error !== null && 'hint' in error ? String(error.hint) : ''
