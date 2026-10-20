// Reports (decided Oct 14): CSV downloads AAFE opens in Excel or Google Sheets and charts itself; no charts in the app.
// LIVE: staff_report_* in database/backend.sql return the rows, check the caller's role and log the download.
// DEMO: the builders below make the same rows from the demo data, so both modes download the same file.
// The CSV layouts turn rows into spreadsheet columns; downloadCsv (shared/src/ui.tsx) writes them, with the formula guard.
import { GUEST_TYPE_LABEL, displayName } from '@shared/data'
import { ACCESSIBILITY_OPTIONS, DIETARY_OPTIONS, needStatus, parseAccessibilityNeeds, parseDietaryNeeds } from '@shared/guestNeeds'
import type { DB, GuestType } from '@shared/types'
import { NOTICE } from './exports'

type Category = GuestType | 'walk_in'
export interface AttendanceRow {
  name: string; first_name: string | null; last_name: string; email: string | null; title: string | null; organization: string | null; category: Category
  sponsor: string | null; buyer_type: 'Individual' | 'Organization' | null; level: string | null; committed: number | null; paid: number | null; table: number | null
  came: boolean; checked_in_at: string | null; method: string | null; device: string | null; checked_in_by: string | null; walk_in_reason?: string | null
}
export interface SponsorRow {
  sponsor: string; buyer_type: 'Individual' | 'Organization'; contact: string; contact_email: string; relationship_manager: string | null
  level: string; kind: string; source: string; status: string; committed: number; paid: number; refunded: number; balance: number; paid_by: string | null
  guests_included: number; guests_named: number; guests_came: number; walk_ins: number; logo: string; program_ad: string; created: string
}
export interface NeedsRow { name: string; last_name: string; organization: string | null; sponsor: string; category: GuestType; table: number | null; dietary_needs: string | null; accessibility_needs: string | null }
export interface PaymentRow {
  received: string; sponsor: string; level: string; method: string; check_number: string | null; amount: number; fee_covered_by_donor: number; gross: number
  /** Null: not known yet (AAFE's ticket export has no fee column), so the cell is left blank, not $0 (Gate 1). */
  processor_fee: number | null; refunded: number; net: number | null; givelively_transaction: string | null; recorded_by: string | null; reconciliation: string
  /** The wallet behind a card payment (Apple Pay, Google Pay, PayPal, Venmo, Donor-advised fund). */
  method_detail?: string | null
}
export interface GuestRow {
  name: string; first_name: string; last_name: string; title: string | null; organization: string | null; email: string | null; category: GuestType; sponsor: string
  level: string; table: number | null; name_status: string | null; badge: string; dietary_needs: string | null; accessibility_needs: string | null
  relationship_note: string | null; came: boolean; source: string; added: string; updated: string
}

// ---- Shared bits, matching the database's report_ny and report_paid ----

