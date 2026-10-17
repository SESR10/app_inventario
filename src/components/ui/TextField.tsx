import { forwardRef, useId, type InputHTMLAttributes } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: string
  error?: string | null
}

// Campo con etiqueta visible, ayuda y error asociados para lectores de pantalla.
export const TextField = forwardRef<HTMLInputElement, Props>(function TextField(
  { label, hint, error, id, className = '', ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = hint ? `${inputId}-ayuda` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <label htmlFor={inputId} className="font-medium">
        {label}
        {rest.required && <span aria-hidden="true"> *</span>}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`min-h-11 w-full min-w-0 rounded-md border bg-white px-3 text-base ${error ? 'border-danger' : 'border-slate-500'}`}
        {...rest}
      />
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
})
