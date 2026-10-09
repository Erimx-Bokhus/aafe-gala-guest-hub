// Every staff-app write goes through StaffApi (issue #9). Pages never change data themselves.
// LIVE (Supabase configured): each action is one staff_* function in database/backend.sql. The server checks the
//   caller's role and writes the change log; the app then reloads what the signed-in role may read.
// DEMO (no Supabase): the same actions run on the in-browser demo data (store.ts), with the same role rules, so the
//   demo behaves like the real app, including what a check-in volunteer can and can't see.
import type { SupabaseClient } from '@supabase/supabase-js'
import { addAudit, loadDB } from '@shared/data'
import type { Snapshot } from '@shared/offlineCheckin'
import type { AuditEntry, DB, EmailLog, GalaEvent, Guest, Material, PayMethod, Role, StaffUser } from '@shared/types'
import * as store from './store'
import { demoBadgeRows, demoCheckinRows, demoSalesforceRows, type BadgeRow, type CheckinRow, type SalesforceRow } from './exports'

export type OfflineMethod = Extract<PayMethod, 'check' | 'ach_direct' | 'wire'>
export interface PaymentInput { method: OfflineMethod; amount: number; received: string; check_number?: string }
export interface PledgeInput { org: string; contact: string; email: string; tierId: string; source: OfflineMethod }
export interface CompGuestInput { first_name: string; last_name: string; title: string; organization: string; email: string; relationship_note: string }
export interface ExceptionInput { name: string; orderId: string | null; type: string; note: string }
export type GuestPatch = Partial<Pick<Guest, 'first_name' | 'last_name' | 'title' | 'organization' | 'email' | 'dietary_needs' | 'accessibility_needs' | 'relationship_note'>>
/** One unsent email as staff_email_queue() returns it: what staff need to judge a draft before approving it. */
export interface QueuedEmail {
  id: string; template: EmailLog['template']; to_name: string; to_email: string; trigger: string; created_at: string | null
  approved_by: string | null; attempts: number; last_error: string | null
  /** draft: waiting for approval. approved: waiting for the sender. failed: the sender stopped after 5 tries. */
  state: 'draft' | 'approved' | 'failed'
  order_id: string | null; organization: string | null; tier: string | null; deadline: string | null
  seats_unnamed: number; seats_total: number; guest: string | null
  payment: { amount: number; method: PayMethod; received_at: string; check_number: string | null } | null
}
export type GalaPatch = Partial<Pick<GalaEvent, 'name' | 'event_date' | 'doors_time' | 'program_time' | 'venue_name' | 'venue_address' | 'dress_code' | 'guest_list_deadline' | 'program_ad_deadline'>>

export interface StaffApi {
  live: boolean
  updateGuest(guestId: string, patch: GuestPatch): Promise<void>
  setSeatStatus(guestId: string, to: 'reviewed' | 'badge_ready'): Promise<void>
  markPrinted(guestIds: string[]): Promise<void>
  assignSeat(guestId: string, tableId: string | null, seat: number | null): Promise<void>
  seatOrderAtTable(orderId: string, tableId: string): Promise<void>
  recordPayment(orderId: string, p: PaymentInput): Promise<void>
  addPledge(p: PledgeInput): Promise<void>
  addCompGuest(g: CompGuestInput): Promise<void>
  sendQrInvite(guestId: string): Promise<void>
  resendPortalLink(orderId: string): Promise<void>
  approveEmail(emailId: string): Promise<void>
  cancelEmail(emailId: string): Promise<void>
  checkIn(guestId: string, method: 'qr' | 'search'): Promise<{ already: boolean }>
  /** Check in by the code on a guest's QR e-ticket. Only the server can match it: the database keeps the code's hash. */
  checkInByCode(code: string): Promise<{ guestId: string; already: boolean }>
  checkInException(p: ExceptionInput): Promise<void>
  updateGalaEvent(patch: GalaPatch): Promise<void>
  setMaterialStatus(orderId: string, material: 'logo' | 'program_ad', status: Material): Promise<void>
  /** One order's whole change log, oldest first. Live, the app holds only the newest 1,000 entries, so a sponsor's page asks for its own. */
  history(orderId: string): Promise<AuditEntry[]>
  /** The export files (exports.ts). Each is role-checked and logged, live and demo alike. */
  exportBadges(includePrinted: boolean): Promise<BadgeRow[]>
  exportCheckin(): Promise<CheckinRow[]>
  exportSalesforce(): Promise<SalesforceRow[]>
  /** Every unsent email, drafts first, with its sponsor, seats and payment. */
  emailQueue(): Promise<QueuedEmail[]>
  /** Draft a guest-list reminder for each sponsor who needs one; returns how many. Drafts only: staff approve each. */
  queueReminders(minDays?: number): Promise<number>
}

