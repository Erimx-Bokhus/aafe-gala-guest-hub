// Staff-app actions on the in-browser demo data. Each is a pure (db) => db function that ALSO appends an audit entry,
// so every change carries a date, time and actor (the "historical ledger").
// Pages don't call these directly: they go through StaffApi (api.ts), which runs these in demo mode and the matching
// staff_* database function in live mode.
import { createContext, useContext } from 'react'
import { addAudit, displayName, nameParts, newQrToken, nowIso, processorFee, secureToken, sponsorOf, tierOf, uid } from '@shared/data'
import type { DB, Guest, Order, PayMethod, PipelineStage, Prospect, ReviewReason, Sector, StaffUser } from '@shared/types'
import { tierMappingKey, type GlImportRow, type GlImportRun, type ImportResult } from './importer'
import type { StaffApi } from './api'

/**
 * What every page gets. `db` is what the signed-in role may read (a volunteer's has no emails, payments or notes).
 * `act` runs a StaffApi action, then shows `done` or the server's reason it was refused.
 * `demo` applies a simulated change in demo mode only (the Salesforce and Give Lively simulations); it is null when live.
 */
export interface Ctx { db: DB; api: StaffApi; user: StaffUser; toast: (m: string) => void; act: (p: Promise<unknown>, done?: string) => Promise<boolean>; demo: ((fn: (d: DB) => DB) => void) | null }
export const StaffCtx = createContext<Ctx>(null as unknown as Ctx)
export const useStaff = () => useContext(StaffCtx)

const name = (g: Guest) => `${g.first_name} ${g.last_name}`
const BADGE_FIELDS = ['first_name', 'last_name', 'display_name', 'title', 'organization'] as const

export function updateGuest(db: DB, actor: string, id: string, patch: Partial<Guest>): DB {
  const g = db.guests.find((x) => x.id === id)!
  const badgeChanged = BADGE_FIELDS.some((k) => k in patch && patch[k] !== g[k])
  const next: Guest = { ...g, ...patch, updated_at: nowIso(), last_updated_by: 'staff' }
  // Like staff_update_guest: a display name that was just "First Last" follows a new first or last name.
  const followed = !('display_name' in patch) && (next.first_name !== g.first_name || next.last_name !== g.last_name)
    && [null, undefined, '', displayName({ first_name: g.first_name, last_name: g.last_name })].includes(g.display_name)
  const n = nameParts(followed ? null : next.display_name, next.first_name, next.last_name)
  Object.assign(next, { display_name: n.display, first_name: n.first, last_name: n.last })
  if (badgeChanged && g.badge_status === 'printed') next.badge_status = 'reprint_needed'
  const changed = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== (g as unknown as Record<string, unknown>)[k])
  if (!changed.length) return db
  return addAudit({ ...db, guests: db.guests.map((x) => (x.id === id ? next : x)) }, { actor_type: 'staff', actor, entity: 'guest', entity_id: id, order_id: g.order_id, action: 'guest.updated', from_state: null, to_state: null, guest_visible: false, summary: `${name(next)}: ${changed.join(', ')} edited by staff.` })
}

export function setSeatStatus(db: DB, actor: string, guestId: string, to: 'reviewed' | 'badge_ready'): DB {
  const seat = db.seats.find((s) => s.guest_id === guestId)!
  const g = db.guests.find((x) => x.id === guestId)!
  let guests = db.guests
  if (to === 'badge_ready') guests = guests.map((x) => (x.id === guestId ? { ...x, badge_status: x.badge_status === 'printed' ? 'printed' : 'ready' as const } : x))
  return addAudit({ ...db, guests, seats: db.seats.map((s) => (s.id === seat.id ? { ...s, status: to, updated_at: nowIso() } : s)) },
    { actor_type: 'staff', actor, entity: 'seat', entity_id: seat.id, order_id: g.order_id, action: to === 'reviewed' ? 'seat.reviewed' : 'badge.ready', from_state: seat.status, to_state: to, guest_visible: to === 'reviewed', summary: to === 'reviewed' ? `${name(g)} confirmed by AAFE.` : `${name(g)} badge marked ready.` })
}

export function markPrinted(db: DB, actor: string, ids: string[]): DB {
  let d: DB = { ...db, guests: db.guests.map((g) => (ids.includes(g.id) ? { ...g, badge_status: 'printed' as const } : g)) }
  d = addAudit(d, { actor_type: 'staff', actor, entity: 'badge', entity_id: ids.join(','), order_id: null, action: 'badge.printed', from_state: null, to_state: 'printed', guest_visible: false, summary: `${ids.length} badge(s) marked printed.` })
  return d
}

export function assignSeat(db: DB, actor: string, guestId: string, tableId: string | null, seatNo: number | null): DB {
  const g = db.guests.find((x) => x.id === guestId)!
  if (tableId && db.guests.some((x) => x.table_id === tableId && x.seat_number === seatNo && x.id !== guestId)) return db
  const t = db.event_tables.find((x) => x.id === tableId)
  const reprint = g.badge_status === 'printed' && (g.table_id !== tableId || g.seat_number !== seatNo)
  return addAudit({ ...db, guests: db.guests.map((x) => (x.id === guestId ? { ...x, table_id: tableId, seat_number: seatNo, badge_status: reprint ? 'reprint_needed' as const : x.badge_status, updated_at: nowIso() } : x)) },
    { actor_type: 'staff', actor, entity: 'guest', entity_id: guestId, order_id: g.order_id, action: tableId ? 'seat.assigned' : 'seat.unassigned', from_state: g.table_id ? `${g.table_id}/${g.seat_number}` : null, to_state: tableId ? `${tableId}/${seatNo}` : null, guest_visible: false, summary: tableId ? `${name(g)} seated at Table ${t?.number}, seat ${seatNo}.` : `${name(g)} removed from seating chart.` })
}

/** Seat every unseated guest of an order at one table (first open seats). */
export function seatOrderAtTable(db: DB, actor: string, orderId: string, tableId: string): DB {
  const t = db.event_tables.find((x) => x.id === tableId)!
  let d = db
  for (const g of db.guests.filter((x) => x.order_id === orderId && !x.table_id)) {
    const taken = new Set(d.guests.filter((x) => x.table_id === tableId).map((x) => x.seat_number))
    const free = Array.from({ length: t.capacity }, (_, i) => i + 1).find((n) => !taken.has(n))
    if (!free) break
    d = assignSeat(d, actor, g.id, tableId, free)
  }
  return d
}

