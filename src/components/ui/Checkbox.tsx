import { useId, type InputHTMLAttributes } from 'react'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  // Oculta el texto en pantalla pero lo deja para lectores de pantalla.
  hideLabel?: boolean
}

export function Checkbox({ label, hideLabel = false, id, className = '', ...rest }: Props) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={`flex min-h-11 items-center gap-2 ${className}`}>
      <input id={inputId} type="checkbox" className="size-5 accent-brand-700" {...rest} />
      <label htmlFor={inputId} className={hideLabel ? 'sr-only' : ''}>
        {label}
      </label>
    </div>
  )
}
