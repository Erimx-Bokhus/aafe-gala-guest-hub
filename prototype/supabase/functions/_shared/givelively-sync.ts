// What givelively-sync does with each donation Give Lively returns, kept apart from Deno.serve and the
// Supabase client so Node can test it (scripts/test-givelively-sync.mts). The edge function passes in
// two calls: import one row (the gl_import database function) and record the raw donation (givelively_raw).
import { classify, normalize, type GLRow } from './givelively.ts'

/** Re-read the last 10 minutes on each poll; imports are idempotent, so overlap is safe. */
export const OVERLAP_MS = 10 * 60 * 1000

/** Where the next poll starts reading: null (everything) on the first run. */
export const pollStart = (cursorMs: number | null | undefined) => (cursorMs ? cursorMs - OVERLAP_MS : null)

/** An error message with the API key taken out: a network error can quote the request URL, which contains the key. */
export const withoutKey = (message: string, key: string) =>
  key ? message.replaceAll(encodeURIComponent(key), '***').replaceAll(key, '***') : message

export interface ImportResult { created: number; updated: number; skipped: number; needs_review: number }
export interface RawRecord {
  transaction_id: string; payload: unknown; last_seen_at: string; import_status: string; import_note: string | null
}
export interface SyncPorts {
  /** cancel_only: a failed donation; gl_import may cancel a purchase it imported earlier, never create one. */
  importRow(row: GLRow & { cancel_only?: boolean }): Promise<{ data: ImportResult | null; error: string | null }>
  saveRaw(rec: RawRecord): Promise<void>
}
export type SyncCounts = Record<'seen' | 'created' | 'updated' | 'skipped' | 'needs_review' | 'failed' | 'not_gala' | 'not_settled' | 'unmapped', number>

/**
 * Classifies each donation against this gala's page name and imports the gala purchases.
 * - not_gala: another campaign; ignored and not stored.
 * - not_settled (pending, processing): stored as skipped; it imports on a later poll once settled.
 * - failed (failed, declined, cancelled, a returned bank payment): sent to gl_import as cancel_only. A purchase
 *   imported earlier is cancelled (order, seats, unsent link email, a staff review item); one never imported
 *   creates nothing.
 * - unmapped (no transaction ID or date): stored, keyed by its content, so staff can see it once.
 * - A row the database refuses is stored as unmapped with the error, and the rest carry on.
 */
export async function syncDonations(donations: unknown[], campaigns: string[], ports: SyncPorts, now = () => new Date()): Promise<SyncCounts> {
  const counts: SyncCounts = { seen: donations.length, created: 0, updated: 0, skipped: 0, needs_review: 0, failed: 0, not_gala: 0, not_settled: 0, unmapped: 0 }
  for (const raw of donations) {
    const row = normalize(raw)
    const verdict = classify(row, campaigns)
    let status: string = verdict, note: string | null = null
    if (verdict === 'import' || verdict === 'failed') {
      const { data, error } = await ports.importRow(verdict === 'failed' ? { ...row, cancel_only: true } : row)
      if (error || !data) { status = 'unmapped'; note = error ?? 'No result from gl_import'; counts.unmapped++ }
      else {
        for (const k of ['created', 'updated', 'skipped', 'needs_review'] as const) counts[k] += data[k]
        status = data.created ? 'imported' : data.updated ? 'updated' : 'skipped'
        if (data.needs_review) note = 'Imported; flagged for review in Payments.'
        if (verdict === 'failed') {
          counts.failed++
          note = data.updated ? `Status "${row.status}" in Give Lively: the purchase imported earlier is cancelled, with its seats.`
            : `Status "${row.status}"; nothing to undo (never imported, or already cancelled).`
        }
      }
    } else counts[verdict]++
    if (status === 'not_gala') continue
    // Unmapped rows have no reliable ID; key them by content so they are still recorded once.
    await ports.saveRaw({
      transaction_id: row.txn || `unmapped-${await sha256(JSON.stringify(raw))}`,
      payload: raw, last_seen_at: now().toISOString(),
      import_status: status === 'not_settled' ? 'skipped' : status,
      import_note: note ?? (status === 'not_settled' ? `Status "${row.status}"; will import once settled.` : null),
    })
  }
  return counts
}

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24)
}
