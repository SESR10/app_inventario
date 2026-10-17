import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from 'react'

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  hint?: string
  error?: string | null
  children: ReactNode
}

export const SelectField = forwardRef<HTMLSelectElement, Props>(function SelectField(
  { label, hint, error, id, className = '', children, ...rest },
  ref,
) {
  const autoId = useId()
  const selectId = id ?? autoId
  const hintId = hint ? `${selectId}-ayuda` : undefined
  const errorId = error ? `${selectId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <label htmlFor={selectId} className="font-medium">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`min-h-11 w-full min-w-0 rounded-md border bg-white px-2 text-base ${error ? 'border-danger' : 'border-slate-500'}`}
        {...rest}
      >
        {children}
      </select>
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
})
