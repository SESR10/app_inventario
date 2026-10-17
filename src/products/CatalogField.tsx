import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/Button'
import { SelectField } from '../components/ui/SelectField'
import { TextField } from '../components/ui/TextField'
import { useSupabase } from '../lib/client-context'
import type { CatalogItem, CatalogTable } from '../lib/types'
import { createCatalogItem, isDuplicateError } from './api'

interface Props {
  table: CatalogTable
  label: string
  companyId: string
  items: CatalogItem[]
  value: string
  disabled?: boolean
  onChange: (id: string) => void
  onCreated: (item: CatalogItem) => void
}

// Lista desplegable con opción de crear un elemento nuevo sin salir del formulario.
export function CatalogField({ table, label, companyId, items, value, disabled, onChange, onCreated }: Props) {
  const { t } = useTranslation()
  const client = useSupabase()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const groupId = useId()

  function close() {
    setAdding(false)
    setName('')
    setError(null)
    // Devuelve el foco al botón que abrió el formulario.
    requestAnimationFrame(() => addButtonRef.current?.focus())
  }

  async function save() {
    if (!name.trim()) {
      setError(t('catalog.required'))
      return
    }
    setBusy(true)
    try {
      const item = await createCatalogItem(client, table, companyId, name)
      onCreated(item)
      onChange(item.id)
      close()
    } catch (err) {
      setError(isDuplicateError(err) ? t('catalog.duplicate') : t('catalog.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <SelectField
          label={label}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1"
        >
          <option value="">{t('products.fields.none')}</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </SelectField>
        {!adding && !disabled && (
          <Button
            ref={addButtonRef}
            variant="secondary"
            aria-label={`${t('catalog.add')}: ${t(`catalog.addTitle_${table}`)}`}
            onClick={() => setAdding(true)}
          >
            {t('catalog.add')}
          </Button>
        )}
      </div>
      {adding && (
        <div
          role="group"
          aria-labelledby={groupId}
          className="flex flex-col gap-2 rounded-md border border-line bg-slate-50 p-3"
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
            // Enter guarda este elemento sin enviar el formulario del producto.
            if (e.key === 'Enter') {
              e.preventDefault()
              void save()
            }
          }}
        >
          <p id={groupId} className="font-medium">
            {t(`catalog.addTitle_${table}`)}
          </p>
          <TextField
            label={t('catalog.name')}
            autoFocus
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={error}
          />
          <div className="flex gap-2">
            <Button onClick={() => void save()} busy={busy}>
              {t('catalog.save')}
            </Button>
            <Button variant="secondary" onClick={close}>
              {t('catalog.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
