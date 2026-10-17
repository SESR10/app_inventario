import type { ComponentPropsWithRef } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-slate-400',
  secondary: 'border border-line bg-white text-ink hover:bg-slate-50 disabled:text-muted',
  ghost: 'text-brand-700 underline-offset-4 hover:underline disabled:text-muted',
  danger: 'bg-danger text-white hover:bg-red-800 disabled:bg-slate-400',
}

interface Props extends ComponentPropsWithRef<'button'> {
  variant?: Variant
  busy?: boolean
}

export function Button({ variant = 'primary', busy = false, className = '', disabled, children, ...rest }: Props) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-base font-medium disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

// Enlace con apariencia de botón, para navegar (no para acciones).
export function LinkButton({ variant = 'primary', className = '', ...rest }: LinkProps & { variant?: Variant }) {
  return (
    <Link
      {...rest}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-base font-medium ${variants[variant]} ${className}`}
    />
  )
}
