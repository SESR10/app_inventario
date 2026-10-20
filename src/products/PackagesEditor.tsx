import { Plus } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/Button'
import { TextField } from '../components/ui/TextField'
import { parseNumber } from '../lib/format'
import { packageEquivalence } from './units'

export interface PackageDraft {
  key: string
  id?: string
  name: string
  factor: string
  barcode: string
}

export type PackageErrors = Record<string, { name?: string; factor?: string }>

interface Props {
  unit: string
  value: PackageDraft[]
  onChange: (next: PackageDraft[]) => void
  errors: PackageErrors
  disabled?: boolean
}

// Presentaciones del producto: cajas, rollos, piezas… y cuánto trae cada una en la unidad base.
export function PackagesEditor({ unit, value, onChange, errors, disabled }: Props) {
  const { t } = useTranslation()
  const titleId = useId()
  const update = (key: string, patch: Partial<PackageDraft>) =>
    onChange(value.map((p) => (p.key === key ? { ...p, ...patch } : p)))

  function add() {
    const key = crypto.randomUUID()
    onChange([...value, { key, name: '', factor: '', barcode: '' }])
    // El foco va al nombre de la presentación nueva.
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[name="package-name-${key}"]`)?.focus())
  }

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 shadow-sm">
      <h2 id={titleId} className="text-lg font-semibold">
        {t('packages.title')}
      </h2>
      <p className="text-muted">{t('packages.intro', { unit: unit || t('units.names.unidad') })}</p>

      {value.length > 0 && (
        <ul className="flex flex-col gap-3">
          {value.map((pkg, index) => {
            const factor = parseNumber(pkg.factor)
            const label = pkg.name.trim() || t('packages.numbered', { n: index + 1 })
            return (
              <li key={pkg.key} className="grid gap-3 rounded-lg border border-line bg-canvas p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-start">
                <TextField
                  name={`package-name-${pkg.key}`}
                  label={t('packages.name')}
                  hint={t('packages.nameHint')}
                  maxLength={40}
                  value={pkg.name}
                  disabled={disabled}
                  onChange={(e) => update(pkg.key, { name: e.target.value })}
                  error={errors[pkg.key]?.name}
                />
                <TextField
                  name={`package-factor-${pkg.key}`}
                  label={t('packages.factor', { unit: unit || t('units.names.unidad') })}
                  hint={
                    factor && factor > 0 && pkg.name.trim()
                      ? packageEquivalence({ name: pkg.name.trim(), factor }, unit)
                      : t('packages.factorHint')
                  }
                  inputMode="decimal"
                  value={pkg.factor}
                  disabled={disabled}
                  onChange={(e) => update(pkg.key, { factor: e.target.value })}
                  error={errors[pkg.key]?.factor}
                />
                <TextField
                  name={`package-barcode-${pkg.key}`}
                  label={t('packages.barcode')}
                  hint={t('packages.barcodeHint')}
                  maxLength={64}
                  autoComplete="off"
                  value={pkg.barcode}
                  disabled={disabled}
                  onChange={(e) => update(pkg.key, { barcode: e.target.value })}
                />
                {!disabled && (
                <Button
                  variant="ghost"
                  className="sm:mt-7"
                  aria-label={t('packages.removeFor', { name: label })}
                  onClick={() => onChange(value.filter((p) => p.key !== pkg.key))}
                >
                  {t('packages.remove')}
                </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!disabled && (
        <Button variant="secondary" onClick={add} className="self-start">
          <Plus aria-hidden="true" className="size-5" />
          {t('packages.add')}
        </Button>
      )}
      {disabled && value.length === 0 && <p className="text-muted">{t('packages.none')}</p>}
    </section>
  )
}
