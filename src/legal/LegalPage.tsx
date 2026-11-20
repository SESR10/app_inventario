import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { PageHeading } from '../components/PageHeading'
import { LEGAL_UPDATED, RESPONSABLE, type LegalDoc } from './config'
import { legalTexts } from './content.es'
import { LegalLinks } from './LegalLinks'

// Datos del responsable; los que falten se ven como "(pendiente)" hasta completarlos en config.ts.
function owner(pending: string) {
  return Object.fromEntries(
    Object.entries(RESPONSABLE).map(([key, value]) => [key, value.trim() || pending]),
  ) as typeof RESPONSABLE
}

// Página pública (con o sin sesión) con un documento legal.
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { t } = useTranslation()
  const text = legalTexts(owner(t('legal.pending')))[doc]

  return (
    <div className="min-h-dvh px-4 py-6 md:px-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="rounded-lg">
            <Logo />
          </Link>
          <Link to="/" className="min-h-11 content-center font-semibold text-ink underline underline-offset-4">
            {t('legal.back')}
          </Link>
        </header>
        <main id="contenido" className="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-5 sm:p-8">
          <div className="flex flex-col gap-1">
            <PageHeading title={text.title}>{text.title}</PageHeading>
            <p className="text-muted">{t('legal.updated', { date: LEGAL_UPDATED })}</p>
          </div>
          {text.sections.map((section) => (
            <section key={section.title} className="flex flex-col gap-2">
              <h2 className="text-lg font-bold text-ink">{section.title}</h2>
              {section.blocks.map((block, i) =>
                typeof block === 'string' ? (
                  <p key={i} className="leading-relaxed">
                    {block}
                  </p>
                ) : (
                  <ul key={i} className="flex list-disc flex-col gap-1 pl-6 leading-relaxed">
                    {block.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ),
              )}
            </section>
          ))}
        </main>
        <LegalLinks />
      </div>
    </div>
  )
}
