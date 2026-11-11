import type { ComponentPropsWithRef } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary:
    'btn-neon hover:-translate-y-px hover:brightness-110 hover:shadow-[0_8px_30px_-6px_rgb(34_227_255/0.8)] disabled:translate-y-0 disabled:bg-none disabled:bg-slate-400 disabled:text-muted disabled:shadow-none',
  accent:
    'btn-neon hover:-translate-y-px hover:brightness-110 hover:shadow-[0_8px_30px_-6px_rgb(34_227_255/0.8)] disabled:translate-y-0 disabled:bg-none disabled:bg-slate-300 disabled:text-muted disabled:shadow-none',
  secondary:
    'btn-glass hover:-translate-y-px hover:border-accent-400 hover:shadow-[0_0_18px_-4px_rgb(34_227_255/0.6)] disabled:translate-y-0 disabled:text-muted disabled:shadow-none',
  ghost: 'text-brand-700 underline-offset-4 hover:underline disabled:text-muted',
  danger:
    'border border-danger/60 bg-danger/10 text-danger hover:-translate-y-px hover:bg-danger hover:text-[#14030a] hover:shadow-[0_0_20px_-4px_rgb(255_107_129/0.7)] disabled:translate-y-0 disabled:bg-slate-400',
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
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-all duration-200 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
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
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-all duration-200 ${variants[variant]} ${className}`}
    />
  )
}