// Hard rule 4: staff approve every email. Automatic triggers create a DRAFT (status 'queued', no approver).
// A staff member sending their own email (QR invite, resend link) is the approver, and it sends at once.
function sendEmail(db: DB, template: DB['email_log'][number]['template'], to: string, toName: string, orderId: string | null, guestId: string | null, trigger: string, approvedBy: string | null = null): DB {
  const e = { id: uid('em'), template, to_email: to, to_name: toName, order_id: orderId, guest_id: guestId, trigger, status: approvedBy ? 'sent' as const : 'queued' as const, sent_at: approvedBy ? nowIso() : null, approved_by: approvedBy }
  const d = { ...db, email_log: [...db.email_log, e] }
  if (!approvedBy) return addAudit(d, { actor_type: 'system', actor: 'Email queue', entity: 'email', entity_id: e.id, order_id: orderId, action: 'email.drafted', from_state: null, to_state: 'queued', guest_visible: false, summary: `${template.replace(/_/g, ' ')} for ${toName} drafted; waiting for staff approval.` })
  return logSent(d, e.id, approvedBy)
}
function logSent(db: DB, emailId: string, approvedBy: string): DB {
  const e = db.email_log.find((x) => x.id === emailId)!
  let d = db
  if (e.template === 'portal_link' && e.order_id) d = { ...d, orders: d.orders.map((x) => (x.id === e.order_id ? { ...x, portal_link_sent_at: e.sent_at } : x)) }
  return addAudit(d, { actor_type: 'staff', actor: approvedBy, entity: 'email', entity_id: e.id, order_id: e.order_id, action: e.template === 'portal_link' ? 'portal_link.sent' : `${e.template}.sent`, from_state: 'queued', to_state: 'sent', guest_visible: e.template === 'portal_link', summary: e.template === 'portal_link' ? 'Private guest-list link emailed.' : `${e.template.replace(/_/g, ' ')} emailed to ${e.to_name}.` })
}
/** Staff approve a draft email; it sends (simulated) and is logged with the approver. */
export function approveEmail(db: DB, user: StaffUser, emailId: string): DB {
  const at = nowIso()
  const d = { ...db, email_log: db.email_log.map((x) => (x.id === emailId && x.status === 'queued' ? { ...x, status: 'sent' as const, sent_at: at, approved_by: user.name } : x)) }
  return logSent(d, emailId, user.name)
}
/**
 * Like staff_queue_guest_list_reminders: one DRAFT per sponsor of this gala who still has unnamed seats, already got a
 * link, and whose deadline hasn't passed (New York date); skips a sponsor with an unsent link or reminder, or one sent
 * in the last `minDays` days. Staff approve each draft (hard rule 4).
 */
export function queueGuestListReminders(db: DB, user: StaffUser, minDays = 7): { db: DB; n: number } {
  const ev = db.gala_events.find((e) => e.id === db.meta.current_event_id)!
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/New_York' })
  const since = Date.now() - Math.max(minDays, 0) * 864e5
  const due = db.orders.filter((o) => o.event_id === ev.id && o.status !== 'cancelled' && o.portal_link_sent_at
    && (o.guest_list_deadline ?? ev.guest_list_deadline) >= today
    && db.seats.some((s) => s.order_id === o.id && s.status === 'unnamed')
    && !db.email_log.some((m) => m.order_id === o.id && (m.template === 'portal_link' || m.template === 'guest_list_reminder')
      && (m.status === 'queued' || (m.sent_at && Date.parse(m.sent_at) > since))))
    .sort((a, b) => a.id.localeCompare(b.id))
  let d = db
  for (const o of due) {
    const sp = d.sponsors.find((s) => s.id === o.sponsor_id)!
    d = sendEmail(d, 'guest_list_reminder', sp.primary_contact_email, sp.primary_contact_name, o.id, null, 'staff_manual')
  }
  if (due.length) d = addAudit(d, { actor_type: 'staff', actor: user.name, entity: 'email', entity_id: 'guest_list_reminder', order_id: null, action: 'email.reminders_drafted', from_state: null, to_state: 'draft', guest_visible: false, summary: `${due.length} guest-list reminder${due.length === 1 ? '' : 's'} drafted for review.` })
  return { db: d, n: due.length }
}

/** Staff discard a draft email; nothing is sent. */
export function cancelEmail(db: DB, user: StaffUser, emailId: string): DB {
  const e = db.email_log.find((x) => x.id === emailId)!
  return addAudit({ ...db, email_log: db.email_log.map((x) => (x.id === emailId ? { ...x, status: 'cancelled' as const } : x)) }, { actor_type: 'staff', actor: user.name, entity: 'email', entity_id: emailId, order_id: e.order_id, action: 'email.cancelled', from_state: 'queued', to_state: 'cancelled', guest_visible: false, summary: `Draft ${e.template.replace(/_/g, ' ')} for ${e.to_name} discarded.` })
}

/** Staff records a check or a direct ACH/wire seen on the bank statement. */
export function recordOfflinePayment(db: DB, user: StaffUser, orderId: string, p: { method: Extract<PayMethod, 'check' | 'ach_direct' | 'wire'>; amount: number; received: string; check_number?: string }): DB {
  const o = db.orders.find((x) => x.id === orderId)!
  const pay = { id: uid('pay'), order_id: orderId, method: p.method, processor: 'none' as const, givelively_transaction_id: null, check_number: p.check_number || null, original_amount: p.amount, covered_fee_amount: 0, gross_amount: p.amount, transaction_fee_amount: 0, refunded_amount: 0, net_amount: p.amount, received_at: new Date(p.received + 'T12:00:00').toISOString(), recorded_by: user.id, reconciliation_status: 'unreconciled' as const, salesforce_opportunity_id: null }
  const applied = db.payments.filter((x) => x.order_id === orderId).reduce((s, x) => s + x.original_amount, 0) + p.amount
  const status = applied + 0.005 >= o.commitment_amount ? 'paid' as const : 'partially_paid' as const
  let d: DB = { ...db, payments: [...db.payments, pay], orders: db.orders.map((x) => (x.id === orderId ? { ...x, status, updated_at: nowIso() } : x)), salesforce_sync: [...db.salesforce_sync, { entity: 'payment', entity_id: pay.id, sf_object: 'Opportunity', sf_id: null, status: 'pending', last_synced_at: null, error_message: null }] }
  d = addAudit(d, { actor_type: 'staff', actor: user.name, entity: 'payment', entity_id: pay.id, order_id: orderId, action: 'payment.recorded', from_state: o.status, to_state: status, guest_visible: true, summary: `Payment received: ${p.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}.` })
  if (!o.portal_link_sent_at && o.portal_token && !d.email_log.some((e) => e.order_id === orderId && e.template === 'portal_link' && e.status === 'queued')) {
    const sp = sponsorOf(d, o.sponsor_id)
    d = sendEmail(d, 'portal_link', sp.primary_contact_email, sp.primary_contact_name, orderId, null, 'payment_recorded')
  }
  return d
}

