// What the staff app sends to the database after prepareUpload (spec section 9):
// `staff_import_givelively(p_rows, p_run)` in prototype/database/backend.sql.

import type { PreparedRow, PreparedUpload } from './prepareUpload.ts'
import type { PurchaseRow } from './readExport.ts'

/** One row in the shape `gl_import()` reads. */
export interface GlImportRow {
  purchase_key: string
  date: string
  first: string
  last: string
  email: string
  company: string | null
  campaign: string | null
  ticket_level: string
  tier_id?: string
  method: string | null
  status: string | null
  quantity: number | null
  seats?: number
  original: number
  covered: number | null
  gross: number
  refunded: number | null
  cancelled?: boolean
}

/** The run summary `staff_import_givelively()` stores with the upload. */
export interface GlImportRun {
  file_name: string
  file_hash: string
  earliest: string | null
  latest: string | null
  missing: { purchase_key: string; purchased_at: string }[]
  report: PreparedUpload['report']
}

function baseRow(r: PurchaseRow): GlImportRow {
  return {
    purchase_key: r.purchaseKey,
    date: r.purchasedAt,
    first: r.buyer.first,
    last: r.buyer.last,
    email: r.buyer.email,
    company: r.company,
    campaign: r.pageName ?? r.internalName,
    ticket_level: r.tierName,
    method: r.method,
    status: r.status,
    quantity: r.quantity,
    // Assumption until AAFE's samples confirm it: Amount Spent includes the fee the donor chose to cover.
    original: r.gross - (r.covered ?? 0),
    covered: r.covered,
    gross: r.gross,
    refunded: r.refunded,
  }
}

function preparedRow(r: PreparedRow): GlImportRow {
  return { ...baseRow(r), tier_id: r.tierId, seats: r.seatCount, cancelled: r.cancelled }
}

/** SHA-256 of the file text, so a run records exactly which file was uploaded. */
export async function fileHash(csv: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(csv))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Turn a prepared upload into the two arguments of `staff_import_givelively`. Rows waiting on a tier
 * mapping are included without a tier, so the database records their `unknown_tier` review.
 */
export async function toGlImport(prepared: PreparedUpload, fileName: string, csv: string): Promise<{ rows: GlImportRow[]; run: GlImportRun }> {
  const rows = [...prepared.rows.map(preparedRow), ...prepared.pendingTier.map(baseRow)]
  const missing = prepared.report.reviewItems
    .filter((i) => i.reason === 'missing_from_source')
    .map((i) => ({ purchase_key: i.purchaseKey, purchased_at: String(i.details.purchasedAt) }))
  return {
    rows,
    run: {
      file_name: fileName,
      file_hash: await fileHash(csv),
      earliest: prepared.report.dateRange?.earliest ?? null,
      latest: prepared.report.dateRange?.latest ?? null,
      missing,
      report: prepared.report,
    },
  }
}
