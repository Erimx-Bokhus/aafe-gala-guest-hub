// Live door (Supabase keys set): the signed-in staff member's door list, kept by changes with door_sync() (doorSync.ts), check-ins
// saved on the iPad first (CheckInDesk, works offline) and sent with staff_sync_check_ins(); first arrival wins.
// The server records who checked a guest in from the sign-in, never from the iPad. QR codes are matched on their
// hash (hard rule 6). Undo: a check-in still on the iPad is taken off the queue; a synced one goes through
// staff_undo_check_in(), which allows only the person who made it or a gala admin.
import type { PostgrestError } from '@supabase/supabase-js'
import { syncDoorList, type DoorSync } from '@shared/doorSync'
import { CheckInDesk, isNetworkError, unknownCodeMessage, type KeyValueStore, type QueuedCheckIn, type Snapshot, type SyncResult } from '@shared/offlineCheckin'
import { needStatus } from '@shared/guestNeeds'
import { supabase } from '@shared/supabase'
import type { StaffUser } from '@shared/types'
import { CATEGORY, seatLabel, type Arrival, type Door, type DoorGuest, type ExceptionRow, type Gala } from './door'

/** Check-ins made at this door go to AAFE every 5 seconds. */
export const SYNC_EVERY_MS = 5_000
/**
 * Other doors' arrivals and guests added since: every 15 seconds the iPad asks door_sync() for what changed (about
 * 0.4 KB when nothing did) instead of the whole list (about 280 KB on the full gala), which came once a minute
 * before (Gate 3, data use, part 3).
 */
export const LIST_EVERY_MS = 15_000
import { checkSignOut } from './signOut'

