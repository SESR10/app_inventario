import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useCompany } from '../company/context'
import { Alert } from '../components/ui/Alert'
import { Button, LinkButton } from '../components/ui/Button'
import { SelectField } from '../components/ui/SelectField'
import { TextField } from '../components/ui/TextField'
import { formatNumber } from '../lib/format'
import { useSupabase } from '../lib/client-context'
import { existingSkus, IMPORT_BATCH, importBatch, type ImportResult } from './api'
import { FIELDS, guessMapping, MAX_LENGTH, NUMBER_FIELDS, type FieldKey, type Mapping } from './fields'
import { downloadWorkbook, readSheet, today, type SheetData } from './sheet'
import { reviewRows, skusInFile, type ImportRecord, type Issue, type Review } from './validate'

const MAX_FILE_MB = 20
const MAX_ISSUES_SHOWN = 100
const PREVIEW_ROWS = 10

type Step = 'file' | 'map' | 'review' | 'importing' | 'done'

interface Progress {
  done: number
  total: number
  failed: boolean
  result: ImportResult
}

const columnLetter = (index: number) => {
  let letter = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter
  return letter
}

// Asistente de importación: archivo → columnas → revisión → importación por lotes.
export function ImportWizard() {
  const { t } = useTranslation()
  const client = useSupabase()
  const { current } = useCompany()
  const companyId = current!.company.id

  const [step, setStep] = useState<Step>('file')
  const [fileName, setFileName] = useState('')
  const [sheet, setSheet] = useState<SheetData | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [mapping, setMapping] = useState<Mapping>(() => guessMapping([]))
  const [updateExisting, setUpdateExisting] = useState(true)
  const [mapError, setMapError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [review, setReview] = useState<Review | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  // Al cambiar de paso, el foco va al título del paso para que el lector de pantalla lo anuncie.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [step])

  const columns = (field: FieldKey) => t(`importExport.columns.${field}`)

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setFileError(null)
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setFileError(t('importExport.fileTooBig', { max: MAX_FILE_MB }))
      return
    }
    setReading(true)
    try {
      const data = await readSheet(file)
      if (data.rows.length === 0) {
        setFileError(t('importExport.fileEmpty'))
        return
      }
      setFileName(file.name)
      setSheet(data)
      setMapping(guessMapping(data.headers))
      setMapError(null)
      setStep('map')
    } catch {
      setFileError(t('importExport.fileError'))
    } finally {
      setReading(false)
    }
  }

  function restart() {
    setSheet(null)
    setReview(null)
    setProgress(null)
    setStep('file')
  }

  async function handleReview() {
    if (!sheet) return
    const chosen = FIELDS.map((f) => mapping[f]).filter((c) => c !== null)
    const repeated = chosen.find((c, i) => chosen.indexOf(c) !== i)
    if (repeated !== undefined) {
      setMapError(t('importExport.duplicateMapping', { header: sheet.headers[repeated] }))
      return
    }
    if (mapping.name === null && !(mapping.sku !== null && updateExisting)) {
      setMapError(t('importExport.nameOrSkuRequired'))
      return
    }
    setMapError(null)
    setChecking(true)
    try {
      const existing = await existingSkus(client, companyId, skusInFile(sheet.rows, mapping))
      setReview(reviewRows(sheet.rows, mapping, existing, updateExisting))
      setStep('review')
    } catch {
      setMapError(t('importExport.reviewError'))
    } finally {
      setChecking(false)
    }
  }

  async function runImport(queue: ImportRecord[], start: Progress) {
    let state = { ...start, failed: false }
    setProgress(state)
    setStep('importing')
    for (let i = state.done; i < queue.length; i += IMPORT_BATCH) {
      try {
        const result = await importBatch(client, companyId, queue.slice(i, i + IMPORT_BATCH), updateExisting)
        state = {
          ...state,
          done: Math.min(i + IMPORT_BATCH, queue.length),
          result: {
            created: state.result.created + result.created,
            updated: state.result.updated + result.updated,
            skipped: state.result.skipped + result.skipped,
          },
        }
        setProgress(state)
      } catch {
        setProgress({ ...state, failed: true })
        return
      }
    }
    setStep('done')
  }

  const queue = review ? [...review.toCreate, ...review.toUpdate] : []

  function startImport() {
    if (!review) return
    void runImport(queue, {
      done: 0,
      total: queue.length,
      failed: false,
      result: { created: 0, updated: 0, skipped: review.skipped },
    })
  }

  const problemText = (issue: Issue) =>
    t(`importExport.problems.${issue.problem}`, { value: issue.value, max: MAX_LENGTH[issue.field] })

  function downloadErrors() {
    if (!review) return
    void downloadWorkbook(`${t('importExport.files.errors')}-${today()}.xlsx`, [
      {
        name: t('importExport.files.errorsSheet'),
        rows: [
          [t('importExport.colRow'), t('importExport.colColumn'), t('importExport.colProblem')],
          ...review.issues.map((i) => [i.row, columns(i.field), problemText(i)]),
        ],
        widths: [8, 16, 80],
      },
    ])
  }

  const heading = (key: string) => (
    <h3 ref={headingRef} tabIndex={-1} className="text-lg font-semibold focus:outline-none">
      {t(key)}
    </h3>
  )

  if (step === 'file') {
    return (
      <div className="flex flex-col gap-3">
        {heading('importExport.step1')}
        <TextField
          type="file"
          label={t('importExport.file')}
          hint={t('importExport.fileHint', { max: MAX_FILE_MB })}
          accept=".xlsx,.xls,.csv,.ods"
          onChange={handleFile}
          error={fileError}
          disabled={reading}
          className="max-w-xl"
        />
        <div aria-live="polite">{reading && <p>{t('importExport.reading')}</p>}</div>
      </div>
    )
  }

  if (step === 'map' && sheet) {
    const mappedSku = mapping.sku !== null
    return (
      <div className="flex flex-col gap-4">
        {heading('importExport.step2')}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="font-medium">{t('importExport.fileSummary', { name: fileName, count: sheet.rows.length })}</p>
          <Button variant="ghost" onClick={restart} className="px-0">
            {t('importExport.changeFile')}
          </Button>
        </div>
        <p className="text-muted">{t('importExport.mapIntro')}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map((field) => (
            <SelectField
              key={field}
              label={columns(field)}
              value={mapping[field] ?? ''}
              onChange={(e) =>
                setMapping((m) => ({ ...m, [field]: e.target.value === '' ? null : Number(e.target.value) }))
              }
            >
              <option value="">{t('importExport.notImported')}</option>
              {sheet.headers.map((header, index) => (
                <option key={index} value={index}>
                  {t('importExport.column', { header, letter: columnLetter(index) })}
                </option>
              ))}
            </SelectField>
          ))}
        </div>
        {mappedSku && (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 font-medium">{t('importExport.existingLegend')}</legend>
            {[true, false].map((value) => (
              <label key={String(value)} className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name="existentes"
                  className="size-5 accent-brand-700"
                  checked={updateExisting === value}
                  onChange={() => setUpdateExisting(value)}
                />
                {t(value ? 'importExport.existingUpdate' : 'importExport.existingSkip')}
              </label>
            ))}
          </fieldset>
        )}
        {mapError && <Alert tone="error">{mapError}</Alert>}
        <Button onClick={handleReview} busy={checking} className="self-start">
          {t('importExport.review')}
        </Button>
      </div>
    )
  }

  if (step === 'review' && review) {
    const shownFields = FIELDS.filter((f) => mapping[f] !== null)
    const preview = queue.slice(0, PREVIEW_ROWS)
    const summary = [
      ['summaryCreate', review.toCreate.length],
      ['summaryUpdate', review.toUpdate.length],
      ['summarySkip', review.skipped],
      ['summaryErrors', review.rowsWithErrors],
    ] as const
    return (
      <div className="flex flex-col gap-4">
        {heading('importExport.step3')}
        <section aria-labelledby="resumen-titulo" className="flex flex-col gap-1">
          <h4 id="resumen-titulo" className="font-semibold">
            {t('importExport.summaryTitle')}
          </h4>
          <ul className="list-disc pl-6">
            {summary
              .filter(([key, count]) => count > 0 || key === 'summaryCreate')
              .map(([key, count]) => (
                <li key={key} className={key === 'summaryErrors' ? 'font-medium text-danger' : ''}>
                  {t(`importExport.${key}`, { count })}
                </li>
              ))}
          </ul>
        </section>

        {review.issues.length > 0 && (
          <section aria-labelledby="errores-titulo" className="flex flex-col gap-2">
            <h4 id="errores-titulo" className="font-semibold">
              {t('importExport.errorsTitle')}
            </h4>
            <p className="text-muted">{t('importExport.errorsHelp')}</p>
            <div
              role="region"
              aria-label={t('importExport.errorsRegion')}
              tabIndex={0}
              className="max-h-80 overflow-auto rounded-md border border-line"
            >
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-100">
                  <tr>
                    <th scope="col" className="px-3 py-2">{t('importExport.colRow')}</th>
                    <th scope="col" className="px-3 py-2">{t('importExport.colColumn')}</th>
                    <th scope="col" className="px-3 py-2">{t('importExport.colProblem')}</th>
                  </tr>
                </thead>
                <tbody>
                  {review.issues.slice(0, MAX_ISSUES_SHOWN).map((issue, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-3 py-2">{issue.row}</td>
                      <td className="px-3 py-2">{columns(issue.field)}</td>
                      <td className="px-3 py-2">{problemText(issue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {review.issues.length > MAX_ISSUES_SHOWN && (
              <p className="text-sm text-muted">
                {t('importExport.errorsShown', { shown: MAX_ISSUES_SHOWN, total: review.issues.length })}
              </p>
            )}
            <Button variant="secondary" onClick={downloadErrors} className="self-start">
              {t('importExport.downloadErrors')}
            </Button>
          </section>
        )}

        {preview.length > 0 && (
          <section aria-labelledby="vista-previa-titulo" className="flex flex-col gap-2">
            <h4 id="vista-previa-titulo" className="font-semibold">
              {t('importExport.previewTitle', { count: preview.length })}
            </h4>
            <div
              role="region"
              aria-label={t('importExport.previewRegion')}
              tabIndex={0}
              className="overflow-x-auto rounded-md border border-line"
            >
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    {shownFields.map((f) => (
                      <th key={f} scope="col" className="whitespace-nowrap px-3 py-2">
                        {columns(f)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((record, i) => (
                    <tr key={i} className="border-t border-line">
                      {shownFields.map((f) => (
                        <td key={f} className={`px-3 py-2 ${NUMBER_FIELDS.includes(f) ? 'text-right' : ''}`}>
                          {typeof record[f] === 'number' ? formatNumber(record[f]) : record[f]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {queue.length === 0 && <Alert>{t('importExport.nothingToImport')}</Alert>}
        <div className="flex flex-wrap gap-3">
          <Button onClick={startImport} disabled={queue.length === 0}>
            {t('importExport.import', { count: queue.length })}
          </Button>
          <Button variant="secondary" onClick={() => setStep('map')}>
            {t('importExport.back')}
          </Button>
        </div>
      </div>
    )
  }

  if (step === 'importing' && progress) {
    return (
      <div className="flex flex-col gap-3">
        {heading('importExport.step3')}
        <label htmlFor="progreso-importacion" className="font-medium">
          {t('importExport.progressLabel')}
        </label>
        <progress id="progreso-importacion" max={progress.total} value={progress.done} className="h-3 w-full max-w-xl" />
        <p role="status">
          {t('importExport.importing', { done: formatNumber(progress.done), total: formatNumber(progress.total) })}
        </p>
        {progress.failed && (
          <>
            <Alert tone="error">
              {t('importExport.importError', { done: formatNumber(progress.done), total: formatNumber(progress.total) })}
            </Alert>
            <Button onClick={() => void runImport(queue, progress)} className="self-start">
              {t('importExport.retry')}
            </Button>
          </>
        )}
      </div>
    )
  }

  if (step === 'done' && progress) {
    const { created, updated, skipped } = progress.result
    return (
      <div className="flex flex-col gap-3">
        {heading('importExport.step3')}
        <Alert tone="success">
          {t('importExport.done', {
            created: formatNumber(created),
            updated: formatNumber(updated),
            skipped: formatNumber(skipped),
          })}
        </Alert>
        <div className="flex flex-wrap gap-3">
          <LinkButton to="/productos">{t('importExport.viewProducts')}</LinkButton>
          <Button variant="secondary" onClick={restart}>
            {t('importExport.importAnother')}
          </Button>
        </div>
      </div>
    )
  }

  return null
}