// Who may do what. Mirrors require_staff(...) in each staff_* function, and scripts/test-access.mjs checks the server side.
const ALL: Role[] = ['gala_admin', 'relationship_manager', 'check_in_volunteer']
const MANAGERS: Role[] = ['gala_admin', 'relationship_manager']
const ADMIN: Role[] = ['gala_admin']
export const ROLES: Record<Exclude<keyof StaffApi, 'live'>, Role[]> = {
  updateGuest: MANAGERS, setSeatStatus: MANAGERS, markPrinted: MANAGERS, assignSeat: MANAGERS, seatOrderAtTable: MANAGERS,
  recordPayment: MANAGERS, addPledge: MANAGERS, addCompGuest: MANAGERS, sendQrInvite: MANAGERS, resendPortalLink: MANAGERS,
  approveEmail: MANAGERS, cancelEmail: MANAGERS, setMaterialStatus: MANAGERS,
  checkIn: ALL, checkInByCode: ALL, checkInException: ALL,
  updateGalaEvent: ADMIN, history: MANAGERS,
  exportBadges: MANAGERS, exportCheckin: ALL, exportSalesforce: ADMIN,
  emailQueue: MANAGERS, queueReminders: MANAGERS,
}
export const canDo = (role: Role, action: keyof typeof ROLES) => ROLES[action].includes(role)

/** Plain-language text for the errors the staff_* functions raise ('forbidden', 'seat_taken', 'invalid_input: …'). */
export function errorText(e: unknown): string {
  const m = (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e)) || ''
  if (m === 'forbidden') return 'Your role can’t do that.'
  // "forbidden: only Kenji Abe or a gala admin can undo this check-in": the server's own reason says more.
  const reason = m.match(/^forbidden:\s*(.+)$/)
  if (reason) return reason[1].charAt(0).toUpperCase() + reason[1].slice(1) + '.'
  if (m === 'seat_taken') return 'That seat is already taken.'
  if (m === 'not_found' || m.startsWith('not_found')) return 'That record wasn’t found. It may have changed; the page has been refreshed.'
  if (m.startsWith('expired')) return 'That QR code has expired.'
  const detail = m.match(/^(?:invalid_input|invalid_transition|seat_locked):\s*(.+)$/)
  if (detail) return detail[1].charAt(0).toUpperCase() + detail[1].slice(1) + '.'
  return 'Something went wrong. Try again, or ask the gala admin.'
}

const forbidden = () => Promise.reject(new Error('forbidden'))

// ---- DEMO ------------------------------------------------------------------------------------------------

