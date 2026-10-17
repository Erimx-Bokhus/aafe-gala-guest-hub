// Reads AAFE's Give Lively ticket export (spec section 1) into validated purchase rows.
// One row per purchase. Columns are found by header name, ignoring case, spacing, and punctuation.

import Papa, { type ParseError } from 'papaparse'
import { z } from 'zod'
import { purchaseKey } from './purchaseKey.ts'
import { parseAmount, parseCount, parseCoveredFee, parsePurchaseTime, ValueError } from './values.ts'

export type Field =
  | 'first' | 'last' | 'email' | 'tierName' | 'tierCategory' | 'quantity' | 'seats' | 'gross' | 'refunded'
  | 'covered' | 'purchasedAt' | 'method' | 'status' | 'pageName' | 'internalName' | 'company' | 'guestText'

/**
 * Normalized header → field. The guest-list question is matched by its start (GUEST_TEXT_PREFIX).
 * Phone columns are recognized only to be dropped: phones are never imported (spec section 1).
 */
const HEADERS: Record<string, Field | 'phone'> = {
  firstname: 'first',
  lastname: 'last',
  email: 'email',
  emailaddress: 'email',
  tierpurchased: 'tierName',
  tiercategory: 'tierCategory',
  ticketspurchased: 'quantity',
  totalseats: 'seats',
  amountspent: 'gross',
  amountrefunded: 'refunded',
  transactionfeecovered: 'covered',
  datetimeofpurchase: 'purchasedAt',
  paymentmethod: 'method',
  status: 'status',
  pagename: 'pageName',
  internalname: 'internalName',
  companyorganizationname: 'company',
  companyname: 'company',
  organizationname: 'company',
  phonenumber: 'phone',
  phone: 'phone',
}
const GUEST_TEXT_PREFIX = 'pleaselistthename'

export const REQUIRED_COLUMNS: Record<string, Field> = {
  'First Name': 'first',
  'Last Name': 'last',
  Email: 'email',
  'Tier Purchased': 'tierName',
  'Amount Spent': 'gross',
  'Date/Time of Purchase': 'purchasedAt',
}

const headerKey = (h: string) => h.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '')

export interface PurchaseRow {
  /** Row number as staff see it in a spreadsheet: the header is row 1. */
  rowNumber: number
  purchaseKey: string
  /** Purchase time in UTC, to the second ("2026-02-05T22:14:46Z"). */
  purchasedAt: string
  buyer: { first: string; last: string; email: string }
  company: string | null
  tierName: string
  tierCategory: string | null
  quantity: number | null
  seats: number | null
  gross: number
  refunded: number | null
  covered: number | null
  method: string | null
  status: string | null
  pageName: string | null
  internalName: string | null
  guestText: string | null
  /** Every column as exported, by header, except the phone number (never imported). */
  raw: Record<string, string>
}

export interface RejectedRow {
  rowNumber: number
  reason: string
}

export interface ReadResult {
  rows: PurchaseRow[]
  rejected: RejectedRow[]
  /** Earliest and latest purchase time among accepted rows, for the missing-purchase check. */
  dateRange: { earliest: string; latest: string } | null
}

/** The file can't be imported as it is. Its message ends without a period: the staff app shows it as
 *  "This file can't be imported: <message>." (staff-app/src/importer.ts, importProblem). */
export class ExportFormatError extends Error {}

const text = z.string().transform((s) => s.trim())
const required = (label: string) => text.pipe(z.string().min(1, `missing ${label}`))
const optional = text.transform((s) => (s === '' ? null : s))

const RowSchema = z.object({
  first: required('First Name'),
  last: required('Last Name'),
  email: required('Email').pipe(z.email(`unreadable email`)),
  tierName: required('Tier Purchased'),
  tierCategory: optional,
  company: optional,
  method: optional,
  status: optional,
  pageName: optional,
  internalName: optional,
  guestText: optional,
})

/**
 * Text that a spreadsheet program damaged, found by an Excel round-trip test (Oct 15): Excel opens a UTF-8 export
 * that has no byte-order mark in the wrong character set, so on saving, "Renée" comes back as "Ren��e" (or as "RenÃ©"
 * on a US-English Windows), "Đặng" as "�����ng", and Chinese names as "�" or stray control characters, in both of
 * Excel's CSV formats. Those names would go onto badges and into Salesforce as they are, and "�" can't be turned back.
 * Signs: the replacement character, control characters (other than tab and line breaks), and UTF-8 read as
 * Windows-1252 ("Ã©", "Ã±", "â€™"). None of them occur in a real name.
 */