function createSeats(db: DB, orderId: string, n: number): DB {
  const seats = Array.from({ length: n }, (_, i) => ({ id: `seat-${orderId}-${i + 1}`, order_id: orderId, slot_number: i + 1, guest_id: null, status: 'unnamed' as const, updated_at: nowIso() }))
  return { ...db, seats: [...db.seats, ...seats] }
}

/** Staff enters a pledge that will be paid by check/ACH/wire (not through Give Lively). The link email is drafted for staff approval. */
export function addPledge(db: DB, user: StaffUser, p: { org: string; contact: string; email: string; tierId: string; source: 'check' | 'ach_direct' | 'wire' }): DB {
  const sp = { id: uid('sp'), organization_name: p.org, primary_contact_name: p.contact, primary_contact_email: p.email, phone: '', relationship_owner_id: user.id, salesforce_account_id: null, created_at: nowIso() }
  const tier = tierOf(db, p.tierId)
  const o = { id: uid('ord'), event_id: db.meta.current_event_id, sponsor_id: sp.id, tier_id: tier.id, source: p.source, commitment_amount: tier.contribution_amount, status: 'pledged' as const, portal_token: tier.included_seat_count ? secureToken() : null, portal_token_expires_at: null, portal_link_sent_at: null, guest_list_deadline: db.gala_events.find((e) => e.id === db.meta.current_event_id)!.guest_list_deadline, logo_status: tier.required_materials.includes('logo') ? 'pending' as const : 'not_required' as const, program_ad_status: tier.required_materials.some((m) => m.includes('ad')) ? 'pending' as const : 'not_required' as const, givelively_order_ref: null, salesforce_opportunity_id: null, internal_notes: '', created_at: nowIso(), updated_at: nowIso() }
  let d: DB = { ...db, sponsors: [...db.sponsors, sp], orders: [...db.orders, o] }
  d = createSeats(d, o.id, tier.included_seat_count)
  d = addAudit(d, { actor_type: 'staff', actor: user.name, entity: 'order', entity_id: o.id, order_id: o.id, action: 'order.created', from_state: null, to_state: 'pledged', guest_visible: true, summary: `${tier.name} recorded for ${p.org} (${p.source}).` })
  if (o.portal_token) d = sendEmail(d, 'portal_link', p.email, p.contact, o.id, null, 'pledge_recorded')
  return d
}

/** Give Lively "Line Items (All)" rows -> orders + payments. Skips transactions already imported. */
export interface GLRow { txn: string; date: string; first: string; last: string; email: string; company: string; campaign: string; ticketLevel: string; method: string; original: number; covered: number; gross: number; fee: number; net: number }
export function importGiveLively(db: DB, rows: GLRow[]): { db: DB; created: number; skipped: number } {
  let d = db, created = 0, skipped = 0
  for (const r of rows) {
    if (d.payments.some((p) => p.givelively_transaction_id === r.txn)) { skipped++; continue }
    const tier = d.sponsorship_tiers.find((t) => r.ticketLevel.toLowerCase().includes(t.name.split(' — ')[0].toLowerCase())) ?? tierOf(d, 'community_ticket')
    const method: PayMethod = /amex|american/i.test(r.method) ? 'amex' : /bank|ach/i.test(r.method) ? 'givelively_ach' : 'card'
    const org = r.company || `${r.first} ${r.last}`
    const sp = d.sponsors.find((s) => s.primary_contact_email.toLowerCase() === r.email.toLowerCase()) ?? { id: uid('sp'), organization_name: org, primary_contact_name: `${r.first} ${r.last}`, primary_contact_email: r.email, phone: '', relationship_owner_id: 'st-mei', salesforce_account_id: null, created_at: nowIso() }
    if (!d.sponsors.includes(sp)) d = { ...d, sponsors: [...d.sponsors, sp] }
    const fee = Number.isFinite(r.fee) && r.fee > 0 ? r.fee : processorFee(method, r.gross)
    const o = { id: uid('ord'), event_id: d.meta.current_event_id, sponsor_id: sp.id, tier_id: tier.id, source: 'givelively' as const, commitment_amount: tier.contribution_amount || r.original, status: 'paid' as const, portal_token: tier.included_seat_count ? secureToken() : null, portal_token_expires_at: null, portal_link_sent_at: null, guest_list_deadline: d.gala_events.find((e) => e.id === d.meta.current_event_id)!.guest_list_deadline, logo_status: tier.required_materials.includes('logo') ? 'pending' as const : 'not_required' as const, program_ad_status: 'not_required' as const, givelively_order_ref: r.txn, salesforce_opportunity_id: null, internal_notes: `Imported from Give Lively (${r.campaign}).`, created_at: nowIso(), updated_at: nowIso() }
    const pay = { id: uid('pay'), order_id: o.id, method, processor: 'stripe' as const, givelively_transaction_id: r.txn, check_number: null, original_amount: r.original, covered_fee_amount: r.covered, gross_amount: r.gross, transaction_fee_amount: fee, refunded_amount: 0, net_amount: Math.round((r.gross - fee) * 100) / 100, received_at: new Date(r.date).toISOString(), recorded_by: 'givelively_sync', reconciliation_status: 'matched' as const, salesforce_opportunity_id: null }
    d = { ...d, orders: [...d.orders, o], payments: [...d.payments, pay] }
    d = createSeats(d, o.id, tier.included_seat_count)
    d = addAudit(d, { actor_type: 'system', actor: 'Give Lively sync', entity: 'order', entity_id: o.id, order_id: o.id, action: 'order.created', from_state: null, to_state: 'paid', guest_visible: true, summary: `${tier.name} recorded for ${org} (givelively).` })
    if (o.portal_token) d = sendEmail(d, 'portal_link', r.email, `${r.first} ${r.last}`, o.id, null, 'givelively_sync')
    created++
  }
  return { db: d, created, skipped }
}

// ---- Give Lively CSV import (slice C): the demo's stand-in for staff_import_givelively() / gl_import() ----