/** The demo actions, on the full demo data held by the app. `update` applies a change; `full` reads the current data. */
export function demoApi(user: StaffUser, update: (fn: (d: DB) => DB) => void, full: () => DB): StaffApi {
  const may = (a: keyof typeof ROLES) => canDo(user.role, a)
  const run = (a: keyof typeof ROLES, fn: (d: DB) => DB) => { if (!may(a)) return forbidden(); update(fn); return Promise.resolve() }
  return {
    live: false,
    updateGuest: (id, patch) => run('updateGuest', (d) => store.updateGuest(d, user.name, id, patch)),
    setSeatStatus: (id, to) => run('setSeatStatus', (d) => store.setSeatStatus(d, user.name, id, to)),
    markPrinted: (ids) => run('markPrinted', (d) => store.markPrinted(d, user.name, ids)),
    assignSeat: (id, t, n) => {
      if (t && full().guests.some((x) => x.table_id === t && x.seat_number === n && x.id !== id)) return Promise.reject(new Error('seat_taken'))
      return run('assignSeat', (d) => store.assignSeat(d, user.name, id, t, n))
    },
    seatOrderAtTable: (o, t) => run('seatOrderAtTable', (d) => store.seatOrderAtTable(d, user.name, o, t)),
    recordPayment: (o, p) => run('recordPayment', (d) => store.recordOfflinePayment(d, user, o, p)),
    addPledge: (p) => run('addPledge', (d) => store.addPledge(d, user, p)),
    addCompGuest: (g) => run('addCompGuest', (d) => store.addCompGuest(d, user, g)),
    sendQrInvite: (id) => run('sendQrInvite', (d) => store.sendQrInvite(d, user, id)),
    resendPortalLink: (o) => run('resendPortalLink', (d) => store.resendPortalLink(d, user, o)),
    approveEmail: (id) => run('approveEmail', (d) => store.approveEmail(d, user, id)),
    cancelEmail: (id) => run('cancelEmail', (d) => store.cancelEmail(d, user, id)),
    checkIn: async (id, method) => {
      if (!may('checkIn')) return forbidden()
      const already = full().guests.find((g) => g.id === id)?.attendance_status === 'checked_in'
      if (!already) update((d) => store.checkIn(d, user.name, id, method))
      return { already }
    },
    checkInByCode: async (code) => {
      if (!may('checkInByCode')) return forbidden()
      const g = full().guests.find((x) => x.qr_token && x.qr_token.toUpperCase() === code.trim().toUpperCase())
      if (!g) throw new Error('not_found: unknown QR code')
      const already = g.attendance_status === 'checked_in'
      if (!already) update((d) => store.checkIn(d, user.name, g.id, 'qr'))
      return { guestId: g.id, already }
    },
    checkInException: (p) => run('checkInException', (d) => store.checkInException(d, user.name, p)),
    // Like staff_update_gala_event: sponsors on the gala's deadline follow a new one (demo data has no QR expiry to move).
    updateGalaEvent: (patch) => run('updateGalaEvent', (d) => {
      const ev = d.gala_events.find((x) => x.id === d.meta.current_event_id)!
      const follows = (o: DB['orders'][number]) => o.event_id === ev.id && (o.guest_list_deadline ?? '') === (ev.guest_list_deadline ?? '')
      const orders = patch.guest_list_deadline !== undefined && patch.guest_list_deadline !== ev.guest_list_deadline
        ? d.orders.map((o) => (follows(o) ? { ...o, guest_list_deadline: patch.guest_list_deadline || null } : o)) : d.orders
      return addAudit({ ...d, orders, gala_events: d.gala_events.map((x) => (x.id === ev.id ? { ...x, ...patch } : x)) },
        { actor_type: 'staff', actor: user.name, entity: 'gala_event', entity_id: d.meta.current_event_id, order_id: null, action: 'event.updated', from_state: null, to_state: null, guest_visible: false, summary: 'Gala information updated.' })
    }),
    setMaterialStatus: (o, material, status) => run('setMaterialStatus', (d) => {
      const k = material === 'logo' ? 'logo_status' : 'program_ad_status'
      const order = d.orders.find((x) => x.id === o)!
      if (order[k] === status) return d
      return addAudit({ ...d, orders: d.orders.map((x) => (x.id === o ? { ...x, [k]: status } : x)) },
        { actor_type: 'staff', actor: user.name, entity: 'order', entity_id: o, order_id: o, action: 'materials.updated', from_state: order[k], to_state: status, guest_visible: false, summary: `${material === 'logo' ? 'Logo' : 'Program ad'} marked ${status.replace(/_/g, ' ')}.` })
    }),
    history: async (o) => (may('history') ? full().audit_log.filter((a) => a.order_id === o) : forbidden()),
    exportBadges: (inc) => exported('exportBadges', 'badges', demoBadgeRows(full(), inc), (n) => `Badge file exported: ${n} badge(s)${inc ? ', including printed' : ''}.`),
    exportCheckin: () => exported('exportCheckin', 'checkin', demoCheckinRows(full()), (n) => `Check-in list exported: ${n} row(s).`),
    exportSalesforce: () => exported('exportSalesforce', 'salesforce', demoSalesforceRows(full()), (n) => `Salesforce attendee file exported: ${n} attendee(s).`),
    emailQueue: async () => (may('emailQueue') ? demoEmailQueue(full()) : forbidden()),
    queueReminders: async (minDays = 7) => {
      if (!may('queueReminders')) return forbidden()
      let n = 0
      update((d) => { const r = store.queueGuestListReminders(d, user, minDays); n = r.n; return r.db })
      return n
    },
  }
  // Like the staff_export_* functions: refused for the wrong role, otherwise logged with the row count.
  function exported<T>(a: keyof typeof ROLES, what: string, rows: T[], summary: (n: number) => string): Promise<T[]> {
    if (!may(a)) return forbidden()
    update((d) => addAudit(d, { actor_type: 'staff', actor: user.name, entity: 'export', entity_id: what, order_id: null, action: `export.${what}`, from_state: null, to_state: null, guest_visible: false, summary: summary(rows.length) }))
    return Promise.resolve(rows)
  }
}

