// Función Edge "asistente": recibe la conversación desde la app y responde con Claude.
// Secreto necesario en Supabase: ANTHROPIC_API_KEY (SUPABASE_URL y SUPABASE_ANON_KEY ya vienen).
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { cleanHistory, runAgent, type FoundProduct, type Inventory } from './agent.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'not_configured' }, 503)

  const auth = req.headers.get('Authorization') ?? ''
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })
  const { data: userData } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ''))
  if (!userData.user) return json({ error: 'unauthorized' }, 401)

  let body: { companyId?: unknown; messages?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const companyId = typeof body.companyId === 'string' ? body.companyId : ''
  const history = cleanHistory(body.messages)
  if (!companyId || history.length === 0 || history[history.length - 1].role !== 'user')
    return json({ error: 'bad_request' }, 400)

  // RLS: solo devuelve la fila si quien escribe es miembro de esa empresa.
  const { data: member } = await supabase
    .from('company_members')
    .select('role, companies(name)')
    .eq('company_id', companyId)
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (!member) return json({ error: 'forbidden' }, 403)
  const companyName = (member.companies as unknown as { name: string } | null)?.name ?? 'la tienda'

  const toProduct = (p: Record<string, unknown>): FoundProduct => ({
    id: String(p.id),
    sku: String(p.sku),
    name: String(p.name),
    unit: String(p.unit),
    price: Number(p.price),
    stock: Number(p.stock),
    location_name: (p.location_name as string | null) ?? null,
  })

  const inventory: Inventory = {
    async search(text) {
      const { data, error } = await supabase.rpc('search_products', { p_company: companyId, p_query: text, p_limit: 8 })
      if (error) throw error
      return (data ?? []).map(toProduct)
    },
    async bySku(sku) {
      const { data, error } = await supabase.rpc('search_products', { p_company: companyId, p_query: sku, p_limit: 20 })
      if (error) throw error
      const match = (data ?? []).find((p: { sku: string }) => p.sku.toLowerCase() === sku.trim().toLowerCase())
      return match ? toProduct(match) : null
    },
    async createOrder(order) {
      const { data, error } = await supabase.rpc('create_customer_order', {
        p_company: companyId,
        p_customer: order.customer,
        p_phone: order.phone,
        p_pickup: order.pickupAt,
        p_note: order.note,
        p_items: order.items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
      })
      if (error) throw error
      return String(data)
    },
  }

  const client = new Anthropic({ apiKey })
  try {
    const result = await runAgent(
      history,
      { companyName, canCreateOrders: member.role === 'admin' || member.role === 'editor', now: new Date() },
      inventory,
      (params) => client.beta.messages.create(params),
    )
    return json(result)
  } catch (error) {
    console.error('Asistente falló', error)
    if (error instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 429)
    if (error instanceof Anthropic.AuthenticationError) return json({ error: 'not_configured' }, 503)
    return json({ error: 'failed' }, 502)
  }
})
