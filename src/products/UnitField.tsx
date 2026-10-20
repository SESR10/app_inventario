import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SelectField } from '../components/ui/SelectField'
import { TextField } from '../components/ui/TextField'
import { KNOWN_UNITS, UNIT_GROUPS } from './units'

const OTHER = '__otra__'

interface Props {
  value: string
  onChange: (unit: string) => void
  disabled?: boolean
}

// Unidad base del producto: se elige de la lista (m², kg, galón…) o se escribe otra.
export function UnitField({ value, onChange, disabled }: Props) {
  const { t } = useTranslation()
  const [custom, setCustom] = useState(() => !KNOWN_UNITS.includes(value))

  return (
    <div className="flex flex-col gap-2">
      <SelectField
        name="unit"
        label={t('products.fields.unit')}
        hint={t('products.fields.unitHint')}
        value={custom ? OTHER : value}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value
          setCustom(next === OTHER)
          onChange(next === OTHER ? '' : next)
        }}
      >
        {UNIT_GROUPS.map((group) => (
          <optgroup key={group.key} label={t(`units.groups.${group.key}`)}>
            {group.units.map((unit) => (
              <option key={unit} value={unit}>
                {t(`units.names.${unit}`, { defaultValue: unit })}
              </option>
            ))}
          </optgroup>
        ))}
        <option value={OTHER}>{t('units.other')}</option>
      </SelectField>
      {custom && (
        <TextField
          name="unitOther"
          label={t('units.otherLabel')}
          maxLength={30}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}