// ---- LIVE ------------------------------------------------------------------------------------------------

/** The live actions: one staff_* call each, then `reload` so the page shows what the server now holds. */
export function liveApi(client: SupabaseClient, reload: () => Promise<void>): StaffApi {
  const call = async <T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await client.rpc(fn, args)
    if (error) { if (error.message.startsWith('not_found')) void reload(); throw new Error(error.message) }
    return data as T
  }
  const write = async (fn: string, args: Record<string, unknown>) => { await call(fn, args); await reload() }
  return {
    live: true,
    updateGuest: (id, patch) => write('staff_update_guest', { p_guest_id: id, p_patch: patch }),
    setSeatStatus: (id, to) => write('staff_set_seat_status', { p_guest_id: id, p_to: to }),
    markPrinted: (ids) => write('staff_mark_printed', { p_guest_ids: ids }),
    assignSeat: (id, t, n) => write('staff_assign_seat', { p_guest_id: id, p_table_id: t, p_seat: n }),
    seatOrderAtTable: (o, t) => write('staff_seat_order_at_table', { p_order_id: o, p_table_id: t }),
    recordPayment: (o, p) => write('staff_record_payment', { p_order_id: o, p_method: p.method, p_amount: p.amount, p_received: p.received, p_check_number: p.check_number || null }),
    addPledge: (p) => write('staff_add_pledge', { p_org: p.org, p_contact: p.contact, p_email: p.email, p_tier_id: p.tierId, p_source: p.source }),
    addCompGuest: (g) => write('staff_add_comp_guest', { p_guest: g }),
    sendQrInvite: (id) => write('staff_send_qr_invite', { p_guest_id: id }),
    resendPortalLink: (o) => write('staff_resend_portal_link', { p_order_id: o }),
    approveEmail: (id) => write('staff_approve_email', { p_email_id: id }),
    cancelEmail: (id) => write('staff_cancel_email', { p_email_id: id }),
    checkIn: async (id, method) => { const fresh = await call<boolean>('staff_check_in', { p_guest_id: id, p_method: method }); await reload(); return { already: !fresh } },
    checkInByCode: async (code) => {
      const r = await call<{ guest_id: string; already_checked_in: boolean }>('staff_check_in_qr', { p_code: code })
      await reload()
      return { guestId: r.guest_id, already: r.already_checked_in }
    },
    checkInException: (p) => write('staff_check_in_exception', { p_name: p.name, p_order_id: p.orderId, p_type: p.type, p_note: p.note }),
    updateGalaEvent: (patch) => write('staff_update_gala_event', { p_patch: patch }),
    setMaterialStatus: (o, material, status) => write('staff_set_material_status', { p_order_id: o, p_material: material, p_status: status }),
    history: async (o) => {
      const { data, error } = await client.from('audit_log').select('*').eq('order_id', o).order('id')
      if (error) throw new Error(error.message)
      return data as AuditEntry[]
    },
    // Reads that also write a change-log entry; no reload: nothing on screen changes.
    exportBadges: (inc) => call<BadgeRow[]>('staff_export_badges', { p_include_printed: inc }),
    exportCheckin: () => call<CheckinRow[]>('staff_export_checkin', {}),
    exportSalesforce: () => call<SalesforceRow[]>('staff_export_salesforce', {}),
    emailQueue: () => call<QueuedEmail[]>('staff_email_queue', {}),
    queueReminders: async (minDays = 7) => { const n = await call<number>('staff_queue_guest_list_reminders', { p_min_days: minDays }); await reload(); return n },
  }
}