// eslint-disable-next-line no-control-regex -- it looks for control characters on purpose: they only appear in damaged text
const DAMAGED_TEXT = /�|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]|[Â-Å][\u0080-¿]|â€/
const CHECKED_FIELDS: readonly Field[] = ['first', 'last', 'company', 'guestText', 'tierName']
const EXAMPLES = 3

/** Stops the upload when names in the file are damaged: the whole file went through the same save, so none of it can be trusted. */
function checkNotDamaged(records: string[][], columns: Map<Field, number>): void {
  const examples: string[] = []
  let count = 0
  for (const [i, cells] of records.entries()) {
    const bad = CHECKED_FIELDS.map((f) => cells[columns.get(f) ?? -1] ?? '').find((v) => DAMAGED_TEXT.test(v))
    if (bad === undefined) continue
    count++
    if (examples.length < EXAMPLES) examples.push(`row ${i + 2}: "${(bad.split('\n')[0] ?? '').trim().slice(0, 40)}"`)
  }
  if (count === 0) return
  throw new ExportFormatError(`names in this file are damaged (${examples.join(', ')}${count > EXAMPLES ? `, and ${count - EXAMPLES} more rows` : ''}). ` +
    'That happens when the export is opened and saved in Excel. Download the export from Give Lively again and upload it ' +
    'without opening it; to correct a name, correct it in the staff app after the import')
}

/**
 * Parse the export. Throws ExportFormatError when a required column is missing, when names in the file are damaged
 * (checkNotDamaged), or when a quote never closes
 * (everything after it would be read as one cell, so the rest of the file would vanish). Otherwise every row is
 * either accepted or rejected with its row number and reason, including a row whose column count doesn't match
 * the header and any row the CSV reader couldn't read cleanly; fully blank rows are skipped silently.
 */
