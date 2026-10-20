import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useCompany } from '../company/context'
import { Alert } from '../components/ui/Alert'
import { Button, LinkButton } from '../components/ui/Button'
import { Checkbox } from '../components/ui/Checkbox'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { deleteProducts } from '../products/api'
import { SelectField } from '../components/ui/SelectField'
import { TextField } from '../components/ui/TextField'
import { formatNumber } from '../lib/format'
import { useSupabase } from '../lib/client-context'
import { existingSkus, IMPORT_BATCH, importBatch, loadFormat, saveFormat, type ImportResult } from './api'
import {
  detectHeaderRow, FIELDS, friendlyKey, guessMapping, MAX_LENGTH, normalizeHeader, NUMBER_FIELDS, type FieldKey, type Mapping,
} from './fields'
import {
  columnLetter, countRowsWithData, downloadWorkbook, readWorkbook, sheetData, today, type Cell, type SheetData,
  type WorkbookSheet,
} from './sheet'
import {
  columnStats, countBoxesInNames, countCategoryRows, reviewRows, skusInFile, type ImportRecord, type Issue,
  type Review,
} from './validate'

const MAX_FILE_MB = 20
const MAX_ISSUES_SHOWN = 100
const PREVIEW_ROWS = 10
// Hasta cuántas columnas extra se guardan por producto, y filas que se ofrecen como fila de títulos.
const MAX_EXTRA = 30
const HEADER_CHOICES = 30

type Step = 'file' | 'map' | 'review' | 'importing' | 'done'

interface Progress {
  done: number
  total: number
  failed: boolean
  result: ImportResult
  // Id de esta importación: marca los productos nuevos para poder deshacerla.
  importId: string
}

// Identifica el formato del archivo por sus títulos, para recordar qué columna es cuál.
const formatSignature = (headers: string[]) => headers.map(normalizeHeader).join('|').slice(0, 4000)

const rowPreview = (row: Cell[] = []) =>
  row
    .filter((c) => c != null && String(c).trim() !== '')
    .slice(0, 4)
    .map((c) => String(c).trim().slice(0, 24))
    .join(' · ')