// ---- WHAT EACH ROLE LOADS ---------------------------------------------------------------------------------

/**
 * The door list a check-in volunteer works from: staff_checkin_snapshot() in the database, or the same shape from the demo
 * data. One type with the iPad app (shared/src/offlineCheckin.ts), so the staff app reads what the database really returns.
 */
export type CheckinSnapshot = Snapshot

/** The approval list from the demo data, in staff_email_queue()'s shape and order (drafts first). Demo approval sends at once,
 *  so there are no approved-but-unsent or failed emails here; demo emails carry no payment link. */
export function demoEmailQueue(db: DB): QueuedEmail[] {
  const ev = db.gala_events.find((e) => e.id === db.meta.current_event_id)
  return db.email_log.filter((m) => m.status === 'queued').map((m) => {
    const o = db.orders.find((x) => x.id === m.order_id)
    const seats = db.seats.filter((x) => x.order_id === m.order_id)
    const g = db.guests.find((x) => x.id === m.guest_id)
    return {
      id: m.id, template: m.template, to_name: m.to_name, to_email: m.to_email, trigger: m.trigger, created_at: null,
      approved_by: m.approved_by ?? null, attempts: 0, last_error: null, state: m.approved_at ? 'approved' as const : 'draft' as const,
      order_id: m.order_id, organization: o ? db.sponsors.find((x) => x.id === o.sponsor_id)?.organization_name ?? null : null,
      tier: o ? db.sponsorship_tiers.find((t) => t.id === o.tier_id)?.name ?? null : null,
      deadline: o ? o.guest_list_deadline ?? (ev?.guest_list_deadline || null) : null,
      seats_unnamed: seats.filter((x) => x.status === 'unnamed').length, seats_total: seats.filter((x) => x.status !== 'cancelled').length,
      guest: g ? `${g.first_name} ${g.last_name}` : null, payment: null,
    }
  }).sort((a, b) => (a.state === 'draft' ? 0 : 1) - (b.state === 'draft' ? 0 : 1) || a.id.localeCompare(b.id))
}

