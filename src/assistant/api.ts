import type { SupabaseClient } from '@supabase/supabase-js'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type OrderStatus = 'pending' | 'ready' | 'delivered' | 'cancelled'

export interface OrderItem {
  product_id: string | null
  product_name: string
  unit: string
  quantity: number
  price: number
}

export interface CustomerOrder {
  id: string
  customer_name: string
  customer_phone: string | null
  pickup_at: string | null
  note: string | null
  status: OrderStatus
  source: string
  created_at: string
  items: OrderItem[]
}

// Errores de la función: not_configured (falta la clave de IA), busy, failed…
export class AssistantError extends Error {
  code: string
  constructor(code: string) {
    super(code)
    this.code = code
  }
}

export async function askAssistant(client: SupabaseClient, companyId: string, messages: ChatMessage[]) {
  const { data, error } = await client.functions.invoke<{ reply: string; orderIds: string[] }>('asistente', {
    body: { companyId, messages },
  })
  if (error) {
    const response = (error as { context?: unknown }).context
    let code = 'failed'
    if (response instanceof Response) {
      code = response.status === 404 ? 'not_configured' : 'failed'
      try {
        code = ((await response.json()) as { error?: string }).error ?? code
      } catch {
        // Sin cuerpo JSON: la función no está publicada o no respondió.
      }
    }
    throw new AssistantError(code)
  }
  if (!data) throw new AssistantError('failed')
  return data
}

export async function listOrders(client: SupabaseClient, companyId: string, status: OrderStatus | '') {
  const { data, error } = await client.rpc('list_customer_orders', { p_company: companyId, p_status: status || null })
  if (error) throw error
  return (data ?? []) as CustomerOrder[]
}

export async function setOrderStatus(client: SupabaseClient, orderId: string, status: OrderStatus) {
  const { error } = await client.rpc('set_customer_order_status', { p_order: orderId, p_status: status })
  if (error) throw error
}
