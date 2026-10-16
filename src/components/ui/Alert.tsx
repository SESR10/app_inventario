import type { ReactNode } from 'react'

const tones = {
  error: 'border-danger bg-red-50 text-danger',
  success: 'border-success bg-green-50 text-success',
  info: 'border-brand-700 bg-brand-50 text-ink',
}

// Los errores se anuncian de inmediato; el resto de mensajes, de forma educada.
export function Alert({ tone = 'info', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-md border-l-4 px-4 py-3 ${tones[tone]}`}>
      {children}
    </div>
  )
}