/** The demo data cut down to what staff_checkin_snapshot() returns, so a demo volunteer sees no more than a real one. */
export function demoSnapshot(db: DB): CheckinSnapshot {
  const ev = db.gala_events.find((e) => e.id === db.meta.current_event_id)!
  const orders = new Map(db.orders.filter((o) => o.event_id === ev.id && o.status !== 'cancelled').map((o) => [o.id, o]))
  const sponsorOf = (orderId: string) => db.sponsors.find((s) => s.id === orders.get(orderId)!.sponsor_id)?.organization_name ?? ''
  const unnamed = new Map<string, number>()
  for (const s of db.seats) if (!s.guest_id && s.status !== 'cancelled' && orders.has(s.order_id)) unnamed.set(s.order_id, (unnamed.get(s.order_id) ?? 0) + 1)
  return {
    event_id: ev.id, event_name: ev.name, generated_at: new Date().toISOString(),
    event_date: ev.event_date, doors_time: ev.doors_time, venue_name: ev.venue_name, status: ev.status,
    guests: db.guests.filter((g) => orders.has(g.order_id)).map((g) => {
      const ci = db.check_ins.find((c) => c.guest_id === g.id && c.event_id === ev.id)
      return {
        id: g.id, order_id: g.order_id, first_name: g.first_name, last_name: g.last_name, title: g.title, organization: g.organization,
        sponsor: sponsorOf(g.order_id), package: db.sponsorship_tiers.find((t) => t.id === orders.get(g.order_id)!.tier_id)?.name ?? null,
        guest_type: g.guest_type, table_number: db.event_tables.find((t) => t.id === g.table_id)?.number ?? null, seat_number: g.seat_number,
        accessibility_needs: g.accessibility_needs, qr_hash: null, qr_expires_at: null,
        arrived: g.attendance_status === 'checked_in' || !!ci, checkin_id: ci?.id ?? null, checkin_client_id: null,
        checked_in_at: ci?.checked_in_at ?? null, checked_in_by: ci?.checked_in_by ?? null, device: null,
      }
    }),
    unnamed_seats: [...unnamed].map(([order_id, count]) => ({ order_id, sponsor: sponsorOf(order_id), count })),
    exceptions: db.check_ins.filter((c) => !c.guest_id && c.event_id === ev.id).map((c) => ({
      id: c.id, client_id: null, name: c.arrival_name ?? '', type: c.type, order_id: c.order_id,
      checked_in_at: c.checked_in_at, checked_in_by: c.checked_in_by, device: null,
    })),
  }
}

/**
 * A volunteer's view of the gala as app data: names, organization, sponsor, table and seat, accessibility needs and arrival.
 * No emails, phones, dietary needs, payments, notes, QR codes, emails sent or change log (issue #9, data-handling commitments).
 */
export function volunteerDb(snap: CheckinSnapshot, user: StaffUser): DB {
  const empty = loadDB()
  const tableId = (n: number | null) => (n == null ? null : `table-${n}`)
  // Orders come from named guests and from sponsors whose seats are still unnamed (the walk-in "With sponsor" list).
  const sponsorOfOrder = new Map([...snap.guests.map((g) => [g.order_id, g.sponsor] as const), ...snap.unnamed_seats.map((u) => [u.order_id, u.sponsor] as const)])
  const orderIds = [...sponsorOfOrder.keys()]
  const at = new Date(0).toISOString()
  return {
    meta: { ...empty.meta, current_event_id: snap.event_id },
    gala_events: [{ id: snap.event_id, year: 0, name: snap.event_name, event_date: '', doors_time: '', program_time: '', venue_name: '', venue_address: '', dress_code: '', guest_list_deadline: '', program_ad_deadline: '', status: 'live', is_synthetic: true }],
    staff_users: [user],
    sponsorship_tiers: [],
    sponsors: orderIds.map((o) => ({ id: `sp-${o}`, organization_name: sponsorOfOrder.get(o) ?? '', primary_contact_name: '', primary_contact_email: '', phone: '', relationship_owner_id: '', salesforce_account_id: null, created_at: at })),
    orders: orderIds.map((o) => ({ id: o, event_id: snap.event_id, sponsor_id: `sp-${o}`, tier_id: '', source: 'staff_entry' as const, commitment_amount: 0, status: 'pledged' as const, portal_token: null, portal_token_expires_at: null, portal_link_sent_at: null, guest_list_deadline: null, logo_status: 'not_required' as const, program_ad_status: 'not_required' as const, givelively_order_ref: null, salesforce_opportunity_id: null, internal_notes: '', created_at: at, updated_at: at })),
    payments: [],
    event_tables: [...new Set(snap.guests.map((g) => g.table_number).filter((n): n is number => n != null))].map((n) => ({ id: tableId(n)!, event_id: snap.event_id, number: n, label: null, capacity: 0, pos_x: 0, pos_y: 0 })),
    guests: snap.guests.map((g) => ({ id: g.id, order_id: g.order_id, first_name: g.first_name, last_name: g.last_name, title: g.title ?? '', organization: g.organization ?? '', email: '', dietary_needs: null, accessibility_needs: g.accessibility_needs, guest_type: g.guest_type as Guest['guest_type'], relationship_note: null, table_id: tableId(g.table_number), seat_number: g.seat_number, badge_status: 'ready' as const, attendance_status: g.arrived ? 'checked_in' as const : 'expected' as const, qr_token: null, last_updated_by: 'staff' as const, created_at: at, updated_at: at })),
    seats: [],
    check_ins: [
      ...snap.guests.filter((g) => g.arrived).map((g) => ({ id: g.checkin_id ?? `ci-${g.id}`, event_id: snap.event_id, guest_id: g.id, order_id: g.order_id, arrival_name: null, method: 'search' as const, type: 'standard', checked_in_by: g.checked_in_by ?? '', note: '', checked_in_at: g.checked_in_at ?? at })),
      // Walk-ins and other exceptions so far tonight (their notes stay on the server).
      ...(snap.exceptions ?? []).map((e) => ({ id: e.id, event_id: snap.event_id, guest_id: null, order_id: e.order_id, arrival_name: e.name, method: 'exception' as const, type: e.type, checked_in_by: e.checked_in_by, note: '', checked_in_at: e.checked_in_at })),
    ],
    email_log: [], audit_log: [], salesforce_sync: [],
  }
}