const nameKey = (s: string | null | undefined) => tierMappingKey(s ?? '')
const lastWord = (s: string) => s.trim().split(/\s+/).pop() ?? ''

/**
 * Like gl_import() for new purchases: package from the prepared tier, this gala's tier mapping, or the tier name; sponsor by email
 * and last name (a shared inbox gets a new sponsor and a review); order, payment, seats, pre-filled guests, a draft link email,
 * and the review items. Every write is logged as the database does.
 * ponytail: a purchase imported before is counted unchanged; gl_import also applies a later refund or amount change to it.
 */
export function demoImport(db: DB, user: StaffUser, rows: GlImportRow[], run: GlImportRun): { db: DB; result: ImportResult } {
  const ev = db.gala_events.find((e) => e.id === db.meta.current_event_id)!
  const runId = uid('run'), actor = `Give Lively CSV import (${user.name})`
  let d: DB = { ...db, import_review: [...(db.import_review ?? [])], import_runs: [...(db.import_runs ?? [])] }
  const res: ImportResult = { created: 0, updated: 0, skipped: 0, needs_review: 0, unknown_tier: 0, names_prefilled: 0, review_items: 0, missing_from_source: 0, run_id: runId }
  const review = (key: string | null, orderId: string | null, reason: ReviewReason, details: Record<string, unknown>) => {
    if (d.import_review!.some((v) => v.purchase_key === key && v.reason === reason && JSON.stringify(v.details) === JSON.stringify(details))) return false
    d = { ...d, import_review: [...d.import_review!, { id: uid('rev'), run_id: runId, event_id: ev.id, purchase_key: key, order_id: orderId, reason, details, status: 'open', resolution: null, resolved_by: null, resolved_at: null, created_at: nowIso() }] }
    return true
  }
  for (const r of rows) {
    const original = r.original ?? r.gross, gross = r.gross ?? original, refunded = r.refunded ?? 0
    if (!r.email || !r.date || !(gross > 0)) { res.skipped++; continue }
    const key = r.purchase_key
    const cancel = !!r.cancelled || /refund|fail|cancel|void/i.test(r.status ?? '') || (refunded > 0 && refunded >= gross)
    if (d.payments.some((p) => p.purchase_key === key)) { res.skipped++; continue }
    const mapped = (d.tier_mappings ?? []).find((m) => m.event_id === ev.id && m.name_key === nameKey(r.ticket_level))
    const tier = d.sponsorship_tiers.find((t) => t.id === r.tier_id) ?? d.sponsorship_tiers.find((t) => t.id === mapped?.tier_id)
      ?? d.sponsorship_tiers.filter((t) => t.tier_category !== 'complimentary' && r.ticket_level && nameKey(r.ticket_level).includes(nameKey(t.name.split(' — ')[0])))
        .sort((a, b) => b.name.split(' — ')[0].length - a.name.split(' — ')[0].length)[0]
    if (!tier) { if (review(key, null, 'unknown_tier', { tier_purchased: r.ticket_level })) res.review_items++; res.unknown_tier++; continue }
    const qty = tier.tier_category === 'ticket' ? Math.max(1, r.quantity ?? (tier.contribution_amount ? Math.floor(original / tier.contribution_amount) : 1)) : 1
    const commit = tier.contribution_amount > 0 ? tier.contribution_amount * qty : original
    const seats = tier.included_seat_count === 0 ? 0 : r.seats ?? tier.included_seat_count * qty
    const m = r.method ?? ''
    const method: PayMethod = /amex|american/i.test(m) ? 'amex' : /bank|ach/i.test(m) ? 'givelively_ach' : 'card'
    const flagged = !/amex|american|bank|ach|card|visa|master|discover/i.test(m)
    const name = `${r.first} ${r.last}`.trim(), org = r.company?.trim() || name || r.email
    // Buyer -> sponsor: same email and same last name; same email, different last name is a shared inbox.
    const sameEmail = d.sponsors.filter((s) => s.primary_contact_email.trim().toLowerCase() === r.email.trim().toLowerCase())
    let sp = sameEmail.find((s) => !r.last || nameKey(lastWord(s.primary_contact_name)) === nameKey(r.last))
    const conflict = !sp && sameEmail.length ? sameEmail.map((s) => s.id) : null
    if (!sp) {
      sp = { id: uid('sp'), organization_name: org, primary_contact_name: name || org, primary_contact_email: r.email.trim().toLowerCase(), phone: '',
        relationship_owner_id: d.staff_users.filter((u) => u.role === 'gala_admin').map((u) => u.id).sort()[0] ?? '', salesforce_account_id: null, created_at: nowIso() }
      d = { ...d, sponsors: [...d.sponsors, sp] }
    }
    const o = { id: uid('ord'), event_id: ev.id, sponsor_id: sp.id, tier_id: tier.id, source: 'givelively' as const, commitment_amount: commit,
      status: (original - refunded + 0.005 >= commit ? 'paid' : 'partially_paid') as 'paid' | 'partially_paid', portal_token: seats ? secureToken() : null,
      portal_token_expires_at: null, portal_link_sent_at: null, guest_list_deadline: ev.guest_list_deadline,
      logo_status: tier.required_materials.includes('logo') ? 'pending' as const : 'not_required' as const,
      program_ad_status: tier.required_materials.some((x) => x.endsWith('ad')) ? 'pending' as const : 'not_required' as const,
      givelively_order_ref: null, salesforce_opportunity_id: null,
      internal_notes: `Imported from Give Lively (${r.campaign || 'no campaign'}).${flagged ? ` CHECK: payment method "${m}" not recognized.` : ''}`, created_at: nowIso(), updated_at: nowIso() }
    const pay = { id: uid('pay'), order_id: o.id, method, processor: 'stripe' as const, givelively_transaction_id: null, check_number: null, original_amount: original,
      covered_fee_amount: r.covered ?? 0, gross_amount: gross, transaction_fee_amount: 0, refunded_amount: refunded, net_amount: gross - refunded,
      received_at: new Date(r.date).toISOString(), recorded_by: 'givelively_sync', reconciliation_status: flagged ? 'needs_review' as const : 'matched' as const,
      salesforce_opportunity_id: null, purchase_key: key }
    d = createSeats({ ...d, orders: [...d.orders, o], payments: [...d.payments, pay] }, o.id, seats)
    d = addAudit(d, { actor_type: 'system', actor, entity: 'order', entity_id: o.id, order_id: o.id, action: 'order.created', from_state: null, to_state: 'paid', guest_visible: true, summary: `${tier.name}${qty > 1 ? ` × ${qty}` : ''} recorded for ${org} (givelively).` })
    // Pre-fill: each named guest takes the next unnamed seat, as import_fill_guests does.
    for (const g of r.guests ?? []) {
      const display = g.display_name.trim(); if (!display) continue
      const seat = d.seats.filter((s) => s.order_id === o.id && !s.guest_id && s.status === 'unnamed').sort((a, b) => a.slot_number - b.slot_number)[0]
      if (!seat) break
      // The name engine's split comes with the row (glImport.ts); like import_fill_guests, fall back to the last word.
      const n = nameParts(display, g.first_name, g.last_name)
      const guest: Guest = { id: uid('g'), order_id: o.id, first_name: n.first, last_name: n.last, display_name: n.display,
        title: '', organization: '', email: g.email?.trim().toLowerCase() ?? '', dietary_needs: null, accessibility_needs: null,
        guest_type: tier.tier_category === 'ticket' ? 'ticket_holder' : 'sponsor_guest', relationship_note: null, table_id: null, seat_number: null,
        badge_status: 'needs_review', attendance_status: 'expected', qr_token: null, last_updated_by: 'givelively_sync', created_at: nowIso(), updated_at: nowIso() }
      d = { ...d, guests: [...d.guests, guest], seats: d.seats.map((s) => (s.id === seat.id ? { ...s, guest_id: guest.id, status: 'submitted' as const, updated_at: nowIso() } : s)) }
      d = addAudit(d, { actor_type: 'system', actor: 'Give Lively import', entity: 'guest', entity_id: guest.id, order_id: o.id, action: 'guest.imported', from_state: null, to_state: 'submitted', guest_visible: true, summary: `${display} added to seat ${seat.slot_number} from the Give Lively guest list.` })
      res.names_prefilled++
    }
    if (conflict && review(key, o.id, 'email_name_conflict', { buyer: name, email: r.email.trim().toLowerCase(), candidate_sponsor_ids: conflict })) res.review_items++
    for (const f of r.findings ?? []) if ((f.reason === 'double_booked' || f.reason === 'possible_duplicate') && review(key, o.id, f.reason, f.details)) res.review_items++
    if (cancel) {
      d = { ...d, orders: d.orders.map((x) => (x.id === o.id ? { ...x, status: 'cancelled' as const } : x)), seats: d.seats.map((s) => (s.order_id === o.id ? { ...s, status: 'cancelled' as const } : s)) }
      d = addAudit(d, { actor_type: 'system', actor, entity: 'order', entity_id: o.id, order_id: o.id, action: 'order.cancelled', from_state: 'paid', to_state: 'cancelled', guest_visible: false, summary: 'Already refunded or failed in Give Lively when imported; seats cancelled.' })
      if (review(key, o.id, 'refund', { status: r.status, refunded })) res.review_items++
    } else if (seats > 0) d = sendEmail(d, 'portal_link', r.email.trim().toLowerCase(), name || org, o.id, null, 'givelively_sync')
    res.created++
    if (flagged) res.needs_review++
  }
  for (const miss of run.missing) {
    const orderId = d.payments.find((p) => p.purchase_key === miss.purchase_key)?.order_id ?? null
    if (review(miss.purchase_key, orderId, 'missing_from_source', { purchased_at: miss.purchased_at, file_hash: run.file_hash })) res.missing_from_source++
  }
  res.review_items += res.missing_from_source
  d = { ...d, import_runs: [...d.import_runs!, { id: runId, event_id: ev.id, source: 'csv', file_name: run.file_name, file_hash: run.file_hash, started_by: user.name, started_at: nowIso(), finished_at: nowIso(), status: 'succeeded', earliest_purchase: run.earliest, latest_purchase: run.latest, counts: { ...res } as unknown as Record<string, number>, report: run.report }] }
  d = addAudit(d, { actor_type: 'staff', actor: user.name, entity: 'import_run', entity_id: runId, order_id: null, action: 'import.csv', from_state: null, to_state: 'succeeded', guest_visible: false, summary: `Give Lively CSV imported (${run.file_name || 'file'}): ${res.created} new, ${res.updated} updated, ${res.skipped} unchanged, ${res.review_items} for review.` })
  return { db: d, result: res }
}

