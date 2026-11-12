// Lógica del asistente: conversa con Claude y le da dos herramientas sobre el inventario de la empresa.
// No depende de Deno, para poder probarla con Vitest; index.ts la conecta con Supabase y la API de Claude.
import type {
  BetaMessage,
  BetaMessageParam,
  BetaTextBlock,
  BetaTool,
  BetaToolResultBlockParam,
  MessageCreateParamsNonStreaming as CreateParams,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'

export const MODEL = 'claude-opus-5-5'
const MAX_TURNS = 6
export const MAX_HISTORY = 20
export const MAX_TEXT = 2000

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface FoundProduct {
  id: string
  sku: string
  name: string
  unit: string
  price: number
  stock: number
  location_name: string | null
}

export interface OrderInput {
  customer: string
  phone: string | null
  pickupAt: string | null
  note: string | null
  items: { productId: string; quantity: number }[]
}

// Acceso a los datos con la sesión de quien escribe (la seguridad por empresa la hace la base).
export interface Inventory {
  search(text: string): Promise<FoundProduct[]>
  bySku(sku: string): Promise<FoundProduct | null>
  createOrder(order: OrderInput): Promise<string>
}

export interface AgentContext {
  companyName: string
  canCreateOrders: boolean
  now: Date
}

export interface AgentResult {
  reply: string
  orderIds: string[]
}

export type CreateMessage = (params: CreateParams) => Promise<BetaMessage>

export const tools: BetaTool[] = [
  {
    name: 'buscar_productos',
    description:
      'Busca productos del inventario por nombre o SKU (búsqueda parcial). Devuelve hasta 8 productos con SKU, nombre, unidad, precio, stock actual y ubicación. Úsala antes de decir si hay o no hay un producto.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Palabras clave, por ejemplo "cemento" o "tubo pvc 1/2".' },
      },
      required: ['texto'],
      additionalProperties: false,
    },
  },
  {
    name: 'crear_pedido',
    description:
      'Crea un pedido para que el cliente lo recoja en la tienda. No descuenta stock: se descuenta cuando el equipo lo marca como entregado. Úsala solo cuando el cliente confirmó los productos, las cantidades y su nombre.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        cliente: { type: 'string', description: 'Nombre de quien recoge.' },
        telefono: { type: ['string', 'null'], description: 'Teléfono o WhatsApp, si lo dio.' },
        hora_recogida: {
          type: ['string', 'null'],
          description: 'Fecha y hora de recogida en ISO 8601 con zona horaria, por ejemplo 2026-11-12T16:00:00-05:00.',
        },
        nota: { type: ['string', 'null'], description: 'Indicaciones adicionales del cliente.' },
        productos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sku: { type: 'string', description: 'SKU exacto tal como lo devolvió buscar_productos.' },
              cantidad: { type: 'number', description: 'Cantidad en la unidad del producto.' },
            },
            required: ['sku', 'cantidad'],
            additionalProperties: false,
          },
        },
      },
      required: ['cliente', 'telefono', 'hora_recogida', 'nota', 'productos'],
      additionalProperties: false,
    },
  },
]

