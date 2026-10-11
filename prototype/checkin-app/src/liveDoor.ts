// Live door (Supabase keys set): the signed-in staff member's door list from staff_checkin_snapshot(), check-ins
// saved on the iPad first (CheckInDesk, works offline) and sent with staff_sync_check_ins(); first arrival wins.
// The server records who checked a guest in from the sign-in, never from the iPad. QR codes are matched on their
// hash (hard rule 6). Undo: a check-in still on the iPad is taken off the queue; a synced one goes through
// staff_undo_check_in(), which allows only the person who made it or a gala admin.
import { CheckInDesk, type KeyValueStore, type QueuedCheckIn, type Snapshot, type SyncResult } from '@shared/offlineCheckin'
import { supabase } from '@shared/supabase'
import type { StaffUser } from '@shared/types'
import { CATEGORY, seatLabel, type Arrival, type Door, type DoorGuest, type ExceptionRow, type Gala } from './door'

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
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('not_configured')
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw error
  return data as T
}
/** The server's reason, without its code ("forbidden: only Kenji Abe or a gala admin…" → "Only Kenji Abe or a gala admin…"). */
const reason = (e: unknown) => { const m = String((e as { message?: string })?.message ?? e).replace(/^\w+:\s*/, ''); return m.charAt(0).toUpperCase() + m.slice(1) }

export const deskFor = (staff: StaffUser) =>
  new CheckInDesk({ store, device: deviceName(), staffName: staff.name, prefix: `aafe-checkin:${staff.id}:` })

/** Loads the list (or the one saved on this iPad, when offline). Null when the gala is closed: the saved list is cleared. */
export async function loadDoor(staff: StaffUser): Promise<Door | null> {
  const desk = deskFor(staff)
  try {
    const s = await rpc<Snapshot>('staff_checkin_snapshot')
    if (desk.snapshot && desk.snapshot.event_id !== s.event_id) desk.clear()
    if (s.status === 'closed') { desk.clear(); return null }
    desk.saveSnapshot(s)
  } catch (e) {
    if (!desk.snapshot) throw e   // no connection and nothing saved: nothing to show
  }
  return liveDoor(desk)
}

function liveDoor(desk: CheckInDesk): Door {
  const listeners = new Set<() => void>()
  let online: boolean | null = null, timer: ReturnType<typeof setInterval> | null = null, busy = false
  const emit = () => listeners.forEach((f) => f())
  const snap = () => desk.snapshot as Snapshot
  const queuedFor = (guestId: string) => desk.pending().find((q): q is Extract<QueuedCheckIn, { kind: 'guest' }> => q.kind === 'guest' && q.guest_id === guestId)
  const s0 = snap()
  const gala: Gala = { id: s0.event_id, name: s0.event_name, event_date: s0.event_date ?? '', doors_time: s0.doors_time ?? null, venue_name: s0.venue_name ?? null }
  const guests: DoorGuest[] = s0.guests.map((g) => ({
    id: g.id, order_id: g.order_id, first_name: g.first_name, last_name: g.last_name, title: g.title, organization: g.organization,
    sponsor: g.sponsor, category: CATEGORY[g.guest_type] ?? g.guest_type, seat_label: seatLabel(g.guest_type, g.sponsor, g.package),
    table: g.table_number, access: !!g.accessibility_needs?.trim(),
  }))
  const sponsors = [...new Map([...s0.guests.filter((g) => g.guest_type === 'sponsor_guest').map((g) => [g.order_id, g.sponsor] as const),
    ...s0.unnamed_seats.map((u) => [u.order_id, u.sponsor] as const)]).entries()].map(([order_id, name]) => ({ order_id, name }))

  /** Send what's waiting, then fetch the latest list (other doors' check-ins). */
  async function tick() {
    if (busy) return
    busy = true
    try {
      const r = await desk.sync((items) => rpc<SyncResult[]>('staff_sync_check_ins', { p_items: items }))
      if (r.offline) { online = false; return }
      const s = await rpc<Snapshot>('staff_checkin_snapshot')
      if (s.event_id === gala.id) desk.saveSnapshot(s)
      online = true
    } catch {
      online = false
    } finally {
      busy = false
      emit()
    }
  }
  const kick = () => { emit(); void tick() }

  const api: Door = {
    gala, guests, sponsors,
    get status() { return { online, pending: desk.pending().length } },
    arrivals() {
      const m = new Map<string, Arrival>()
      for (const g of desk.guests()) {
        if (!g.arrived || !g.checked_in_at) continue
        const q = queuedFor(g.id)
        const handle = q?.client_id ?? g.checkin_client_id ?? g.checkin_id
        if (handle) m.set(g.id, { handle, at: g.checked_in_at, by: g.checked_in_by ?? '', queued: !!q })
      }
      return m
    },
    exceptions() {
      const waiting: ExceptionRow[] = desk.pending().flatMap((q) => q.kind === 'exception'
        ? [{ handle: q.client_id, name: q.name, type: q.type, at: q.at, by: 'this iPad', queued: true }] : [])
      const synced: ExceptionRow[] = (snap().exceptions ?? []).map((e) => ({ handle: e.client_id ?? e.id, name: e.name, type: e.type, at: e.checked_in_at, by: e.checked_in_by, queued: false }))
      return [...waiting, ...synced].sort((a, b) => b.at.localeCompare(a.at))
    },
    notices: () => desk.notices(),
    dismiss: (id) => { desk.dismissNotice(id); emit() },
    checkIn(ids, method) {
      const made = ids.flatMap((id) => desk.checkIn(id, method).kind === 'checked_in' ? [queuedFor(id)?.client_id ?? ''] : []).filter(Boolean)
      if (made.length) kick()
      return made
    },
    async scan(code) {
      const out = await desk.scan(code)
      switch (out.kind) {
        case 'checked_in': kick(); return null
        case 'already': return `${out.guest.first_name} ${out.guest.last_name}: ${out.message}. Don't admit this ticket twice.`
        case 'expired_code': return `This ticket's code for ${out.guest.first_name} ${out.guest.last_name} has expired. Check the guest in by name.`
        default: return `No guest found for code “${code.trim()}”.`
      }
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
        try { await rpc('staff_undo_check_in', { p_id: h }) } catch (e) {
          const m = reason(e)
          problems.push(/no check-in to undo/i.test(m) ? 'That check-in is still sending. Try Undo again in a moment.'
            : /fetch|network|failed/i.test(m) ? 'Undo needs a connection for a check-in that has already synced.' : m)
        }
      }
      kick()
      return problems[0] ?? null
    },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
    start() {
      if (timer) return
      void tick()
      timer = setInterval(() => void tick(), 5000)
      window.addEventListener('online', kick)
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
      window.removeEventListener('online', kick)
    },
  }
  return api
}