/** localStorage, or memory when the browser blocks it (the door keeps working either way). */
function safeStore(): KeyValueStore {
  const mem = new Map<string, string>()
  const ls = (() => { try { const s = window.localStorage; s.setItem('__aafe_t', '1'); s.removeItem('__aafe_t'); return s } catch { return null } })()
  return {
    getItem: (k) => { try { return ls ? ls.getItem(k) : mem.get(k) ?? null } catch { return mem.get(k) ?? null } },
    setItem: (k, v) => { mem.set(k, v); try { ls?.setItem(k, v) } catch { /* memory only */ } },
    removeItem: (k) => { mem.delete(k); try { ls?.removeItem(k) } catch { /* memory only */ } },
  }
}
const store = safeStore()
/** One name per iPad, kept across reloads, so "by Kenji Abe (iPad-7Q2M)" says which door. */
function deviceName() {
  const k = 'aafe-checkin-device'
  const d = store.getItem(k) ?? `iPad-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  store.setItem(k, d)
  return d
}
/** Calls a server function. Its reply is typed by that function's contract, which the backend tests check (test-offline-checkin.mjs). */
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('not_configured')
  const res: { data: unknown; error: PostgrestError | null } = await supabase.rpc(fn, args)
  if (res.error) throw res.error
  return res.data as T
}
/** The saved list brought up to date: what changed since its cursor, merged (doorSync.ts, test-door-sync.mjs). */
const refreshList = (desk: CheckInDesk) =>
  syncDoorList((cursor, event) => rpc<DoorSync | null>('door_sync', { p_cursor: cursor, p_event: event }), desk.snapshot)
/** An error's message, whatever was thrown (a Supabase error is an object with a message, not always an Error). */
function messageOf(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e && typeof e.message === 'string') return e.message
  return String(e)
}
/** The server's reason, without its code ("forbidden: only Kenji Abe or a gala admin…" → "Only Kenji Abe or a gala admin…"). */
const reason = (e: unknown) => { const m = messageOf(e).replace(/^\w+:\s*/, ''); return m.charAt(0).toUpperCase() + m.slice(1) }

export const deskFor = (staff: StaffUser) =>
  new CheckInDesk({ store, device: deviceName(), staffName: staff.name, prefix: `aafe-checkin:${staff.id}:` })

/** Before sign-out: sends the check-ins still waiting on this iPad and says whether anything would be lost (signOut.ts). */
export const checkLiveSignOut = (staff: StaffUser) =>
  checkSignOut(deskFor(staff), (items) => rpc<SyncResult[]>('staff_sync_check_ins', { p_items: items }), staff.role)

/** Loads the list (or the one saved on this iPad, when offline). Null when the gala is closed: the saved list is cleared. */
export async function loadDoor(staff: StaffUser): Promise<Door | null> {
  const desk = deskFor(staff)
  try {
    const s = await refreshList(desk)
    // No open gala (the server answers null once it's closed): the guest list leaves the iPad (Gate 2 review, Oct 15).
    if (!s || s.status === 'closed') { desk.forgetGuests(); return null }
    if (desk.snapshot && desk.snapshot.event_id !== s.event_id) desk.clear()
    desk.saveSnapshot(s)
  } catch (e) {
    if (!desk.snapshot) throw e   // no connection and nothing saved: nothing to show
  }
  const saved = desk.snapshot
  if (!saved) throw new Error('internal error: the door opens only with a saved list')
  return liveDoor(desk, saved)
}

/** The list on screen, from a saved list, with a key that changes only when a guest or sponsor does. */
function buildView(s: Snapshot) {
  const guests: DoorGuest[] = s.guests.map((g) => ({
    id: g.id, order_id: g.order_id, first_name: g.first_name, last_name: g.last_name, title: g.title, organization: g.organization,
    sponsor: g.sponsor, category: CATEGORY[g.guest_type] ?? g.guest_type, seat_label: seatLabel(g.guest_type, g.sponsor, g.package),
    table: g.table_number, // A list saved before Oct 13 has the details instead of the flag; it is replaced on the next refresh.
    access: g.has_access_needs ?? needStatus(g.accessibility_needs) === 'some',
  }))
  const sponsors = [...new Map([...s.guests.filter((g) => g.guest_type === 'sponsor_guest').map((g) => [g.order_id, g.sponsor] as const),
    ...s.unnamed_seats.map((u) => [u.order_id, u.sponsor] as const)]).entries()].map(([order_id, name]) => ({ order_id, name }))
  return { guests, sponsors, key: JSON.stringify([guests, sponsors]) }
}

const queuedFor = (desk: CheckInDesk, guestId: string) =>
  desk.pending().find((q): q is Extract<QueuedCheckIn, { kind: 'guest' }> => q.kind === 'guest' && q.guest_id === guestId)

/** Who has arrived, each with the handle Undo needs: the iPad's own check-in if it's still waiting, else the server's. */
function arrivalsOf(desk: CheckInDesk): Map<string, Arrival> {
  const m = new Map<string, Arrival>()
  for (const g of desk.guests()) {
    if (!g.arrived || !g.checked_in_at) continue
    const q = queuedFor(desk, g.id)
    const handle = q?.client_id ?? g.checkin_client_id ?? g.checkin_id
    if (handle) m.set(g.id, { handle, at: g.checked_in_at, by: g.checked_in_by ?? '', queued: !!q })
  }
  return m
}

/** Walk-ins and other exceptions, the ones still on this iPad first, newest first. */
function exceptionsOf(desk: CheckInDesk): ExceptionRow[] {
  const waiting: ExceptionRow[] = desk.pending().flatMap((q) => q.kind === 'exception'
    ? [{ handle: q.client_id, name: q.name, type: q.type, at: q.at, by: 'this iPad', queued: true }] : [])
  const synced: ExceptionRow[] = (desk.snapshot?.exceptions ?? []).map((e) => ({ handle: e.client_id ?? e.id, name: e.name, type: e.type, at: e.checked_in_at, by: e.checked_in_by, queued: false }))
  return [...waiting, ...synced].sort((a, b) => b.at.localeCompare(a.at))
}

/** What the door says when a QR scan checks no one in. Every outcome is named (R7). */
function scanMessage(out: Exclude<Awaited<ReturnType<CheckInDesk['scan']>>, { kind: 'checked_in' }>, code: string): string {
  switch (out.kind) {
    case 'already': return `${out.guest.first_name} ${out.guest.last_name}: ${out.message}. Don't admit this ticket twice.`
    case 'expired_code': return `This ticket's code for ${out.guest.first_name} ${out.guest.last_name} has expired. Check the guest in by name.`
    case 'unknown_code':
    case 'not_found': return unknownCodeMessage(code)
  }
}