export function systemPrompt({ companyName, canCreateOrders, now }: AgentContext) {
  const today = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'America/Bogota',
  }).format(now)
  return `Eres el asistente de atención de "${companyName}", un negocio que vende con inventario propio (por ejemplo, una ferretería). Atiendes a clientes y al equipo de la tienda en español, con frases cortas, claras y amables, como en un chat de WhatsApp.

Qué haces:
- Respondes si un producto está disponible, cuánto hay y su precio, usando siempre buscar_productos. Nunca inventes productos, precios ni cantidades.
- Si hay varios productos parecidos, muestra las opciones (nombre, precio, disponible) y pregunta cuál quiere.
- Si piden más de lo que hay, dilo y ofrece la cantidad disponible o una alternativa.
- ${
    canCreateOrders
      ? 'Puedes apartar un pedido para recoger con crear_pedido. Antes de crearlo confirma productos, cantidades, nombre de quien recoge y la hora de recogida. Al crearlo, resume el pedido y el total aproximado.'
      : 'Esta persona tiene permiso de solo lectura: puedes consultar productos, pero no crear pedidos. Si lo pide, explícale que alguien con rol de editor o administrador debe crearlo.'
  }
- Precios en pesos colombianos con separador de miles (por ejemplo $32.000). Las cantidades van en la unidad del producto.
- Si te preguntan algo que no tiene que ver con la tienda o el inventario, responde con amabilidad que solo puedes ayudar con productos y pedidos.
- No uses tablas ni Markdown complejo; a lo sumo listas cortas con guiones.

Fecha y hora actual en Colombia: ${today}.`
}

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`

async function runTool(
  name: string,
  input: unknown,
  inventory: Inventory,
  ctx: AgentContext,
  orderIds: string[],
): Promise<{ content: string; isError?: boolean }> {
  const args = (input ?? {}) as Record<string, unknown>
  if (name === 'buscar_productos') {
    const text = String(args.texto ?? '').slice(0, 100)
    const rows = await inventory.search(text)
    if (rows.length === 0) return { content: `No hay productos que coincidan con "${text}".` }
    return {
      content: JSON.stringify(
        rows.map((p) => ({
          sku: p.sku,
          nombre: p.name,
          unidad: p.unit,
          precio: money(p.price),
          disponible: Math.max(p.stock, 0),
          ubicacion: p.location_name,
        })),
      ),
    }
  }

  if (name === 'crear_pedido') {
    if (!ctx.canCreateOrders) return { content: 'Sin permiso para crear pedidos (rol de solo lectura).', isError: true }
    const customer = String(args.cliente ?? '').trim()
    const lines = Array.isArray(args.productos) ? (args.productos as { sku?: unknown; cantidad?: unknown }[]) : []
    if (!customer) return { content: 'Falta el nombre del cliente.', isError: true }
    if (lines.length === 0) return { content: 'El pedido no tiene productos.', isError: true }

    const items: OrderInput['items'] = []
    const summary: string[] = []
    let total = 0
    for (const line of lines) {
      const sku = String(line.sku ?? '')
      const quantity = Number(line.cantidad)
      if (!(quantity > 0)) return { content: `Cantidad no válida para ${sku}.`, isError: true }
      const product = await inventory.bySku(sku)
      if (!product) return { content: `No existe el SKU ${sku}. Búscalo de nuevo con buscar_productos.`, isError: true }
      if (quantity > product.stock)
        return {
          content: `Solo hay ${Math.max(product.stock, 0)} ${product.unit} de ${product.name}. Pregunta al cliente si quiere esa cantidad.`,
          isError: true,
        }
      items.push({ productId: product.id, quantity })
      summary.push(`${quantity} ${product.unit} de ${product.name}`)
      total += quantity * product.price
    }

    const pickup = typeof args.hora_recogida === 'string' && !Number.isNaN(Date.parse(args.hora_recogida)) ? args.hora_recogida : null
    const id = await inventory.createOrder({
      customer: customer.slice(0, 120),
      phone: typeof args.telefono === 'string' ? args.telefono.slice(0, 40) : null,
      pickupAt: pickup,
      note: typeof args.nota === 'string' ? args.nota.slice(0, 500) : null,
      items,
    })
    orderIds.push(id)
    return { content: `Pedido creado para ${customer}: ${summary.join(', ')}. Total aproximado ${money(total)}.` }
  }

  return { content: `Herramienta desconocida: ${name}`, isError: true }
}

// Solo texto del cliente, últimos mensajes, empezando por el usuario y alternando roles.
export function cleanHistory(history: unknown): ChatTurn[] {
  if (!Array.isArray(history)) return []
  const turns = history
    .filter(
      (t): t is ChatTurn =>
        typeof t === 'object' &&
        t !== null &&
        (t.role === 'user' || t.role === 'assistant') &&
        typeof t.content === 'string' &&
        t.content.trim() !== '',
    )
    .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_TEXT) }))
    .slice(-MAX_HISTORY)
  while (turns.length && turns[0].role !== 'user') turns.shift()
  return turns
}

export async function runAgent(
  history: ChatTurn[],
  ctx: AgentContext,
  inventory: Inventory,
  createMessage: CreateMessage,
): Promise<AgentResult> {
  const messages: BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.content }))
  const orderIds: string[] = []
  const system = systemPrompt(ctx)

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await createMessage({
      model: MODEL,
      max_tokens: 4096,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system,
      tools,
      messages,
    })

    const text = response.content
      .filter((b): b is BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()

    if (response.stop_reason === 'refusal') {
      return { reply: 'Solo puedo ayudarte con productos y pedidos de la tienda.', orderIds }
    }
    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content })
      continue
    }
    if (response.stop_reason !== 'tool_use') {
      return { reply: text || 'No tengo una respuesta para eso. ¿Me lo dices de otra forma?', orderIds }
    }

    messages.push({ role: 'assistant', content: response.content })
    const results: BetaToolResultBlockParam[] = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue
      try {
        const out = await runTool(block.name, block.input, inventory, ctx, orderIds)
        results.push({ type: 'tool_result', tool_use_id: block.id, content: out.content, is_error: out.isError })
      } catch (error) {
        console.error('Herramienta falló', block.name, error)
        results.push({ type: 'tool_result', tool_use_id: block.id, content: 'Error al consultar la base de datos.', is_error: true })
      }
    }
    messages.push({ role: 'user', content: results })
  }

  return { reply: 'Me tomó demasiados pasos responder. ¿Puedes escribirlo más corto?', orderIds }
}
