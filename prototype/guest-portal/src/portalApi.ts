// Guest-portal data adapter.
// LIVE (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY set): calls the backend in database/backend.sql:
//   fetchPortalView(token)            -> portal_get_view
//   saveAttendeeLive(token, slot, v)  -> portal_save_guest
//   removeAttendeeLive(token, slot)   -> portal_release_seat
// OFFLINE (no env, e.g. the OPEN-*.html files): the functions below read/write the synthetic DB in memory.
// The backend validates the token (hashed, expiring) and returns ONLY the fields below.
// It never returns payment method/processor/fees, internal notes, relationship owner, or other orders.
import { addAudit, nowIso, orderMoney, seatStats, sponsorOf, tierOf, uid } from '@shared/data'
import type { DB, SeatStatus } from '@shared/types'

export interface AttendeeInput { first_name: string; last_name: string; title: string; organization: string; email: string; dietary_needs: string; accessibility_needs: string }

export interface PortalView {
  orderId: string; organization: string; contactName: string; tierName: string; deadline: string | null
  event: { name: string; date: string; doors: string; venue: string; address: string; dress: string }
  money: { commitment: number; paid: number; balance: number; status: 'paid' | 'partial' | 'pledged' | 'comp'; payments: { date: string; amount: number }[] }
  stats: ReturnType<typeof seatStats>
  seats: { slot: number; status: SeatStatus; guest: (AttendeeInput & { display_name?: string | null; updated_at: string }) | null }[]
  activity: { at: string; action: string; summary: string }[]
}

export function getPortalView(db: DB, token: string): PortalView | null {
  const o = db.orders.find((x) => x.portal_token === token && x.status !== 'cancelled')
  if (!o) return null
  const sp = sponsorOf(db, o.sponsor_id)
  const ev = db.gala_events.find((e) => e.id === o.event_id)!
  const m = orderMoney(db, o.id)
  const status = o.status === 'comp' ? 'comp' : m.balance <= 0.005 && m.pays.length ? 'paid' : m.pays.length ? 'partial' : 'pledged'
  const seats = db.seats.filter((s) => s.order_id === o.id && s.status !== 'cancelled').sort((a, b) => a.slot_number - b.slot_number).map((s) => {
    const g = s.guest_id ? db.guests.find((x) => x.id === s.guest_id) : null
    return { slot: s.slot_number, status: s.status, guest: g ? { first_name: g.first_name, last_name: g.last_name,
      // Demo only: full-name proposal. Live save needs backend support (Aisling).
      display_name: 'display_name' in g && typeof g.display_name === 'string' ? g.display_name : null,
      title: g.title ?? '', organization: g.organization ?? '', email: g.email ?? '', dietary_needs: g.dietary_needs ?? '', accessibility_needs: g.accessibility_needs ?? '', updated_at: g.updated_at } : null }
  })
  return {
    orderId: o.id, organization: sp.organization_name, contactName: sp.primary_contact_name, tierName: tierOf(db, o.tier_id).name, deadline: o.guest_list_deadline,
    event: { name: ev.name, date: ev.event_date, doors: ev.doors_time, venue: ev.venue_name, address: ev.venue_address, dress: ev.dress_code },
    money: { commitment: m.commitment, paid: m.paid, balance: m.balance, status, payments: m.pays.map((p) => ({ date: p.received_at, amount: p.gross_amount })) },
    stats: seatStats(db, o.id), seats,
    activity: db.audit_log.filter((a) => a.order_id === o.id && a.guest_visible).map((a) => ({ at: a.at, action: a.action, summary: a.summary })).reverse(),
  }
}

export function saveAttendee(db: DB, token: string, slot: number, input: AttendeeInput): DB {
  const o = db.orders.find((x) => x.portal_token === token)!
  const seat = db.seats.find((s) => s.order_id === o.id && s.slot_number === slot)!
  const at = nowIso()
  // Demo only: full-name proposal. Live save needs backend support (Aisling).
  const name = [input.first_name, input.last_name].filter(Boolean).join(' ').trim()
  const clean = { ...input, first_name: name, last_name: '', display_name: name,
    dietary_needs: input.dietary_needs || null, accessibility_needs: input.accessibility_needs || null }
  let guests = db.guests
  let guestId = seat.guest_id
  let action = 'guest.updated'
  if (guestId) {
    guests = guests.map((g) => g.id === guestId ? { ...g, ...clean, updated_at: at, last_updated_by: 'guest_portal' as const,
      // editing a printed badge means it must be reprinted
      badge_status: g.badge_status === 'printed' ? 'reprint_needed' as const : 'needs_review' as const } : g)
  } else {
    action = 'guest.submitted'
    guestId = uid('g')
    guests = [...guests, { id: guestId, order_id: o.id, ...clean, guest_type: o.tier_id.endsWith('ticket') ? 'ticket_holder' : 'sponsor_guest', relationship_note: null, table_id: null, seat_number: null, badge_status: 'needs_review', attendance_status: 'expected', qr_token: null, last_updated_by: 'guest_portal', created_at: at, updated_at: at }]
  }
  const from = seat.status
  const seats = db.seats.map((s) => s.id === seat.id ? { ...s, guest_id: guestId, status: 'submitted' as const, updated_at: at } : s)
  return addAudit({ ...db, guests, seats }, { at, actor_type: 'guest_portal', actor: o.portal_token ? `Guest portal (${sponsorOf(db, o.sponsor_id).primary_contact_name})` : 'Guest portal', entity: 'guest', entity_id: guestId!, order_id: o.id, action, from_state: from, to_state: 'submitted', guest_visible: true, summary: action === 'guest.submitted' ? `${name} added to seat ${slot}.` : `${name} updated (seat ${slot}).` })
}

export function removeAttendee(db: DB, token: string, slot: number): DB {
  const o = db.orders.find((x) => x.portal_token === token)!
  const seat = db.seats.find((s) => s.order_id === o.id && s.slot_number === slot)!
  const g = db.guests.find((x) => x.id === seat.guest_id)
  if (!g) return db
  const at = nowIso()
  return addAudit({ ...db, guests: db.guests.filter((x) => x.id !== g.id), seats: db.seats.map((s) => s.id === seat.id ? { ...s, guest_id: null, status: 'unnamed' as const, updated_at: at } : s) },
    { at, actor_type: 'guest_portal', actor: 'Guest portal', entity: 'guest', entity_id: g.id, order_id: o.id, action: 'guest.removed', from_state: seat.status, to_state: 'unnamed', guest_visible: true, summary: `${g.first_name} ${g.last_name} removed from seat ${slot}.` })
}

// ---- LIVE backend (Supabase PostgREST RPC; the anon key is public by design)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const LIVE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

async function rpc(fn: string, args: Record<string, unknown>): Promise<PortalView> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY!, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`)
  return body as PortalView
}

/** null = invalid or expired link */
export const fetchPortalView = (token: string) =>
  rpc('portal_get_view', { p_token: token }).catch((e: Error) => { if (e.message === 'invalid_link') return null; throw e })
export const saveAttendeeLive = (token: string, slot: number, input: AttendeeInput) => rpc('portal_save_guest', { p_token: token, p_slot: slot, p_guest: input })
export const removeAttendeeLive = (token: string, slot: number) => rpc('portal_release_seat', { p_token: token, p_slot: slot })
