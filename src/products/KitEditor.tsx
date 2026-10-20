import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Alert } from '../components/ui/Alert'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { formatNumber, parseNumber } from '../lib/format'
import type { KitComponent } from '../lib/types'
import { ProductPicker } from '../movements/ProductPicker'

export type ComponentDraft = Omit<KitComponent, 'quantity'> & { quantity: string }

interface Props {
  companyId: string
  kitId?: string
  value: ComponentDraft[]
  onChange: (next: ComponentDraft[]) => void
  errors: Record<string, string>
  disabled?: boolean
}

// Cuántos kits completos alcanzan con el stock de cada pieza.
function kitsAvailable(components: ComponentDraft[]) {
  const counts = components.map((c) => {
    const qty = parseNumber(c.quantity)
    return qty && qty > 0 ? Math.floor(Math.max(c.stock, 0) / qty) : 0
  })
  return counts.length > 0 ? Math.min(...counts) : 0
}

// Piezas que forman el kit (por ejemplo, un baño: sanitario, lavamanos y grifería).
export function KitEditor({ companyId, kitId, value, onChange, errors, disabled }: Props) {
  const { t } = useTranslation()
  const titleId = useId()
  const [notice, setNotice] = useState<string | null>(null)

  const update = (id: string, quantity: string) =>
    onChange(value.map((c) => (c.component_id === id ? { ...c, quantity } : c)))

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 shadow-sm">
      <h2 id={titleId} className="text-lg font-semibold">
        {t('kits.title')}
      </h2>
      <p className="text-muted">{t('kits.intro')}</p>

      {value.length > 0 && (
        <ul className="flex flex-col gap-3">
          {value.map((c) => (
            <li
              key={c.component_id}
              className="grid gap-3 rounded-lg border border-line bg-canvas p-3 sm:grid-cols-[1fr_12rem_auto] sm:items-start"
            >
              <div className="flex flex-col gap-0.5 sm:pt-2">
                <span className="font-semibold">{c.name}</span>
                <span className="text-sm text-muted">
                  {c.sku} · {t('movements.currentStock', { stock: formatNumber(c.stock), unit: c.unit })}
                </span>
              </div>
              <TextField
                name={`kit-qty-${c.component_id}`}
                label={t('kits.quantity', { unit: c.unit, name: c.name })}
                inputMode="decimal"
                value={c.quantity}
                disabled={disabled}
                onChange={(e) => update(c.component_id, e.target.value)}
                error={errors[c.component_id]}
              />
              {!disabled && (
                <Button
                  variant="ghost"
                  className="sm:mt-7"
                  aria-label={t('kits.removeFor', { name: c.name })}
                  onClick={() => onChange(value.filter((x) => x.component_id !== c.component_id))}
                >
                  {t('kits.remove')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {value.length > 0 && (
        <p className="font-medium" aria-live="polite">
          {t('kits.available', { count: kitsAvailable(value) })}
        </p>
      )}
      {value.length === 0 && <p className="text-muted">{t('kits.empty')}</p>}

      {!disabled && (
        <>
          <ProductPicker
            name="kitPiece"
            label={t('kits.add')}
            hint={t('kits.addHint')}
            companyId={companyId}
            value={null}
            error={errors.list}
            onChange={(p) => {
              setNotice(null)
              if (!p) return
              if (p.is_kit || p.id === kitId) return setNotice(t('kits.noNested'))
              if (value.some((c) => c.component_id === p.id)) return setNotice(t('kits.already', { name: p.name }))
              onChange([
                ...value,
                { component_id: p.id, name: p.name, sku: p.sku, unit: p.unit, stock: Number(p.stock), quantity: '1' },
              ])
            }}
          />
          <div aria-live="polite">{notice && <Alert>{notice}</Alert>}</div>
        </>
      )}
    </section>
  )
}