/** Like staff_set_gala_page: this gala's Give Lively page name, set once a year from the upload. */
export function setGalaPage(db: DB, user: StaffUser, page: string): DB {
  const ev = db.gala_events.find((e) => e.id === db.meta.current_event_id)!
  return addAudit({ ...db, gala_events: db.gala_events.map((e) => (e.id === ev.id ? { ...e, givelively_page_name: page.trim() } : e)) },
    { actor_type: 'staff', actor: user.name, entity: 'gala_event', entity_id: ev.id, order_id: null, action: 'gala.page_name_set', from_state: ev.givelively_page_name ?? null, to_state: page.trim(), guest_visible: false, summary: `Give Lively page set to "${page.trim()}".` })
}

/** Like staff_set_tier_mapping: link a Give Lively tier name to a package for this gala; open unknown-tier items for it close. */
export function setTierMapping(db: DB, user: StaffUser, givelivelyName: string, tierId: string): DB {
  const ev = db.meta.current_event_id, key = nameKey(givelivelyName)
  const old = (db.tier_mappings ?? []).find((m) => m.event_id === ev && m.name_key === key)
  const row = { id: old?.id ?? uid('tm'), event_id: ev, givelively_name: givelivelyName.trim(), name_key: key, tier_id: tierId, created_by: user.name, created_at: nowIso() }
  const d = { ...db, tier_mappings: [...(db.tier_mappings ?? []).filter((m) => m !== old), row],
    import_review: (db.import_review ?? []).map((v) => (v.status === 'open' && v.reason === 'unknown_tier' && nameKey(String(v.details.tier_purchased ?? '')) === key
      ? { ...v, status: 'resolved' as const, resolution: `mapped to ${tierId}`, resolved_by: user.name, resolved_at: nowIso() } : v)) }
  return addAudit(d, { actor_type: 'staff', actor: user.name, entity: 'tier_mapping', entity_id: key, order_id: null, action: 'tier_mapping.set', from_state: old?.tier_id ?? null, to_state: tierId, guest_visible: false, summary: `Give Lively tier "${givelivelyName.trim()}" mapped to ${tierId}.` })
}