export async function readExport(csv: string): Promise<ReadResult> {
  // One kind of line break: the CSV reader guesses it from the first line, so a file mixing Windows (\r\n) and plain
  // (\n) line breaks, e.g. after an edit in a text editor, would otherwise run two rows together.
  const parsed = Papa.parse<string[]>(csv.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'), { header: false, skipEmptyLines: false, newline: '\n' })
  const [header, ...records] = parsed.data
  if (!header) throw new ExportFormatError('the file is empty. Download the attendee export from Give Lively again')
  const readErrors = readerErrors(parsed.errors)
  const sheet = mapColumns(header)
  checkNotDamaged(records, sheet.columns)

  const rows: PurchaseRow[] = []
  const rejected: RejectedRow[] = []
  const seenKeys = new Map<string, number>()
  for (const [i, cells] of records.entries()) {
    const rowNumber = i + 2
    if (cells.every((c) => c.trim() === '')) continue
    const row = await readRow(cells, rowNumber, sheet, readErrors.get(rowNumber))
    if ('reason' in row) { rejected.push(row); continue }
    const firstRow = seenKeys.get(row.purchaseKey)
    if (firstRow !== undefined) {
      rejected.push({ rowNumber, reason: `duplicate of row ${firstRow} (same buyer email and purchase time)` })
      continue
    }
    seenKeys.set(row.purchaseKey, rowNumber)
    rows.push(row)
  }
  return { rows, rejected, dateRange: rangeOf(rows) }
}

/**
 * The CSV reader's own complaints (Oct 12 audit: they were ignored, so rows could vanish), by spreadsheet row. Its
 * `row` counts from 0 at the header, so spreadsheet row = row + 1. A quote that never closes stops the upload.
 */
function readerErrors(errors: ParseError[]): Map<number, string> {
  const unclosed = errors.find((e) => e.code === 'MissingQuotes')
  if (unclosed) {
    throw new ExportFormatError(`row ${(unclosed.row ?? 0) + 1} has a quote (") that never closes, so the rows after it can't be read. ` +
      'Export the file from Give Lively again and upload it without opening it')
  }
  const byRow = new Map<number, string>()
  for (const e of errors) if (e.row != null && e.row > 0) byRow.set(e.row + 1, `couldn't read this row (${e.message})`)
  return byRow
}

interface Sheet { header: string[]; columns: Map<Field, number>; phoneColumns: Set<number> }

/** Each field's column, found by header name; stops the upload if a required column is missing. */
function mapColumns(header: string[]): Sheet {
  const columns = new Map<Field, number>()
  const phoneColumns = new Set<number>()
  header.forEach((h, i) => {
    const key = headerKey(h)
    const field = key.startsWith(GUEST_TEXT_PREFIX) ? 'guestText' : HEADERS[key]
    if (field === 'phone') phoneColumns.add(i)
    else if (field && !columns.has(field)) columns.set(field, i)
  })
  const missing = Object.entries(REQUIRED_COLUMNS).filter(([, f]) => !columns.has(f)).map(([label]) => label)
  if (missing.length) {
    throw new ExportFormatError(`missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Check that this is Give Lively's attendee export`)
  }
  return { header, columns, phoneColumns }
}

/** One row, as a purchase or as the reason it's rejected. */
async function readRow(cells: string[], rowNumber: number, sheet: Sheet, readError: string | undefined): Promise<PurchaseRow | RejectedRow> {
  if (readError) return { rowNumber, reason: readError }
  // A comma outside quotes, or a line break that split a row, shifts every value after it into the wrong column.
  // Give Lively writes every column on every row, so a different count means the row can't be trusted. (Trailing
  // empty columns can't be let through: a shifted row ends in them too, because the export's last columns are blank.)
  if (cells.length !== sheet.header.length) {
    return { rowNumber, reason: `has ${cells.length} columns but the header has ${sheet.header.length}, so its values may be in the wrong columns (a comma outside quotes, or a line break that split the row?)` }
  }
  const cell = (f: Field) => cells[sheet.columns.get(f) ?? -1] ?? ''
  const checked = RowSchema.safeParse({
    first: cell('first'), last: cell('last'), email: cell('email'), tierName: cell('tierName'),
    tierCategory: cell('tierCategory'), company: cell('company'), method: cell('method'), status: cell('status'),
    pageName: cell('pageName'), internalName: cell('internalName'), guestText: cell('guestText'),
  })
  if (!checked.success) return { rowNumber, reason: checked.error.issues.map((e) => e.message).join('; ') }
  const v = readValues(cell)
  if ('reason' in v) return { rowNumber, reason: v.reason }
  const r = checked.data
  return {
    rowNumber, purchaseKey: await purchaseKey(r.email, v.purchasedAt), purchasedAt: v.purchasedAt,
    buyer: { first: r.first, last: r.last, email: r.email.toLowerCase() }, company: r.company,
    tierName: r.tierName, tierCategory: r.tierCategory, quantity: v.quantity, seats: v.seats,
    gross: v.gross, refunded: v.refunded, covered: v.covered, method: r.method, status: r.status,
    pageName: r.pageName, internalName: r.internalName, guestText: r.guestText, raw: rawCells(sheet, cells),
  }
}

type Values = Pick<PurchaseRow, 'purchasedAt' | 'gross' | 'refunded' | 'covered' | 'quantity' | 'seats'>

/** The row's date, amounts and counts, or the reason one can't be read. */
function readValues(cell: (f: Field) => string): Values | { reason: string } {
  try {
    const purchasedAt = parsePurchaseTime(cell('purchasedAt'))
    const gross = parseAmount(cell('gross'))
    const refunded = parseAmount(cell('refunded'))
    const covered = parseCoveredFee(cell('covered'))
    const quantity = parseCount(cell('quantity'))
    const seats = parseCount(cell('seats'))
    if (purchasedAt === null) return { reason: 'missing Date/Time of Purchase' }
    if (gross === null) return { reason: 'missing Amount Spent' }
    return { purchasedAt, gross, refunded, covered, quantity, seats }
  } catch (e) {
    if (!(e instanceof ValueError)) throw e
    return { reason: e.message }
  }
}

/** Every column as exported, by header, except the phone number (never imported). */
function rawCells(sheet: Sheet, cells: string[]): Record<string, string> {
  const raw: Record<string, string> = {}
  sheet.header.forEach((h, idx) => {
    if (!sheet.phoneColumns.has(idx)) raw[h] = cells[idx] ?? ''
  })
  return raw
}

/** Earliest and latest purchase time among accepted rows, for the missing-purchase check. */
function rangeOf(rows: PurchaseRow[]): ReadResult['dateRange'] {
  const times = rows.map((r) => r.purchasedAt).sort()
  const [earliest] = times
  const latest = times.at(-1)
  return earliest !== undefined && latest !== undefined ? { earliest, latest } : null
}
