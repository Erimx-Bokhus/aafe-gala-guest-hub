// The Give Lively upload, on the staff app's side (docs/import-matching-spec.md). The import engine (import-engine/) reads the
// export and decides what each row means, in the browser; staff_import_givelively() is still the only place that writes.
// This file gives the engine what it needs from the gala's data, in demo and live mode alike.
import { levelsOf } from '@shared/data'
import {
  GalaPageNotSetError, prepareUpload, tierMappingKey, toGlImport,
  type GlImportRow, type GlImportRun, type PreparedUpload, type UploadContext,
} from '../../../import-engine/src/index.ts'
import type { DB, ReviewReason } from '@shared/types'

export { GalaPageNotSetError, tierMappingKey, type GlImportRow, type GlImportRun, type PreparedUpload }

/** What staff_import_givelively() returns (and the demo, in the same shape). */
export interface ImportResult {
  created: number; updated: number; skipped: number; needs_review: number; unknown_tier: number
  names_prefilled: number; review_items: number; missing_from_source: number; run_id: string
  /** $0 or blank-amount purchases, each left for staff as a zero_amount review item (none created). */
  zero_amount?: number
}

/** The engine's view of this gala: its page, packages, tier mappings, sponsors, guests, and purchases already imported. */
export function importContext(db: DB): UploadContext {
  const ev = db.gala_events.find((e) => e.id === db.meta.current_event_id)
  const orders = db.orders.filter((o) => o.event_id === db.meta.current_event_id)
  const orderIds = new Set(orders.map((o) => o.id))
  const bought = db.payments.filter((p) => p.purchase_key && orderIds.has(p.order_id))
  return {
    galaPageName: ev?.givelively_page_name ?? null,
    tiers: levelsOf(db).map((t) => ({ id: t.id, name: t.name, tierCategory: t.tier_category, includedSeatCount: t.included_seat_count })),
    tierMappings: (db.tier_mappings ?? []).filter((m) => m.event_id === db.meta.current_event_id).map((m) => ({ givelivelyName: m.givelively_name, tierId: m.tier_id })),
    sponsors: db.sponsors.map((s) => ({ id: s.id, organizationName: s.organization_name, primaryContactName: s.primary_contact_name, primaryContactEmail: s.primary_contact_email })),
    existingGuests: db.guests.filter((g) => orderIds.has(g.order_id))
      .map((g) => ({ id: g.id, orderId: g.order_id, displayName: `${g.first_name} ${g.last_name}`.trim(), email: g.email || null, organization: g.organization || null })),
    previousPurchases: bought.map((p) => ({ purchaseKey: p.purchase_key!, purchasedAt: p.received_at, cancelled: orders.find((o) => o.id === p.order_id)?.status === 'cancelled' })),
    orderIdByPurchaseKey: Object.fromEntries(bought.map((p) => [p.purchase_key!, p.order_id])),
  }
}

/** Read an export and get it ready for the database: the report to show, and the two arguments to send. */
export async function prepareImport(csv: string, fileName: string, db: DB): Promise<{ prepared: PreparedUpload; rows: GlImportRow[]; run: GlImportRun }> {
  const prepared = await prepareUpload(csv, importContext(db))
  const { rows, run } = await toGlImport(prepared, fileName, csv)
  return { prepared, rows, run }
}

/** What staff can decide for each kind of close call (the hub's Import page, "When something needs a person"). */
export const REVIEW: Record<ReviewReason, { label: string; choices: [string, string] | null }> = {
  unknown_tier: { label: 'Unknown ticket type', choices: null },   // closed by linking the tier name to a package
  possible_duplicate: { label: 'Possible duplicate', choices: ['Same person', 'Different people'] },
  email_name_conflict: { label: 'Shared email', choices: ['Same person', 'Different people'] },
  double_booked: { label: 'Guest under two sponsors', choices: ['Keep on one order', 'Keep on both'] },
  refund: { label: 'Refund', choices: ['Keep seats cancelled', 'Reinstate'] },
  missing_from_source: { label: 'Missing from the export', choices: ['Cancel the seats', 'Keep (partial export)'] },
  guest_text_changed: { label: 'Guest list changed in Give Lively', choices: ['Keep the current names', 'Use the new list'] },
  zero_amount: { label: '$0 purchase', choices: ['Added as comps', 'Not a guest'] },
}