/** Like staff_resolve_import_review: close a review item with what staff decided. */
export function resolveImportReview(db: DB, user: StaffUser, id: string, resolution: string): DB {
  const v = (db.import_review ?? []).find((x) => x.id === id && x.status === 'open')
  if (!v) throw new Error('not_found')
  return addAudit({ ...db, import_review: db.import_review!.map((x) => (x.id === id ? { ...x, status: 'resolved' as const, resolution: resolution.trim(), resolved_by: user.name, resolved_at: nowIso() } : x)) },
    { actor_type: 'staff', actor: user.name, entity: 'import_review', entity_id: id, order_id: v.order_id, action: 'import_review.resolved', from_state: 'open', to_state: 'resolved', guest_visible: false, summary: `Import review (${v.reason}) resolved: ${resolution.trim()}.` })
}

export function addCompGuest(db: DB, user: StaffUser, g: { first_name: string; last_name: string; title: string; organization: string; email: string; relationship_note: string }): DB {
  const orderId = 'ord-rel'
  const slot = Math.max(0, ...db.seats.filter((s) => s.order_id === orderId).map((s) => s.slot_number)) + 1
  const id = uid('g')
  const guest: Guest = { id, order_id: orderId, ...g, display_name: nameParts(null, g.first_name, g.last_name).display, dietary_needs: null, accessibility_needs: null, guest_type: 'comp_relationship', table_id: null, seat_number: null, badge_status: 'needs_review', attendance_status: 'expected', qr_token: newQrToken(), last_updated_by: 'staff', created_at: nowIso(), updated_at: nowIso() }
  const d: DB = { ...db, guests: [...db.guests, guest], seats: [...db.seats, { id: `seat-${orderId}-${slot}`, order_id: orderId, slot_number: slot, guest_id: id, status: 'reviewed', updated_at: nowIso() }] }
  return addAudit(d, { actor_type: 'staff', actor: user.name, entity: 'guest', entity_id: id, order_id: orderId, action: 'comp_guest.added', from_state: null, to_state: 'reviewed', guest_visible: false, summary: `${g.first_name} ${g.last_name} added as relationship guest (${g.relationship_note || 'no note'}).` })
}
// Staff sending their own email after previewing it counts as the approver (hard rule 4); the send is logged.
export const sendQrInvite = (db: DB, user: StaffUser, guestId: string) => {
  const g = db.guests.find((x) => x.id === guestId)!
  return sendEmail(db, 'qr_invitation', g.email, name(g), g.order_id, g.id, 'staff_manual', user.name)
}
export const resendPortalLink = (db: DB, user: StaffUser, orderId: string) => {
  const o = db.orders.find((x) => x.id === orderId)!
  const sp = sponsorOf(db, o.sponsor_id)
  return sendEmail(db, 'portal_link', sp.primary_contact_email, sp.primary_contact_name, orderId, null, 'staff_manual', user.name)
}

export function checkIn(db: DB, actor: string, guestId: string, method: 'qr' | 'search'): DB {
  const g = db.guests.find((x) => x.id === guestId)!
  if (g.attendance_status === 'checked_in') return db
  const ci = { id: uid('ci'), event_id: db.meta.current_event_id, guest_id: guestId, order_id: g.order_id, arrival_name: null, method, type: 'standard', checked_in_by: actor, note: '', checked_in_at: nowIso() }
  return addAudit({ ...db, check_ins: [...db.check_ins, ci], guests: db.guests.map((x) => (x.id === guestId ? { ...x, attendance_status: 'checked_in' as const } : x)), seats: db.seats.map((s) => (s.guest_id === guestId ? { ...s, status: 'checked_in' as const, updated_at: nowIso() } : s)) },
    { actor_type: 'staff', actor, entity: 'check_in', entity_id: ci.id, order_id: g.order_id, action: 'checkin.arrived', from_state: 'expected', to_state: 'checked_in', guest_visible: false, summary: `${name(g)} checked in (${method}).` })
}
export function checkInException(db: DB, actor: string, p: { name: string; orderId: string | null; type: string; note: string }): DB {
  const ci = { id: uid('ci'), event_id: db.meta.current_event_id, guest_id: null, order_id: p.orderId, arrival_name: p.name, method: 'exception' as const, type: p.type, checked_in_by: actor, note: p.note, checked_in_at: nowIso() }
  return addAudit({ ...db, check_ins: [...db.check_ins, ci] }, { actor_type: 'staff', actor, entity: 'check_in', entity_id: ci.id, order_id: p.orderId, action: 'checkin.exception', from_state: null, to_state: 'checked_in', guest_visible: false, summary: `${p.name} checked in as exception: ${p.type}.` })
}

export function salesforceSyncNow(db: DB): { db: DB; n: number } {
  let n = 0
  const at = nowIso()
  const sync = db.salesforce_sync.map((s) => { if (s.status !== 'pending') return s; n++; return { ...s, status: 'synced' as const, sf_id: (s.sf_object === 'Account' ? '001' : '006') + 'DEMO' + Math.random().toString(36).slice(2, 10).toUpperCase(), last_synced_at: at } })
  // new sponsors/payments that never got a sync row
  const have = new Set(db.salesforce_sync.map((s) => s.entity + s.entity_id))
  const extra = [...db.sponsors.filter((s) => !have.has('sponsor' + s.id)).map((s) => ({ entity: 'sponsor', entity_id: s.id, sf_object: 'Account' })), ...db.payments.filter((p) => !have.has('payment' + p.id)).map((p) => ({ entity: 'payment', entity_id: p.id, sf_object: 'Opportunity' }))]
    .map((x) => { n++; return { ...x, sf_id: (x.sf_object === 'Account' ? '001' : '006') + 'DEMO' + Math.random().toString(36).slice(2, 10).toUpperCase(), status: 'synced' as const, last_synced_at: at, error_message: null } })
  const d = addAudit({ ...db, salesforce_sync: [...sync, ...extra] }, { actor_type: 'system', actor: 'Salesforce sync (simulated)', entity: 'salesforce', entity_id: 'batch', order_id: null, action: 'salesforce.synced', from_state: null, to_state: null, guest_visible: false, summary: `${n} record(s) pushed to Salesforce (simulated).` })
  return { db: d, n }
}

// ---- Sponsor pipeline (backend.sql 7b) ----

