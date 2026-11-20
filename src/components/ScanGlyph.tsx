// Esquinas de mira con una línea: el mismo trazo del recuadro del escáner, dibujado a mano.
export function ScanGlyph({ className = 'size-5' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={className}>
      <path d="M3 8V4.5A1.5 1.5 0 0 1 4.5 3H8M16 3h3.5A1.5 1.5 0 0 1 21 4.5V8M21 16v3.5a1.5 1.5 0 0 1-1.5 1.5H16M8 21H4.5A1.5 1.5 0 0 1 3 19.5V16" />
      <path d="M7 12h10" />
    </svg>
  )
}