/** "2027-05-20 19:04", New York time, 24-hour, like report_ny(): sorts as text, and spreadsheets read it as a date and time. */
export function ny(iso: string | null | undefined): string | null {
  if (!iso) return null
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`
}
const paidOf = (db: DB, orderId: string) => db.payments.filter((p) => p.order_id === orderId).reduce((t, p) => t + Math.max(Number(p.original_amount) - Number(p.refunded_amount), 0), 0)
const nameOf = (g: DB['guests'][number]) => displayName(g)
const byText = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').localeCompare(b ?? '')

function gala(db: DB) {
  const cur = db.meta.current_event_id
  const orders = db.orders.filter((o) => o.event_id === cur)
  const live = new Map(orders.filter((o) => o.status !== 'cancelled').map((o) => [o.id, o]))
  const sponsor = (id: string) => db.sponsors.find((s) => s.id === id)
  const tier = (id: string) => db.sponsorship_tiers.find((t) => t.id === id)
  const table = (id: string | null) => db.event_tables.find((t) => t.id === id)?.number ?? null
  const buyerType = (o: DB['orders'][number]): 'Individual' | 'Organization' => {
    const s = sponsor(o.sponsor_id)
    return tier(o.tier_id)?.tier_category === 'ticket' && s?.organization_name === s?.primary_contact_name ? 'Individual' : 'Organization'
  }
  return { cur, orders, live, sponsor, tier, table, buyerType }
}

// ---- Demo builders (same rows as the staff_report_* functions) ----

export function demoAttendance(db: DB): AttendanceRow[] {
  const { cur, live, sponsor, tier, table, buyerType } = gala(db)
  const guests = db.guests.filter((g) => live.has(g.order_id)).map((g): AttendanceRow => {
    const o = live.get(g.order_id)!, c = db.check_ins.find((x) => x.guest_id === g.id && x.event_id === cur)
    return { name: nameOf(g), first_name: g.first_name, last_name: g.last_name, email: g.email || null, title: g.title, organization: g.organization, category: g.guest_type,
      sponsor: sponsor(o.sponsor_id)?.organization_name ?? null, buyer_type: buyerType(o), level: tier(o.tier_id)?.name ?? null, committed: o.commitment_amount, paid: paidOf(db, o.id),
      table: table(g.table_id), came: !!c, checked_in_at: ny(c?.checked_in_at), method: c?.method ?? null, device: c?.device ?? null, checked_in_by: c?.checked_in_by ?? null }
  })
  const walkIns = db.check_ins.filter((c) => c.event_id === cur && !c.guest_id).map((c): AttendanceRow => {
    const o = c.order_id ? db.orders.find((x) => x.id === c.order_id) : undefined
    return { name: c.arrival_name ?? '', first_name: null, last_name: c.arrival_name ?? '', email: null, title: null, organization: null, category: 'walk_in',
      sponsor: o ? sponsor(o.sponsor_id)?.organization_name ?? null : null, buyer_type: null, level: o ? tier(o.tier_id)?.name ?? null : null, committed: null, paid: null,
      table: null, came: true, checked_in_at: ny(c.checked_in_at), method: c.method, device: c.device ?? null, checked_in_by: c.checked_in_by, walk_in_reason: c.type }
  })
  return [...guests, ...walkIns].sort((a, b) => byText(a.last_name, b.last_name) || byText(a.first_name, b.first_name))
}

export function demoSponsors(db: DB): SponsorRow[] {
  const { cur, orders, sponsor, tier, buyerType } = gala(db)
  return orders.filter((o) => tier(o.tier_id)?.tier_category !== 'complimentary').map((o): SponsorRow => {
    const s = sponsor(o.sponsor_id), t = tier(o.tier_id), pays = db.payments.filter((p) => p.order_id === o.id), paid = paidOf(db, o.id)
    const seats = db.seats.filter((x) => x.order_id === o.id && x.status !== 'cancelled'), ins = db.check_ins.filter((c) => c.order_id === o.id && c.event_id === cur)
    return { sponsor: s?.organization_name ?? '', buyer_type: buyerType(o), contact: s?.primary_contact_name ?? '', contact_email: s?.primary_contact_email ?? '',
      relationship_manager: db.staff_users.find((u) => u.id === s?.relationship_owner_id)?.name ?? null, level: t?.name ?? '', kind: t?.tier_category ?? '', source: o.source, status: o.status,
      committed: o.commitment_amount, paid, refunded: pays.reduce((x, p) => x + Number(p.refunded_amount), 0), balance: o.status === 'cancelled' || o.status === 'comp' ? 0 : Math.max(o.commitment_amount - paid, 0),
      paid_by: [...new Set(pays.map((p) => p.method))].sort().join(', ') || null, guests_included: seats.length, guests_named: seats.filter((x) => x.guest_id).length,
      guests_came: ins.filter((c) => c.guest_id).length, walk_ins: ins.filter((c) => !c.guest_id).length, logo: o.logo_status, program_ad: o.program_ad_status, created: ny(o.created_at) ?? '' }
  }).sort((a, b) => b.committed - a.committed || byText(a.sponsor, b.sponsor))
}

export function demoNeeds(db: DB): NeedsRow[] {
  const { live, sponsor, table } = gala(db)
  return db.guests.filter((g) => live.has(g.order_id)).map((g): NeedsRow => ({ name: nameOf(g), last_name: g.last_name, organization: g.organization,
    sponsor: sponsor(live.get(g.order_id)!.sponsor_id)?.organization_name ?? '', category: g.guest_type, table: table(g.table_id),
    dietary_needs: g.dietary_needs, accessibility_needs: g.accessibility_needs }))
    .sort((a, b) => byText(a.sponsor, b.sponsor) || byText(a.last_name, b.last_name))
}

export function demoPayments(db: DB): PaymentRow[] {
  const { orders, sponsor, tier } = gala(db)
  const ids = new Map(orders.map((o) => [o.id, o]))
  return db.payments.filter((p) => ids.has(p.order_id)).sort((a, b) => a.received_at.localeCompare(b.received_at)).map((p): PaymentRow => {
    const o = ids.get(p.order_id)!
    return { received: ny(p.received_at) ?? '', sponsor: sponsor(o.sponsor_id)?.organization_name ?? '', level: tier(o.tier_id)?.name ?? '', method: p.method, check_number: p.check_number,
      amount: p.original_amount, fee_covered_by_donor: p.covered_fee_amount, gross: p.gross_amount, processor_fee: p.transaction_fee_amount, refunded: p.refunded_amount, net: p.net_amount, method_detail: p.method_detail ?? null,
      givelively_transaction: p.givelively_transaction_id, recorded_by: db.staff_users.find((u) => u.id === p.recorded_by)?.name ?? p.recorded_by, reconciliation: p.reconciliation_status }
  })
}

export function demoGuests(db: DB): GuestRow[] {
  const { live, sponsor, tier, table } = gala(db)
  return db.guests.filter((g) => live.has(g.order_id)).map((g): GuestRow => {
    const o = live.get(g.order_id)!
    return { name: nameOf(g), first_name: g.first_name, last_name: g.last_name, title: g.title, organization: g.organization, email: g.email || null, category: g.guest_type,
      sponsor: sponsor(o.sponsor_id)?.organization_name ?? '', level: tier(o.tier_id)?.name ?? '', table: table(g.table_id),
      name_status: db.seats.find((s) => s.guest_id === g.id && s.status !== 'cancelled')?.status ?? null, badge: g.badge_status, dietary_needs: g.dietary_needs,
      accessibility_needs: g.accessibility_needs, relationship_note: g.relationship_note, came: g.attendance_status === 'checked_in', source: g.last_updated_by,
      added: ny(g.created_at) ?? '', updated: ny(g.updated_at) ?? '' }
  }).sort((a, b) => byText(a.last_name, b.last_name) || byText(a.first_name, b.first_name))
}

// ---- CSV layouts: plain labels, money as numbers, yes as "Yes" ----

const yes = (b: boolean) => (b ? 'Yes' : 'No')
const CATEGORY = (c: Category) => (c === 'walk_in' ? 'Walk-in' : GUEST_TYPE_LABEL[c])
const SOURCE: Record<string, string> = { givelively: 'Give Lively', check: 'Check', ach_direct: 'ACH to AAFE', wire: 'Wire', comp: 'Complimentary', staff_entry: 'Staff entry' }
const STATUS: Record<string, string> = { pledged: 'Pledged', invoice_sent: 'Invoice sent', partially_paid: 'Partly paid', paid: 'Paid', comp: 'Complimentary', cancelled: 'Cancelled' }
const METHOD: Record<string, string> = { card: 'Card', amex: 'Amex', givelively_ach: 'Bank (Give Lively)', check: 'Check', ach_direct: 'ACH to AAFE', wire: 'Wire' }
const KIND: Record<string, string> = { sponsorship: 'Sponsorship', ticket: 'Ticket', advertising_only: 'Advertising only' }
const material = (m: string) => ({ not_required: 'Not needed', pending: 'Waiting', received: 'Received', approved: 'Approved' } as Record<string, string>)[m] ?? m

export const attendanceCsv = (rows: AttendanceRow[], synthetic = true) => [...(synthetic ? [NOTICE] : []),
  ['Name', 'First', 'Last', 'Email', 'Title', 'Organization', 'Category', 'Sponsor or buyer', 'Individual or organization', 'Level', "Sponsor's commitment", 'Sponsor paid to date', 'Table',
    'Came', 'Checked in at', 'How', 'iPad', 'Checked in by', 'Walk-in reason'],
  ...rows.map((r) => [r.name, r.first_name, r.last_name, r.email, r.title, r.organization, CATEGORY(r.category), r.sponsor, r.buyer_type, r.level, r.committed, r.paid, r.table,
    yes(r.came), r.checked_in_at, r.method === 'qr' ? 'QR scan' : r.method === 'search' ? 'Name search' : r.method === 'exception' ? 'At the door' : r.method, r.device, r.checked_in_by, r.walk_in_reason ?? null])]

export const sponsorsCsv = (rows: SponsorRow[], synthetic = true) => [...(synthetic ? [NOTICE] : []),
  ['Sponsor or buyer', 'Individual or organization', 'Contact', 'Contact email', 'Relationship manager', 'Level', 'Kind', 'Paid through', 'Status', 'Committed', 'Paid',
    'Refunded', 'Balance', 'Payment methods', 'Guests included', 'Guests named', 'Guests who came', 'Walk-ins', 'Logo', 'Program ad', 'Added'],
  ...rows.map((r) => [r.sponsor, r.buyer_type, r.contact, r.contact_email, r.relationship_manager, r.level, KIND[r.kind] ?? r.kind, SOURCE[r.source] ?? r.source, STATUS[r.status] ?? r.status,
    r.committed, r.paid, r.refunded, r.balance, r.paid_by?.split(', ').map((m) => METHOD[m] ?? m).join(', ') ?? null, r.guests_included, r.guests_named, r.guests_came, r.walk_ins,
    material(r.logo), material(r.program_ad), r.created])]

/** One column per choice, so a spreadsheet counts each with one click; "Other" notes and who hasn't answered too. */
export const needsCsv = (rows: NeedsRow[], synthetic = true) => [...(synthetic ? [NOTICE] : []),
  ['Name', 'Organization', 'Sponsor', 'Category', 'Table', 'Food answered', ...DIETARY_OPTIONS, 'Food: other', 'Access answered', ...ACCESSIBILITY_OPTIONS, 'Access: other'],
  ...rows.map((r) => {
    const d = parseDietaryNeeds(r.dietary_needs ?? ''), a = parseAccessibilityNeeds(r.accessibility_needs ?? '')
    const answered = (v: string | null) => ({ none: 'No needs', some: 'Yes', unanswered: 'Not answered' })[needStatus(v)]
    return [r.name, r.organization, r.sponsor, GUEST_TYPE_LABEL[r.category], r.table, answered(r.dietary_needs),
      ...DIETARY_OPTIONS.map((o) => ((d.selected as string[]).includes(o) ? 'Yes' : '')), d.otherDetails || ((d.selected as string[]).includes('Other') ? 'Yes' : ''),
      answered(r.accessibility_needs), ...ACCESSIBILITY_OPTIONS.map((o) => ((a.selected as string[]).includes(o) ? 'Yes' : '')), a.otherDetails || ((a.selected as string[]).includes('Other') ? 'Yes' : '')]
  })]

export const paymentsCsv = (rows: PaymentRow[], synthetic = true) => [...(synthetic ? [NOTICE] : []),
  ['Received', 'Sponsor or buyer', 'Level', 'Method', 'Check number', 'Amount', 'Fee covered by donor', 'Gross', 'Processor fee', 'Refunded', 'Net to AAFE', 'Give Lively transaction', 'Recorded by', 'Reconciled'],
  ...rows.map((r) => [r.received, r.sponsor, r.level, (METHOD[r.method] ?? r.method) + (r.method_detail ? ` (${r.method_detail})` : ''), r.check_number, r.amount, r.fee_covered_by_donor, r.gross, r.processor_fee, r.refunded, r.net,
    r.givelively_transaction, r.recorded_by, r.reconciliation === 'matched' ? 'Yes' : r.reconciliation === 'needs_review' ? 'Needs review' : 'Not yet'])]

export const guestsCsv = (rows: GuestRow[], synthetic = true) => [...(synthetic ? [NOTICE] : []),
  ['Name', 'First', 'Last', 'Title', 'Organization', 'Email', 'Category', 'Sponsor or buyer', 'Level', 'Table', 'Name status', 'Badge', 'Food', 'Accessibility', 'Relationship note',
    'Came', 'Added by', 'Added', 'Updated'],
  ...rows.map((r) => [r.name, r.first_name, r.last_name, r.title, r.organization, r.email, GUEST_TYPE_LABEL[r.category], r.sponsor, r.level, r.table, r.name_status, r.badge,
    r.dietary_needs, r.accessibility_needs, r.relationship_note, yes(r.came),
    ({ guest_portal: 'Sponsor (portal)', staff: 'Staff', givelively_sync: 'Give Lively' } as Record<string, string>)[r.source] ?? r.source, r.added, r.updated])]