const TABLES = ['gala_events', 'staff_users', 'sponsorship_tiers', 'sponsors', 'orders', 'payments', 'event_tables', 'guests', 'seats', 'check_ins', 'email_log', 'salesforce_sync'] as const
const PAGE = 1000 // Supabase returns at most 1,000 rows per request

export async function selectAll(client: SupabaseClient, table: string): Promise<unknown[]> {
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    // Sorted by id so each page starts where the last ended: without a sort, Postgres may return rows in a different
    // order on each request (likely on gala night, when check-ins rewrite rows), so rows could repeat or go missing.
    const { data, error } = await client.from(table).select('*').order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

/** What the signed-in person may read. Managers read the tables (row-level security allows them); volunteers get only the door list. */
export async function loadLiveDb(client: SupabaseClient, user: StaffUser): Promise<DB> {
  if (user.role === 'check_in_volunteer') {
    const { data, error } = await client.rpc('staff_checkin_snapshot')
    if (error) throw new Error(error.message)
    return volunteerDb(data as CheckinSnapshot, user)
  }
  const [lists, audit] = await Promise.all([
    Promise.all(TABLES.map((t) => selectAll(client, t))),
    // The change log only grows; the Activity page shows the latest, so load the newest 1,000.
    client.from('audit_log').select('*').order('id', { ascending: false }).limit(PAGE),
  ])
  if (audit.error) throw new Error(audit.error.message)
  const db = Object.fromEntries(TABLES.map((t, i) => [t, lists[i]])) as unknown as Omit<DB, 'meta' | 'audit_log'>
  const current = [...db.gala_events].filter((e) => e.status !== 'closed').sort((a, b) => b.year - a.year)[0]
  if (!current) throw new Error('not_found: no open gala in the database')
  // Numbers come back from Postgres numeric columns as strings in some setups; the pages do arithmetic on them.
  const num = <T extends object>(rows: T[], keys: (keyof T)[]) => rows.map((r) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, Number(r[k] ?? 0)])) }))
  return {
    ...db,
    meta: { ...loadDB().meta, current_event_id: current.id },
    sponsorship_tiers: num(db.sponsorship_tiers, ['contribution_amount', 'included_seat_count']),
    orders: num(db.orders, ['commitment_amount']),
    payments: num(db.payments, ['original_amount', 'covered_fee_amount', 'gross_amount', 'transaction_fee_amount', 'refunded_amount', 'net_amount']),
    audit_log: [...(audit.data as DB['audit_log'])].reverse(),
  }
}