/** Undo the iPad couldn't do on its own: still sending, no connection, someone else's check-in (the server names who may), or anything else. */
function undoProblem(m: string): string {
  if (/no check-in to undo/i.test(m)) return "That check-in is still sending. In a few seconds, tap the guest's name and choose Undo check-in."
  if (isNetworkError(m)) return 'Undo needs a connection for a check-in that has already synced. Try again once this iPad is back online.'
  if (/^Only /.test(m)) return m
  return "Undo didn't go through. Try again, or ask a gala admin to undo it."
}

/** What staff do at the door: check in, scan a ticket, add a walk-in, undo. `kick` sends it and refreshes the screen. */
function doorActions(desk: CheckInDesk, kick: () => void): Pick<Door, 'checkIn' | 'scan' | 'addException' | 'undo'> {
  return {
    checkIn(ids, method) {
      const made = ids.flatMap((id) => desk.checkIn(id, method).kind === 'checked_in' ? [queuedFor(desk, id)?.client_id ?? ''] : []).filter(Boolean)
      if (made.length) kick()
      return made
    },
    async scan(code) {
      const out = await desk.scan(code)
      if (out.kind !== 'checked_in') return { message: scanMessage(out, code) }
      const q = queuedFor(desk, out.guest.id)
      if (!q) throw new Error(`QR check-in for guest ${out.guest.id} is not in this iPad's queue`)
      kick()
      return { guestId: out.guest.id, handle: q.client_id }
    },
    addException(p) {
      const item = desk.checkInException({ name: p.name, order_id: p.orderId || null, type: p.type, note: p.note })
      kick()
      return item.client_id
    },
    async undo(handles) {
      const problems: string[] = []
      for (const h of handles) {
        if (desk.cancel(h)) continue
        try { await rpc('staff_undo_check_in', { p_id: h }); desk.forgetCheckIn(h) } catch (e) { problems.push(undoProblem(reason(e))) }
      }
      kick()
      return problems[0] ?? null
    },
  }
}

function liveDoor(desk: CheckInDesk, s0: Snapshot): Door {
  const listeners = new Set<() => void>()
  let online: boolean | null = null, refused = false, closed = false, timer: ReturnType<typeof setInterval> | null = null, busy = false
  let listAt = Date.now()   // the list this door opened with was just fetched
  const emit = () => { listeners.forEach((f) => { f() }) }
  const gala: Gala = { id: s0.event_id, name: s0.event_name, event_date: s0.event_date ?? '', doors_time: s0.doors_time ?? null, venue_name: s0.venue_name ?? null }
  // Arrivals already come from the latest list (desk.guests()); a list that only changed who arrived keeps the same
  // arrays, so the screen doesn't re-sort every few seconds.
  let view = buildView(s0)

  /** Send what's waiting; every 15 seconds (or when asked), also fetch what changed on the list (other doors' check-ins). */
  async function tick(withList = false) {
    if (busy) return
    busy = true
    try {
      const r = await desk.sync((items) => rpc<SyncResult[]>('staff_sync_check_ins', { p_items: items }))
      refused = r.refused
      if (r.offline) { online = false; return }
      online = true
      if (!withList && Date.now() - listAt < LIST_EVERY_MS) return
      const s = await refreshList(desk)
      listAt = Date.now()
      // The gala closed: its list leaves the iPad; check-ins not synced yet stay queued in case it reopens.
      if (!s || s.status === 'closed') { desk.forgetGuests(); closed = true; return }
      if (s.event_id === gala.id) {
        desk.saveSnapshot(s)
        const next = buildView(s)
        if (next.key !== view.key) view = next
      }
    } catch (e) {
      if (isNetworkError(e)) online = false
      else refused = true
    } finally {
      busy = false
      emit()
    }
  }
  const kick = () => { emit(); void tick() }
  const back = () => { emit(); void tick(true) }   // the connection came back: send, and catch up on the list
  return {
    gala,
    get guests() { return view.guests },
    get sponsors() { return view.sponsors },
    get status() { return { online, pending: desk.pending().length, refused, closed } },
    arrivals: () => arrivalsOf(desk),
    exceptions: () => exceptionsOf(desk),
    notices: () => desk.notices(),
    dismiss: (id) => { desk.dismissNotice(id); emit() },
    ...doorActions(desk, kick),
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
    start() {
      if (timer) return
      void tick()
      timer = setInterval(() => void tick(), SYNC_EVERY_MS)
      window.addEventListener('online', back)
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
      window.removeEventListener('online', back)
    },
  }
}
