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

// Devuelve el stock nuevo (en unidad base). En un ajuste, quantity es el stock contado.
// quantity va en la presentación packageId (caja, pieza…) o, sin ella, en la unidad base.
export async function recordMovement(
  client: SupabaseClient,
  productId: string,
  type: MovementType,
  quantity: number,
  reason: string,
  packageId: string | null = null,
) {
  const { data, error } = await client.rpc('record_movement', {
    p_product: productId,
    p_type: type,
    p_quantity: quantity,
    p_reason: reason.trim() || null,
    p_package: packageId,
  })
  if (error) throw error
  return Number(data)
}

// Código del error de la base (hint), por ejemplo insufficient_stock.
export const errorHint = (error: unknown) =>
  typeof error === 'object' && error !== null && 'hint' in error ? String(error.hint) : ''

// Detalle del error de la base; en un kit sin stock suficiente, el nombre de la pieza que falta.
export const errorDetail = (error: unknown) =>
  typeof error === 'object' && error !== null && 'details' in error && error.details ? String(error.details) : ''
