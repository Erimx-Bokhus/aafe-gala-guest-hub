// Staff-app actions. Each is a pure (db) => db function that ALSO appends an audit entry,
// so every change carries a date, time and actor (the "historical ledger").
// PRODUCTION: each function becomes a Supabase insert/update (or RPC) — same names, same audit rule.
import { createContext, useContext } from 'react'
import { addAudit, newQrToken, nowIso, processorFee, secureToken, sponsorOf, tierOf, uid } from '@shared/data'
import type { DB, Guest, PayMethod, StaffUser } from '@shared/types'

export interface Ctx { db: DB; update: (fn: (d: DB) => DB) => void; user: StaffUser; toast: (m: string) => void }
export const StaffCtx = createContext<Ctx>(null as unknown as Ctx)
export const useStaff = () => useContext(StaffCtx)

const name = (g: Guest) => `${g.first_name} ${g.last_name}`
const BADGE_FIELDS = ['first_name', 'last_name', 'title', 'organization'] as const

export function updateGuest(db: DB, actor: string, id: string, patch: Partial<Guest>): DB {
  const g = db.guests.find((x) => x.id === id)!
  const badgeChanged = BADGE_FIELDS.some((k) => k in patch && patch[k] !== g[k])
  const next: Guest = { ...g, ...patch, updated_at: nowIso(), last_updated_by: 'staff' }
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

export function addCompGuest(db: DB, user: StaffUser, g: { first_name: string; last_name: string; title: string; organization: string; email: string; relationship_note: string }): DB {
  const orderId = 'ord-rel'
  const slot = Math.max(0, ...db.seats.filter((s) => s.order_id === orderId).map((s) => s.slot_number)) + 1
  const id = uid('g')
  const guest: Guest = { id, order_id: orderId, ...g, dietary_needs: null, accessibility_needs: null, guest_type: 'comp_relationship', table_id: null, seat_number: null, badge_status: 'needs_review', attendance_status: 'expected', qr_token: newQrToken(), last_updated_by: 'staff', created_at: nowIso(), updated_at: nowIso() }
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
