// Shared data access. Today: synthetic seed.json held in memory.
// Tomorrow: replace loadDB()/mutations with Supabase queries + RPCs (see docs/WORKFLOW.md).
import small from './seed.json'
import fullAsSent from './seed.full-as-sent.json'
import fullFixed from './seed.full-fixed.json'
import type { AuditEntry, DB, GuestType, PayMethod } from './types'

// The three labeled demo data sets (decisions Oct 7-8), one at a time. The same sets load into Supabase
// with npm run db:load -- <set>.
export const DEMO_SET_LABEL = { small: 'Small demo', 'full-as-sent': 'Full gala, as sent', 'full-fixed': 'Full gala, fixed' } as const
export type DemoSet = keyof typeof DEMO_SET_LABEL
const DEMO_DATA: Record<DemoSet, unknown> = { small, 'full-as-sent': fullAsSent, 'full-fixed': fullFixed }
const DEMO_KEY = 'aafe-demo-data'
export function demoSet(): DemoSet {
  try { const v = window.localStorage.getItem(DEMO_KEY); if (v && v in DEMO_SET_LABEL) return v as DemoSet } catch { /* storage blocked */ }
  return 'small'
}
/** Switch sets: saved in this browser, then the page reloads with it. Where storage is blocked (sandboxed previews) the small set stays. */
export function chooseDemoSet(s: DemoSet) {
  try { window.localStorage.setItem(DEMO_KEY, s) } catch { return }
  window.location.reload()
}
export const loadDB = (): DB => structuredClone(DEMO_DATA[demoSet()]) as DB
export const nowIso = () => new Date().toISOString()
export const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 9)}` // record IDs only; never for secrets
/** Secret token (sponsor links, QR codes): 128 random bits from the browser's secure generator, base64url. */
export function secureToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
/** QR code value: 'AAFE-' + 32 hex characters (128 bits), same format as the backend's new_qr_token(). */
export const newQrToken = () => 'AAFE-' + Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()

// Give Lively third-party (Stripe) rates for qualified nonprofits — https://www.givelively.org/fees-and-disbursement
export function processorFee(method: PayMethod, gross: number) {
  const r = (x: number) => Math.round(x * 100) / 100
  if (method === 'card') return r(gross * 0.022 + 0.3)
  if (method === 'amex') return r(gross * 0.035)
  if (method === 'givelively_ach') return r(Math.min(gross * 0.008, 5))
  return 0
}

export const METHOD_LABEL: Record<PayMethod, string> = {
  card: 'Card (Give Lively)', amex: 'Amex (Give Lively)', givelively_ach: 'Bank/ACH (Give Lively)',
  check: 'Check (mailed)', ach_direct: 'ACH to AAFE bank', wire: 'Wire',
}

export function addAudit(db: DB, e: Omit<AuditEntry, 'id' | 'at'> & { at?: string }): DB {
  const id = (db.audit_log.at(-1)?.id ?? 0) + 1
  return { ...db, audit_log: [...db.audit_log, { id, at: e.at ?? nowIso(), ...e }] }
}

export const GUEST_TYPE_LABEL: Record<GuestType, string> = {
  sponsor_guest: 'Sponsor guest', ticket_holder: 'Ticket holder', comp_relationship: 'Guest of AAFE', government_vip: 'Government or VIP',
  aafe_staff: 'AAFE staff', event_volunteer: 'Event volunteer', event_staff: 'Event staff',
}
/** Whether a guest came through a sponsor or ticket purchase (and so has a sponsor to show). */
export const hasSponsor = (t: GuestType) => t === 'sponsor_guest' || t === 'ticket_holder'

export const tierOf = (db: DB, id: string) => db.sponsorship_tiers.find((t) => t.id === id)!
/** A gala's sponsorship levels, in order (one list per gala, decided Oct 14). Retired levels only when asked for. */
export const levelsOf = (db: DB, eventId: string = db.meta.current_event_id, withRetired = false) =>
  db.sponsorship_tiers.filter((t) => (t.event_id ?? db.meta.current_event_id) === eventId && (withRetired || !t.retired))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
export const sponsorOf = (db: DB, id: string) => db.sponsors.find((s) => s.id === id)!
/** A guest's printed name: the display name, or "First Last" for guests saved before display names (the database backfills the same). */
export const displayName = (g: { display_name?: string | null; first_name: string; last_name: string }) =>
  g.display_name?.trim() || [g.first_name, g.last_name].map((x) => (x ?? '').trim()).filter(Boolean).join(' ')
/** name_parts() in backend.sql: fill in whatever part of a name is missing. The apps send the name engine's split; this
 *  fallback (last word = last name) is only for a full name sent alone. One word: no last name. */
export function nameParts(display: string | null | undefined, first: string | null | undefined, last: string | null | undefined) {
  const f = (first ?? '').trim(), l = (last ?? '').trim()
  const d = (display ?? '').replace(/\s+/g, ' ').trim() || [f, l].filter(Boolean).join(' ')
  if (f || l) return { display: d, first: f, last: l }
  const i = d.lastIndexOf(' ')
  return i < 0 ? { display: d, first: d, last: '' } : { display: d, first: d.slice(0, i), last: d.slice(i + 1) }
}
export const staffName = (db: DB, id: string) => db.staff_users.find((s) => s.id === id)?.name ?? id

export function orderMoney(db: DB, orderId: string) {
  const o = db.orders.find((x) => x.id === orderId)!
  const pays = db.payments.filter((p) => p.order_id === orderId).sort((a, b) => a.received_at.localeCompare(b.received_at))
  const paid = pays.reduce((s, p) => s + p.gross_amount, 0)
  const applied = pays.reduce((s, p) => s + p.original_amount, 0)
  const fees = pays.reduce((s, p) => s + p.transaction_fee_amount, 0)
  const net = pays.reduce((s, p) => s + p.net_amount, 0)
  const balance = Math.max(0, o.commitment_amount - applied)
  return { pays, paid, fees, net, balance, commitment: o.commitment_amount }
}

export function seatStats(db: DB, orderId: string) {
  const seats = db.seats.filter((s) => s.order_id === orderId && s.status !== 'cancelled')
  const named = seats.filter((s) => s.status !== 'unnamed').length
  return {
    total: seats.length, named, unnamed: seats.length - named,
    needsReview: seats.filter((s) => s.status === 'submitted').length,
    badgeReady: seats.filter((s) => s.status === 'badge_ready' || s.status === 'checked_in').length,
  }
}
