import type { TFunction } from 'i18next'
import { formatNumber } from '../lib/format'
import type { Movement } from '../lib/types'

const dateFormat = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' })

export const formatDate = (iso: string) => dateFormat.format(new Date(iso))

// +5 o −8 (signo menos tipográfico, más legible).
export const formatQuantity = (value: number) => (value > 0 ? `+${formatNumber(value)}` : `−${formatNumber(-value)}`)

// Los motivos que empiezan con @ los genera la app; el resto los escribió una persona.
export function reasonText(t: TFunction, reason: string | null) {
  if (!reason) return t('movements.reasons.none')
  return reason.startsWith('@') ? t(`movements.reasons.${reason}`, { defaultValue: reason }) : reason
}

export const typeBadge: Record<Movement['type'], string> = {
  in: 'bg-green-50 text-success',
  out: 'bg-red-50 text-danger',
  adjust: 'bg-slate-100 text-ink',
}
