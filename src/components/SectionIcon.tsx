import type { ReactNode } from 'react'

// Íconos propios de la app, dibujados a mano: una forma principal en ámbar y trazos claros, sobre una
// baldosa oscura. Reemplazan las fotos de cajas y estibas que se repetían. Siempre decorativos.
const A = 'var(--color-accent-400)'
const INK = 'var(--color-ink)'
const line = { fill: 'none', stroke: INK, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const icons = {
  // Panel: barras que suben y la más alta en ámbar.
  panel: (
    <>
      <rect x="5" y="17" width="5.5" height="10" rx="1.5" {...line} />
      <rect x="13.25" y="11" width="5.5" height="16" rx="1.5" {...line} />
      <rect x="21.5" y="4" width="5.5" height="23" rx="1.5" fill={A} />
    </>
  ),
  // Productos: caja isométrica con la tapa en ámbar.
  products: (
    <>
      <path d="M16 4 27 9.5 16 15 5 9.5Z" fill={A} />
      <path d="M5 9.5v12L16 27l11-5.5v-12M16 15v12" {...line} />
    </>
  ),
  // Movimientos: una flecha que entra (ámbar) y otra que sale.
  movements: (
    <>
      <path d="M4 10h17" stroke={A} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M17.5 4.5 24 10l-6.5 5.5" fill="none" stroke={A} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28 22H11M14.5 16.5 8 22l6.5 5.5" {...line} />
    </>
  ),
  // Importar y exportar: hoja de cálculo con un botón de flecha.
  import: (
    <>
      <rect x="4" y="4" width="17" height="22" rx="2.5" {...line} />
      <path d="M4 11h17M4 18h17M11 4v22" {...line} strokeWidth="1.6" />
      <circle cx="23" cy="22" r="7" fill={A} />
      <path d="M23 18.2v7M20 22.5l3 3 3-3" fill="none" stroke="#1a1206" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // Equipo: una persona en ámbar al frente y otra detrás.
  team: (
    <>
      <circle cx="21.5" cy="9.5" r="3.6" {...line} />
      <path d="M17.5 17.5a7 7 0 0 1 11 5.8" {...line} />
      <circle cx="12" cy="11" r="4.6" fill={A} />
      <path d="M3.5 27a8.5 8.5 0 0 1 17 0Z" fill={A} />
    </>
  ),
  // Stock bajo: medidor con la aguja en la zona baja.
  low: (
    <>
      <path d="M5 23a11 11 0 0 1 22 0" {...line} />
      <path d="M5 23a11 11 0 0 1 3.2-7.8" fill="none" stroke={A} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M16 23 9.5 16.5" stroke={A} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="16" cy="23" r="2.6" fill={A} />
    </>
  ),
  // Agotado: caja vacía con un cero.
  out: (
    <>
      <path d="M4 12h18v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2ZM2.5 12l3-5h15l3 5" {...line} />
      <circle cx="24" cy="10" r="6.5" fill={A} />
      <ellipse cx="24" cy="10" rx="2" ry="3" fill="none" stroke="#1a1206" strokeWidth="1.8" />
    </>
  ),
  // Valor al costo: monedas apiladas.
  cost: (
    <>
      <ellipse cx="14" cy="22" rx="9" ry="3.5" {...line} />
      <path d="M5 22v-4.5M23 22v-4.5" {...line} />
      <ellipse cx="14" cy="17.5" rx="9" ry="3.5" {...line} />
      <ellipse cx="18" cy="9" rx="9" ry="3.5" fill={A} />
      <path d="M9 9v3.5a9 3.5 0 0 0 18 0V9" fill={A} />
    </>
  ),
  // Valor al precio de venta: etiqueta de precio.
  price: (
    <>
      <path d="M15 4h11a2 2 0 0 1 2 2v11L16.5 28.5a2 2 0 0 1-2.8 0L3.5 18.3a2 2 0 0 1 0-2.8Z" fill={A} />
      <circle cx="22.5" cy="9.5" r="2.4" fill="#1a1206" />
      <path d="M9.5 17.5l5 5M13 14l5 5" stroke="#1a1206" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  // Movimientos de la semana: calendario con el día en ámbar.
  week: (
    <>
      <rect x="4" y="6" width="24" height="21" rx="3" {...line} />
      <path d="M4 12h24M10 3.5v5M22 3.5v5" {...line} />
      <rect x="17" y="16" width="7" height="7" rx="1.5" fill={A} />
    </>
  ),
  // Etiquetas con código: etiqueta con barras.
  labels: (
    <>
      <path d="M10 6h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H10l-7-10Z" {...line} />
      <path d="M13 11v10M16.5 11v10M21.5 11v10" stroke={A} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M19 11v10M24.5 11v10" stroke={A} strokeWidth="1.3" strokeLinecap="round" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof icons

export function SectionIcon({ name, className = 'size-10' }: { name: IconName; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-slate-100 ring-1 ring-slate-300 ${className}`}
    >
      <svg viewBox="0 0 32 32" className="size-[62%]">
        {icons[name]}
      </svg>
    </span>
  )
}