// Asistente de importación: archivo → columnas → revisión → importación por lotes.
export function ImportWizard() {
  const { t } = useTranslation()
  const client = useSupabase()
  const { current } = useCompany()
  const companyId = current!.company.id

  const [step, setStep] = useState<Step>('file')
  const [fileName, setFileName] = useState('')
  const [workbook, setWorkbook] = useState<WorkbookSheet[]>([])
  const [sheetIndex, setSheetIndex] = useState(0)
  const [headerRow, setHeaderRow] = useState(0)
  const [sheet, setSheet] = useState<SheetData | null>(null)
  const [stats, setStats] = useState<ReturnType<typeof columnStats>[]>([])
  const [extraColumns, setExtraColumns] = useState<Set<number>>(new Set())
  const [extraNames, setExtraNames] = useState<Record<number, string>>({})
  const [boxFromName, setBoxFromName] = useState(true)
  const [showFixed, setShowFixed] = useState(false)
  const [categoryRows, setCategoryRows] = useState(false)
  const [usedSaved, setUsedSaved] = useState(false)
  const [fixes, setFixes] = useState<Record<string, string>>({})
  const [undo, setUndo] = useState<'confirm' | 'busy' | 'done' | 'error' | null>(null)
  const [undone, setUndone] = useState(0)
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

  const categoryCount = useMemo(() => (sheet ? countCategoryRows(sheet.rows) : 0), [sheet])
  const boxCount = useMemo(() => (sheet ? countBoxesInNames(sheet.rows, mapping) : 0), [sheet, mapping])

  // Abre una hoja: busca la fila de títulos, propone las columnas y, si este formato ya se importó
  // antes en la empresa, usa lo que se eligió esa vez.
  async function openSheet(sheets: WorkbookSheet[], index: number, row?: number) {
    const cells = sheets[index].cells
    const titleRow = row ?? detectHeaderRow(cells).row
    const data = sheetData(cells, titleRow)
    const info = data.headers.map((_, c) => columnStats(data.rows, c))
    let nextMapping = guessMapping(
      data.headers,
      info.map((i) => i.useful),
    )
    const mapped = new Set(Object.values(nextMapping))
    // Se proponen como "Otros datos" las columnas que cambian de un producto a otro (no las vacías ni las fijas).
    let extras = info.flatMap((i, c) => (!mapped.has(c) && i.distinct >= 2 ? [c] : [])).slice(0, MAX_EXTRA)
    let names: Record<number, string> = {}
    let update = true
    let categories = countCategoryRows(data.rows) >= 2 && nextMapping.category === null
    let boxes = true
    const saved = await loadFormat(client, companyId, formatSignature(data.headers)).catch(() => null)
    if (saved) {
      const byTitle = (title: string) => {
        const c = data.headers.indexOf(title)
        return c >= 0 ? c : null
      }
      nextMapping = Object.fromEntries(FIELDS.map((f) => [f, saved.mapping[f] ? byTitle(saved.mapping[f]) : null])) as Mapping
      const kept = saved.extra.flatMap((e) => {
        const c = byTitle(e.column)
        return c === null ? [] : [{ c, as: e.as }]
      })
      extras = kept.map((k) => k.c)
      names = Object.fromEntries(kept.map((k) => [k.c, k.as]))
      update = saved.updateExisting
      categories = saved.categoryRows
      boxes = saved.boxFromName ?? true
    }
    setSheetIndex(index)
    setHeaderRow(titleRow)
    setSheet(data)
    setStats(info)
    setMapping(nextMapping)
    setExtraColumns(new Set(extras))
    setExtraNames(names)
    setBoxFromName(boxes)
    setUpdateExisting(update)
    setCategoryRows(categories)
    setUsedSaved(saved !== null)
    setMapError(null)
  }

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
      const sheets = await readWorkbook(file)
      if (sheets.length === 0) {
        setFileError(t('importExport.fileEmpty'))
        return
      }
      // La hoja que más parece una lista de productos (más títulos reconocidos y luego más filas).
      const scores = sheets.map((s) => detectHeaderRow(s.cells).score)
      const best = sheets.reduce(
        (b, s, i) => (scores[i] > scores[b] || (scores[i] === scores[b] && s.cells.length > sheets[b].cells.length) ? i : b),
        0,
      )
      setFileName(file.name)
      setWorkbook(sheets)
      await openSheet(sheets, best)
      setStep('map')
    } catch {
      setFileError(t('importExport.fileError'))
    } finally {
      setReading(false)
    }
  }

  function restart() {
    setSheet(null)
    setWorkbook([])
    setFixes({})
    setReview(null)
    setProgress(null)
    setUndo(null)
    setStep('file')
  }

  const mappedColumns = new Set(FIELDS.map((f) => mapping[f]).filter((c) => c !== null))
  const extraOptions = sheet
    ? sheet.headers.flatMap((header, c) => (!mappedColumns.has(c) && stats[c]?.filled > 0 ? [{ c, header }] : []))
    : []
  const defaultName = (c: number) => {
    const header = sheet?.headers[c] ?? ''
    const key = sheet ? friendlyKey(header, sheet.headers) : null
    return key ? t(`importExport.friendly.${key}`) : header
  }
  const extraName = (c: number) => (extraNames[c] ?? '').trim() || defaultName(c)
  const chosenExtra = extraOptions.filter((o) => extraColumns.has(o.c))
  // Columnas con el mismo valor en todas las filas (como un código de impuesto): se ocultan salvo que se pidan.
  const fixedCount = extraOptions.filter((o) => stats[o.c].distinct < 2 && !extraColumns.has(o.c)).length
  const shownExtra = showFixed ? extraOptions : extraOptions.filter((o) => stats[o.c].distinct >= 2 || extraColumns.has(o.c))

  async function handleReview(data: SheetData | null = sheet) {
    if (!data) return
    const sheet = data
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
      setReview(
        reviewRows(sheet.rows, mapping, existing, updateExisting, {
          firstRow: sheet.firstRow,
          extraColumns: chosenExtra.map((o) => ({ column: o.c, title: extraName(o.c) })),
          categoryRows,
          boxFromName:
            boxFromName && boxCount > 0 ? { box: t('importExport.boxName'), piece: t('importExport.pieceName') } : null,
        }),
      )
      setFixes({})
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
        const result = await importBatch(client, companyId, queue.slice(i, i + IMPORT_BATCH), updateExisting, state.importId)
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

  // Cambia en las filas leídas los datos corregidos en pantalla y vuelve a revisar.
  function applyFixes() {
    if (!sheet) return
    const rows = [...sheet.rows]
    for (const [key, value] of Object.entries(fixes)) {
      const [index, column] = key.split(':').map(Number)
      rows[index] = [...rows[index]]
      rows[index][column] = value
    }
    const data = { ...sheet, rows }
    setSheet(data)
    void handleReview(data)
  }

  function startImport() {
    if (!review || !sheet) return
    const titles = Object.fromEntries(
      FIELDS.flatMap((f) => (mapping[f] === null ? [] : [[f, sheet.headers[mapping[f]!]]])),
    )
    void saveFormat(client, companyId, formatSignature(sheet.headers), {
      sheet: workbook[sheetIndex]?.name ?? '',
      headerRow,
      mapping: titles,
      extra: chosenExtra.map((o) => ({ column: o.header, as: extraName(o.c) })),
      updateExisting,
      categoryRows,
      boxFromName,
    }).catch(() => undefined)
    void runImport(queue, {
      done: 0,
      total: queue.length,
      failed: false,
      result: { created: 0, updated: 0, skipped: review.skipped },
      importId: crypto.randomUUID(),
    })
  }

  async function undoImport() {
    if (!progress) return
    setUndo('busy')
    try {
      const { deleted } = await deleteProducts(client, companyId, { importId: progress.importId })
      setUndone(deleted)
      setUndo('done')
    } catch {
      setUndo('error')
    }
  }

  // Un valor de ejemplo de la columna, para reconocerla aunque el título sea un código ("marnom" → CORONA).
  const exampleValue = (c: number) => {
    const cell = sheet?.rows.find((r) => r[c] != null && r[c] !== false && /[\p{L}\p{N}]/u.test(String(r[c])))?.[c]
    return cell == null ? '' : String(typeof cell === 'number' ? formatNumber(cell) : cell).trim().slice(0, 30)
  }

  const cellValue = (issue: Issue) => {
    const cell = sheet?.rows[issue.index]?.[issue.column!]
    return cell == null ? '' : String(cell)
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
          <p className="font-medium">
            {t('importExport.fileSummary', { name: fileName, count: countRowsWithData(sheet.rows) })}
          </p>
          <Button variant="ghost" onClick={restart} className="px-0">
            {t('importExport.changeFile')}
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {workbook.length > 1 && (
            <SelectField
              label={t('importExport.sheet')}
              hint={t('importExport.sheetHint')}
              value={sheetIndex}
              onChange={(e) => void openSheet(workbook, Number(e.target.value))}
            >
              {workbook.map((w, i) => (
                <option key={w.name} value={i}>
                  {t('importExport.sheetOption', { name: w.name, count: w.cells.length })}
                </option>
              ))}
            </SelectField>
          )}
          <SelectField
            label={t('importExport.headerRow')}
            hint={t('importExport.headerRowHint')}
            value={headerRow}
            onChange={(e) => void openSheet(workbook, sheetIndex, Number(e.target.value))}
          >
            {workbook[sheetIndex]?.cells.slice(0, HEADER_CHOICES).map((row, i) => {
              const preview = rowPreview(row)
              return preview ? (
                <option key={i} value={i}>
                  {t('importExport.headerRowOption', { row: i + 1, preview })}
                </option>
              ) : null
            })}
          </SelectField>
        </div>
        {usedSaved && <Alert tone="success">{t('importExport.savedFormat')}</Alert>}
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
                  {exampleValue(index)
                    ? t('importExport.columnExample', { header, letter: columnLetter(index), example: exampleValue(index) })
                    : t('importExport.column', { header, letter: columnLetter(index) })}
                </option>
              ))}
            </SelectField>
          ))}
        </div>
        {extraOptions.length > 0 && (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 font-medium">{t('importExport.extraLegend')}</legend>
            <p className="text-sm text-muted">{t('importExport.extraHint', { max: MAX_EXTRA })}</p>
            <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {shownExtra.map(({ c, header }) => (
                <li key={c} className="flex flex-col gap-1">
                  <Checkbox
                    label={t('importExport.extraColumn', {
                      header,
                      letter: columnLetter(c),
                      example: exampleValue(c),
                    })}
                    checked={extraColumns.has(c)}
                    disabled={!extraColumns.has(c) && chosenExtra.length >= MAX_EXTRA}
                    onChange={(e) =>
                      setExtraColumns((prev) => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(c)
                        else next.delete(c)
                        return next
                      })
                    }
                  />
                  {extraColumns.has(c) && (
                    <TextField
                      label={t('importExport.extraName', { header })}
                      value={extraNames[c] ?? defaultName(c)}
                      maxLength={60}
                      onChange={(e) => setExtraNames((n) => ({ ...n, [c]: e.target.value }))}
                      className="ml-7"
                    />
                  )}
                </li>
              ))}
            </ul>
            {fixedCount > 0 && (
              <Button variant="ghost" onClick={() => setShowFixed((v) => !v)} className="self-start px-0">
                {showFixed ? t('importExport.hideFixed') : t('importExport.showFixed', { count: fixedCount })}
              </Button>
            )}
          </fieldset>
        )}
        {boxCount > 0 && (
          <Checkbox
            label={t('importExport.boxFromName', { count: boxCount })}
            checked={boxFromName}
            onChange={(e) => setBoxFromName(e.target.checked)}
          />
        )}
        {categoryCount > 0 && (
          <Checkbox
            label={t('importExport.categoryRows', { count: categoryCount })}
            checked={categoryRows}
            onChange={(e) => setCategoryRows(e.target.checked)}
          />
        )}
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
        <Button onClick={() => void handleReview()} busy={checking} className="self-start">
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
      ['summaryCategories', review.categories],
      ['summaryIgnored', review.ignored],
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
            {Object.keys(fixes).length > 0 && (
              <Button onClick={applyFixes} busy={checking} className="self-start">
                {t('importExport.applyFixes', { count: Object.keys(fixes).length })}
              </Button>
            )}
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
                    <th scope="col" className="px-3 py-2">{t('importExport.colFix')}</th>
                  </tr>
                </thead>
                <tbody>
                  {review.issues.slice(0, MAX_ISSUES_SHOWN).map((issue, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-3 py-2">{issue.row}</td>
                      <td className="px-3 py-2">{columns(issue.field)}</td>
                      <td className="px-3 py-2">{problemText(issue)}</td>
                      <td className="px-3 py-1">
                        {issue.column !== null && (
                          <input
                            aria-label={t('importExport.fixLabel', { row: issue.row, column: columns(issue.field) })}
                            className="min-h-11 w-full min-w-32 rounded-lg border border-slate-500 bg-white px-2 text-base hover:border-brand-700"
                            value={fixes[`${issue.index}:${issue.column}`] ?? cellValue(issue)}
                            onChange={(e) =>
                              setFixes((f) => ({ ...f, [`${issue.index}:${issue.column}`]: e.target.value }))
                            }
                          />
                        )}
                      </td>
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
                    {chosenExtra.length > 0 && (
                      <th scope="col" className="whitespace-nowrap px-3 py-2">
                        {t('importExport.previewExtra')}
                      </th>
                    )}
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
                      {chosenExtra.length > 0 && (
                        <td className="min-w-48 px-3 py-2">
                          {Object.entries(record.extra ?? {})
                            .map(([k, v]) => `${k}: ${typeof v === 'number' ? formatNumber(v) : v}`)
                            .join(' · ')}
                        </td>
                      )}
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
        {undo === 'done' ? (
          <Alert tone="success">{t('importExport.undone', { count: undone })}</Alert>
        ) : (
          <Alert tone="success">
            {t('importExport.done', {
              created: formatNumber(created),
              updated: formatNumber(updated),
              skipped: formatNumber(skipped),
            })}
          </Alert>
        )}
        {undo === 'error' && <Alert tone="error">{t('importExport.undoError')}</Alert>}
        <div className="flex flex-wrap gap-3">
          <LinkButton to="/productos">{t('importExport.viewProducts')}</LinkButton>
          <Button variant="secondary" onClick={restart}>
            {t('importExport.importAnother')}
          </Button>
          {created > 0 && undo !== 'done' && (
            <Button variant="secondary" onClick={() => setUndo('confirm')}>
              {t('importExport.undo')}
            </Button>
          )}
        </div>
        <ConfirmDialog
          open={undo === 'confirm' || undo === 'busy'}
          title={t('importExport.undoTitle')}
          body={t('importExport.undoBody', { count: created })}
          confirmLabel={t('importExport.undoConfirm', { count: created })}
          cancelLabel={t('importExport.undoCancel')}
          busy={undo === 'busy'}
          onConfirm={() => void undoImport()}
          onCancel={() => undo !== 'busy' && setUndo(null)}
        />
      </div>
    )
  }

  return null
}