// ---- A small invented export for demo mode (hard rule 1: example.org emails, 555-01xx phones) ----

const HEADERS = ['First Name', 'Last Name', 'Email', 'Tier Purchased', 'Tier Category', 'Tickets Purchased', 'Total Seats',
  'Amount Spent', 'Amount Refunded', 'Transaction Fee Covered', 'Date/Time of Purchase', 'Referrer URL', 'Payment Method', 'Status',
  'UTM Source', 'Page Name', 'Internal Name', 'Client Application Name', 'Double the Donation', 'Company/Organization Name', 'Phone Number',
  'Please list the name(s) and email address(es) of all guests. To revise, email gala@aafe.org.', 'Address 1', 'City', 'State', 'Zip']
const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** Four purchases in Give Lively's export format: two tickets with guest names, a refund, and one from another page. */
export function sampleExport(db: DB): { csv: string; fileName: string } {
  const sponsorTier = levelsOf(db).find((t) => t.tier_category === 'sponsorship' && t.included_seat_count >= 4)
  const page = "AAFE's 53rd Annual Gala"
  const row = (r: Record<string, string>) => HEADERS.map((h) => cell(r[h] ?? '')).join(',')
  const base = { 'Payment Method': 'Stripe Card', Status: 'succeeded', 'Page Name': page, 'Amount Refunded': '$0.00', 'Transaction Fee Covered': '$0.00' }
  const rows = [
    { ...base, 'First Name': 'Mina', 'Last Name': 'Park', Email: 'mina.park@sample.example.org', 'Tier Purchased': 'Ticket', 'Tier Category': 'Ticket',
      'Tickets Purchased': '2', 'Total Seats': '2', 'Amount Spent': '$500.00', 'Date/Time of Purchase': '2027-02-03 07:12:09 PM EST',
      'Phone Number': '(212) 555-0131', 'Please list the name(s) and email address(es) of all guests. To revise, email gala@aafe.org.': 'Mina Park\nDaniel Okoye daniel.okoye@sample.example.org' },
    ...(sponsorTier ? [{ ...base, 'First Name': 'Lena', 'Last Name': 'Ortiz', Email: 'lena.ortiz@harbor-sample.example.org', 'Tier Purchased': sponsorTier.name,
      'Tier Category': 'Sponsorship', 'Tickets Purchased': '1', 'Total Seats': String(sponsorTier.included_seat_count),
      'Amount Spent': `$${sponsorTier.contribution_amount.toLocaleString('en-US')}.00`, 'Date/Time of Purchase': '2027-02-04 10:41:55 AM EST',
      'Company/Organization Name': 'Harbor Sample Partners', 'Phone Number': '(212) 555-0132',
      'Please list the name(s) and email address(es) of all guests. To revise, email gala@aafe.org.': 'TBD' }] : []),
    { ...base, 'First Name': 'Owen', 'Last Name': 'Reyes', Email: 'owen.reyes@sample.example.org', 'Tier Purchased': 'Ticket', 'Tier Category': 'Ticket',
      'Tickets Purchased': '1', 'Total Seats': '1', 'Amount Spent': '$250.00', 'Amount Refunded': '$250.00', Status: 'refunded',
      'Date/Time of Purchase': '2027-02-06 03:30:00 PM EST', 'Phone Number': '(212) 555-0133' },
    { ...base, 'First Name': 'Ivy', 'Last Name': 'Chen', Email: 'ivy.chen@sample.example.org', 'Tier Purchased': 'Ticket', 'Tier Category': 'Ticket',
      'Tickets Purchased': '1', 'Total Seats': '1', 'Amount Spent': '$40.00', 'Date/Time of Purchase': '2027-02-07 11:05:00 AM EST',
      'Page Name': 'AAFE Spring Benefit Raffle', 'Phone Number': '(212) 555-0134' },
  ]
  return { csv: [HEADERS.map(cell).join(','), ...rows.map(row)].join('\n'), fileName: 'givelively-sample-SYNTHETIC.csv' }
}