/** AAFE's stages and how likely each is to bring the money in (staff_pipeline()). */
export const STAGES: { stage: PipelineStage; label: string; probability: number }[] = [
  { stage: 'not_started', label: 'Not started', probability: 0 }, { stage: 'reached_out', label: 'Reached out', probability: 0.1 },
  { stage: 'in_conversation', label: 'In conversation', probability: 0.5 }, { stage: 'closed_won', label: 'Closed won', probability: 0.9 },
  { stage: 'payment_received', label: 'Payment received', probability: 1 }, { stage: 'lost', label: 'Lost', probability: 0 },
]
export const SECTORS: Sector[] = ['board', 'community', 'corporate', 'foundation', 'individual', 'small_business']
/** A typed dollar amount (the Goal and Ask boxes): empty means none. Refuses what isn't a number ("1.2.3", "."),
 *  which would otherwise reach the server as null (JSON has no NaN) and clear the goal or the ask. */
export function parseAmount(s: string): number | null {
  if (!s.trim()) return null
  const n = Number(s)
  if (!Number.isFinite(n)) throw new Error('invalid_input: enter a valid amount, like 25000')
  return n
}
const stageLabel = (s: PipelineStage) => STAGES.find((x) => x.stage === s)!.label
const moneyFmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })   // money_fmt()
const orgKey = (db: DB, sponsorId: string) => sponsorOf(db, sponsorId)?.organization_name.trim().toLowerCase()

/** What staff_save_prospect() takes: an id to edit, or a sponsor_id (or a new organization and contact) to add. */
export interface ProspectInput {
  id?: string; sponsor_id?: string; organization?: string; contact_name?: string; contact_email?: string
  sector?: Sector | null; ask_amount?: number | null; ask_tier_id?: string | null; follow_up_owner_id?: string | null; notes?: string | null
  order_id?: string | null
}

/** pipeline_apply_order(): link the order and move the stage on (money → payment received; a pledge → closed won). */
function applyOrder(db: DB, p: Prospect, o: Order, actorType: 'staff' | 'system', actor: string, at: string): DB {
  if (p.order_id && p.order_id !== o.id) return db
  const to: PipelineStage = o.status === 'paid' || o.status === 'partially_paid' ? 'payment_received'
    : (o.status === 'pledged' || o.status === 'invoice_sent') && ['not_started', 'reached_out', 'in_conversation', 'lost'].includes(p.stage) ? 'closed_won' : p.stage
  const next: Prospect = { ...p, order_id: o.id, stage: to, seen_status: o.status, updated_at: at, stage_changed_at: to !== p.stage ? at : p.stage_changed_at }
  const d = { ...db, sponsor_prospects: (db.sponsor_prospects ?? []).map((x) => (x.id === p.id ? next : x)) }
  if (to === p.stage) return d
  return addAudit(d, { actor_type: actorType, actor, entity: 'prospect', entity_id: p.id, order_id: o.id, action: 'prospect.stage', from_state: p.stage, to_state: to, guest_visible: false,
    summary: `${sponsorOf(db, p.sponsor_id)?.organization_name}: ${stageLabel(p.stage)} → ${stageLabel(to)} (${to === 'payment_received' ? 'payment recorded' : 'pledge or purchase recorded'}).` })
}

/**
 * The orders_pipeline trigger, over the demo data: each sponsorship or ticket order moves its sponsor's prospect on, and a
 * sponsorship with no prospect yet gets one (id pr-<order>, so the board reads the same ids every time).
 * ponytail: the database runs this as each order changes; the demo runs it when the board is read or a pipeline action
 * saves, and only for order changes made after the prospect existed (updated_at) and not yet followed (seen_status). So a
 * stage staff set holds until the order changes, as it does live. Its "Pipeline" log entries appear on the next pipeline save.
 */
export function syncPipeline(db: DB): DB {
  const ev = db.meta.current_event_id
  let d: DB = { ...db, sponsor_prospects: db.sponsor_prospects ?? [] }
  for (const o of db.orders) {
    const cat = tierOf(db, o.tier_id)?.tier_category
    if (o.event_id !== ev || o.status === 'cancelled' || o.status === 'comp' || (cat !== 'sponsorship' && cat !== 'ticket')) continue
    const list = d.sponsor_prospects!
    let p = list.find((x) => x.order_id === o.id) ?? list.find((x) => x.event_id === ev && x.sponsor_id === o.sponsor_id)
      ?? list.filter((x) => x.event_id === ev && !x.order_id && orgKey(d, x.sponsor_id) === orgKey(d, o.sponsor_id)).sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
    if (p && (o.updated_at < p.created_at || (p.order_id === o.id && p.seen_status === o.status))) continue
    if (!p) {
      if (cat !== 'sponsorship') continue
      p = { id: `pr-${o.id}`, event_id: ev, sponsor_id: o.sponsor_id, stage: 'not_started', sector: null, ask_amount: o.commitment_amount, ask_tier_id: o.tier_id,
        order_id: null, follow_up_owner_id: null, notes: null, stage_changed_at: o.created_at, created_at: o.created_at, updated_at: o.created_at }
      d = { ...d, sponsor_prospects: [...list, p] }
    }
    d = applyOrder(d, p, o, 'system', 'Pipeline', o.updated_at)
  }
  return d
}

/** staff_save_prospect()'s checks, on the synced demo data: the reason it refuses, or null. */
export function prospectError(db: DB, p: ProspectInput): string | null {
  const ev = db.meta.current_event_id
  if (p.sector && !SECTORS.includes(p.sector)) return 'invalid_input: sector must be board, community, corporate, foundation, individual or small_business'
  if (p.ask_amount != null && p.ask_amount < 0) return 'invalid_input: the ask cannot be negative'
  if (p.ask_tier_id && !db.sponsorship_tiers.some((t) => t.id === p.ask_tier_id)) return 'not_found: tier'
  if (p.follow_up_owner_id && !db.staff_users.some((u) => u.id === p.follow_up_owner_id)) return 'not_found: staff member'
  const list = db.sponsor_prospects ?? []
  let me: Prospect | undefined
  if (!p.id) {
    if (!p.sponsor_id) {
      const org = (p.organization ?? '').trim()
      if (!org || !(p.contact_name ?? '').trim()) return 'invalid_input: organization and contact name are required'
      const sp = db.sponsors.find((s) => s.organization_name.trim().toLowerCase() === org.toLowerCase())
      if (sp) return `invalid_input: ${org} is already a sponsor (${sp.id}); add them by sponsor_id`
    } else {
      if (!db.sponsors.some((s) => s.id === p.sponsor_id)) return 'not_found: sponsor'
      if (list.some((x) => x.event_id === ev && x.sponsor_id === p.sponsor_id)) return "invalid_input: this sponsor is already in this gala's pipeline"
    }
  } else if (!(me = list.find((x) => x.id === p.id && x.event_id === ev))) return 'not_found'
  if (p.order_id) {
    if (!db.orders.some((o) => o.id === p.order_id && o.event_id === ev)) return 'not_found: order'
    if (list.some((x) => x.order_id === p.order_id && x.id !== p.id)) return 'invalid_input: that order belongs to another prospect'
    if (me?.order_id && me.order_id !== p.order_id) return 'invalid_input: this prospect already has an order'
  }
  return null
}

