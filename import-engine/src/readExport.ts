// Reads AAFE's Give Lively ticket export (spec section 1) into validated purchase rows.
// One row per purchase. Columns are found by header name, ignoring case, spacing, and punctuation.

import Papa from 'papaparse'
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
 * Parse the export. Throws ExportFormatError when a required column is missing, or when a quote never closes
 * (everything after it would be read as one cell, so the rest of the file would vanish). Otherwise every row is
 * either accepted or rejected with its row number and reason, including a row whose column count doesn't match
 * the header and any row the CSV reader couldn't read cleanly; fully blank rows are skipped silently.
 */
export async function readExport(csv: string): Promise<ReadResult> {
  // One kind of line break: the CSV reader guesses it from the first line, so a file mixing Windows (\r\n) and plain
  // (\n) line breaks, e.g. after an edit in a text editor, would otherwise run two rows together.
  const parsed = Papa.parse<string[]>(csv.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'), { header: false, skipEmptyLines: false, newline: '\n' })
  const [header, ...records] = parsed.data
  if (!header) throw new ExportFormatError('the file is empty')
  // The CSV reader's own complaints (Oct 12 audit: they were ignored, so rows could vanish). Its `row` counts
  // from 0 at the header, so spreadsheet row = row + 1.
  const unclosed = parsed.errors.find((e) => e.code === 'MissingQuotes')
  if (unclosed) {
    throw new ExportFormatError(`row ${(unclosed.row ?? 0) + 1} has a quote (") that never closes, so the rows after it can't be read. ` +
      'Fix that cell in a spreadsheet, or export the file from Give Lively again.')
  }
  const readErrors = new Map<number, string>()
  for (const e of parsed.errors) if (e.row != null && e.row > 0) readErrors.set(e.row + 1, `couldn't read this row (${e.message})`)

  const columns = new Map<Field, number>()
  const phoneColumns = new Set<number>()
  header.forEach((h, i) => {
    const key = headerKey(h)
    const field = key.startsWith(GUEST_TEXT_PREFIX) ? 'guestText' : HEADERS[key]
    if (field === 'phone') phoneColumns.add(i)
    else if (field && !columns.has(field)) columns.set(field, i)
  })
  const missing = Object.entries(REQUIRED_COLUMNS).filter(([, f]) => !columns.has(f)).map(([label]) => label)
  if (missing.length) throw new ExportFormatError(`missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`)

  const rows: PurchaseRow[] = []
  const rejected: RejectedRow[] = []
  const seenKeys = new Map<string, number>()

  for (const [i, cells] of records.entries()) {
    const rowNumber = i + 2
    if (cells.every((c) => c.trim() === '')) continue
    const readError = readErrors.get(rowNumber)
    if (readError) { rejected.push({ rowNumber, reason: readError }); continue }
    // A comma outside quotes, or a line break that split a row, shifts every value after it into the wrong column.
    // Give Lively writes every column on every row, so a different count means the row can't be trusted. (Trailing
    // empty columns can't be let through: a shifted row ends in them too, because the export's last columns are blank.)
    if (cells.length !== header.length) {
      rejected.push({ rowNumber, reason: `has ${cells.length} columns but the header has ${header.length}, so its values may be in the wrong columns (a comma outside quotes, or a line break that split the row?)` })
      continue
    }
    const cell = (f: Field) => {
      const idx = columns.get(f)
      return idx === undefined ? '' : (cells[idx] ?? '')
    }

    const checked = RowSchema.safeParse({
      first: cell('first'), last: cell('last'), email: cell('email'), tierName: cell('tierName'),
      tierCategory: cell('tierCategory'), company: cell('company'), method: cell('method'), status: cell('status'),
      pageName: cell('pageName'), internalName: cell('internalName'), guestText: cell('guestText'),
    })
    if (!checked.success) {
      rejected.push({ rowNumber, reason: checked.error.issues.map((e) => e.message).join('; ') })
      continue
    }
    const r = checked.data

    let purchasedAt: string | null, gross: number | null, refunded: number | null, covered: number | null
    let quantity: number | null, seats: number | null
    try {
      purchasedAt = parsePurchaseTime(cell('purchasedAt'))
      gross = parseAmount(cell('gross'))
      refunded = parseAmount(cell('refunded'))
      covered = parseCoveredFee(cell('covered'))
      quantity = parseCount(cell('quantity'))
      seats = parseCount(cell('seats'))
    } catch (e) {
      if (!(e instanceof ValueError)) throw e
      rejected.push({ rowNumber, reason: e.message })
      continue
    }
    if (purchasedAt === null) { rejected.push({ rowNumber, reason: 'missing Date/Time of Purchase' }); continue }
    if (gross === null) { rejected.push({ rowNumber, reason: 'missing Amount Spent' }); continue }

    const key = await purchaseKey(r.email, purchasedAt)
    const firstRow = seenKeys.get(key)
    if (firstRow !== undefined) {
      rejected.push({ rowNumber, reason: `duplicate of row ${firstRow} (same buyer email and purchase time)` })
      continue
    }
    seenKeys.set(key, rowNumber)

    const raw: Record<string, string> = {}
    header.forEach((h, idx) => {
      if (!phoneColumns.has(idx)) raw[h] = cells[idx] ?? ''
    })

    rows.push({
      rowNumber,
      purchaseKey: key,
      purchasedAt,
      buyer: { first: r.first, last: r.last, email: r.email.toLowerCase() },
      company: r.company,
      tierName: r.tierName,
      tierCategory: r.tierCategory,
      quantity,
      seats,
      gross,
      refunded,
      covered,
      method: r.method,
      status: r.status,
      pageName: r.pageName,
      internalName: r.internalName,
      guestText: r.guestText,
      raw,
    })
  }

  const times = rows.map((r) => r.purchasedAt).sort()
  const dateRange = times.length ? { earliest: times[0]!, latest: times[times.length - 1]! } : null
  return { rows, rejected, dateRange }
}
