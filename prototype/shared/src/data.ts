// Shared data access. Today: synthetic seed.json held in memory.
// Tomorrow: replace loadDB()/mutations with Supabase queries + RPCs (see docs/WORKFLOW.md).
import seed from './seed.json'
import type { AuditEntry, DB, PayMethod } from './types'

export const loadDB = (): DB => structuredClone(seed) as unknown as DB
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

export const tierOf = (db: DB, id: string) => db.sponsorship_tiers.find((t) => t.id === id)!
export const sponsorOf = (db: DB, id: string) => db.sponsors.find((s) => s.id === id)!
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