/** staff_save_prospect(), after prospectError() found nothing: add (as ids.prospect) or edit, then link an order if given. */
export function saveProspect(db: DB, user: StaffUser, p: ProspectInput, ids: { prospect: string; sponsor: string }): DB {
  const now = nowIso(), ev = db.meta.current_event_id
  const blank = <T,>(v: T | null | undefined) => (v === '' || v == null ? null : v)
  let d = db, id = p.id
  if (!id) {
    let spId = p.sponsor_id
    if (!spId) {
      spId = ids.sponsor
      d = { ...d, sponsors: [...d.sponsors, { id: spId, organization_name: p.organization!.trim(), primary_contact_name: p.contact_name!.trim(), primary_contact_email: (p.contact_email ?? '').trim(),
        phone: '', relationship_owner_id: user.id, salesforce_account_id: null, created_at: now }] }
    }
    id = ids.prospect
    d = { ...d, sponsor_prospects: [...(d.sponsor_prospects ?? []), { id, event_id: ev, sponsor_id: spId, stage: 'not_started', sector: blank(p.sector), ask_amount: blank(p.ask_amount),
      ask_tier_id: blank(p.ask_tier_id), order_id: null, follow_up_owner_id: blank(p.follow_up_owner_id), notes: blank((p.notes ?? '').trim()), stage_changed_at: now, created_at: now, updated_at: now }] }
    d = addAudit(d, { actor_type: 'staff', actor: user.name, entity: 'prospect', entity_id: id, order_id: null, action: 'prospect.created', from_state: null, to_state: 'not_started', guest_visible: false,
      summary: `${sponsorOf(d, spId).organization_name} added to the pipeline${p.ask_amount != null ? ', ask ' + moneyFmt(p.ask_amount) : ''}.` })
  } else {
    const old = d.sponsor_prospects!.find((x) => x.id === id)!
    const fields = (['sector', 'ask_amount', 'ask_tier_id', 'follow_up_owner_id', 'notes'] as const).filter((k) => k in p)
    const next = { ...old, ...Object.fromEntries(fields.map((k) => [k, blank(p[k])])) } as Prospect
    const changed = fields.filter((k) => next[k] !== old[k])
    if (changed.length) {
      d = { ...d, sponsor_prospects: d.sponsor_prospects!.map((x) => (x.id === id ? { ...next, updated_at: now } : x)) }
      d = addAudit(d, { actor_type: 'staff', actor: user.name, entity: 'prospect', entity_id: id!, order_id: old.order_id, action: 'prospect.updated', from_state: null, to_state: null, guest_visible: false,
        summary: `${sponsorOf(d, old.sponsor_id).organization_name}: ${changed.join(', ')} edited.` })
    }
  }
  // Link a pledge or purchase recorded under another sponsor record.
  const pr = d.sponsor_prospects!.find((x) => x.id === id)!
  if (p.order_id && !pr.order_id) {
    const o = d.orders.find((x) => x.id === p.order_id)!
    d = { ...d, sponsor_prospects: d.sponsor_prospects!.map((x) => (x.id === id ? { ...x, order_id: o.id, updated_at: now } : x)) }
    d = addAudit(d, { actor_type: 'staff', actor: user.name, entity: 'prospect', entity_id: id!, order_id: o.id, action: 'prospect.order_linked', from_state: null, to_state: null, guest_visible: false,
      summary: `${sponsorOf(d, pr.sponsor_id).organization_name}: order ${o.id} linked.` })
    d = applyOrder(d, { ...pr, order_id: o.id }, o, 'staff', user.name, now)
  }
  return d
}

/** staff_set_prospect_stage()'s checks: payment received comes from a recorded payment, and a sponsor who has paid stays there. */
export function stageError(db: DB, id: string, stage: PipelineStage): string | null {
  if (!STAGES.some((s) => s.stage === stage)) return 'invalid_input: stage must be not_started, reached_out, in_conversation, closed_won, payment_received or lost'
  const p = (db.sponsor_prospects ?? []).find((x) => x.id === id && x.event_id === db.meta.current_event_id)
  if (!p) return 'not_found'
  if (p.stage === stage) return null
  const paid = db.payments.some((x) => x.order_id === p.order_id && x.original_amount - x.refunded_amount > 0)
  if (stage === 'payment_received' && !paid) return 'invalid_transition: record the payment first'
  if (paid && stage !== 'payment_received') return 'invalid_transition: this sponsor has paid; their stage stays payment received'
  return null
}

export function setProspectStage(db: DB, user: StaffUser, id: string, stage: PipelineStage): DB {
  const p = db.sponsor_prospects!.find((x) => x.id === id)!
  if (p.stage === stage) return db
  const now = nowIso()
  return addAudit({ ...db, sponsor_prospects: db.sponsor_prospects!.map((x) => (x.id === id ? { ...x, stage, stage_changed_at: now, updated_at: now } : x)) },
    { actor_type: 'staff', actor: user.name, entity: 'prospect', entity_id: id, order_id: p.order_id, action: 'prospect.stage', from_state: p.stage, to_state: stage, guest_visible: false,
      summary: `${sponsorOf(db, p.sponsor_id).organization_name}: ${stageLabel(p.stage)} → ${stageLabel(stage)}.` })
}

/** staff_set_sponsorship_goal(): the board's target for this gala; null clears it. */
export function setSponsorshipGoal(db: DB, user: StaffUser, amount: number | null): DB {
  const ev = db.gala_events.find((e) => e.id === db.meta.current_event_id)!
  const old = ev.sponsorship_goal ?? null
  if (old === amount) return db
  return addAudit({ ...db, gala_events: db.gala_events.map((e) => (e.id === ev.id ? { ...e, sponsorship_goal: amount } : e)) },
    { actor_type: 'staff', actor: user.name, entity: 'gala_event', entity_id: ev.id, order_id: null, action: 'gala.goal_set', from_state: old == null ? null : old.toFixed(2),
      to_state: amount == null ? null : amount.toFixed(2), guest_visible: false, summary: `Sponsorship goal set to ${amount == null ? 'none' : moneyFmt(amount)}.` })
}
