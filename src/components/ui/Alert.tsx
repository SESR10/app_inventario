import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info } from 'lucide-react'

const tones = {
  error: 'border-danger bg-red-50 text-danger',
  success: 'border-success bg-green-50 text-success',
  info: 'border-brand-700 bg-brand-50 text-ink',
}

const icons = { error: CircleAlert, success: CircleCheck, info: Info }

// Los errores se anuncian de inmediato; el resto de mensajes, de forma educada.
export function Alert({ tone = 'info', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  const Icon = icons[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl border-l-4 px-4 py-3 shadow-sm ${tones[tone]}`}>
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1 break-words leading-relaxed">{children}</div>
    </div>
  )
}
