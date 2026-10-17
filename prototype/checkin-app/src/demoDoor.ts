// Demo door (no Supabase keys): the bundled invented door list, and check-ins shared between iPads through the
// demo sync server on one computer (sync-server/, port 8787). Loaded only in a build without keys (door.ts LIVE).
import { EXCEPTION_TYPES, SyncClient, newCheckinId } from '@shared/checkinSync'
import { unknownCodeMessage } from '@shared/offlineCheckin'
import type { CheckIn } from '@shared/types'
import type { Arrival, Door, DoorGuest, ExceptionRow, Gala } from './door'
import door from './doorlist.json'

export { EXCEPTION_TYPES }
export const GALA: Gala = door.events.find((e) => e.id === door.current_event_id) ?? door.events[0]
export const VOLUNTEERS = door.volunteers
const GUESTS: (DoorGuest & { qr_token: string | null })[] = door.guests.filter((g) => g.event_id === GALA.id).map((g) => ({
  id: g.id, order_id: g.order_id, first_name: g.first_name, last_name: g.last_name, title: g.title, organization: g.organization,
  sponsor: g.sponsor, category: g.category, seat_label: g.seat_label, table: g.table, access: false, qr_token: g.qr_token,
}))
export const demoGuestCount = GUESTS.length
const strip = (by: string) => by.replace(' (volunteer)', '')
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export function demoDoor(staffName: string): Door {
  const sync = new SyncClient('aafe-checkin', { check_ins: door.check_ins as CheckIn[], closures: {} },
    `iPad-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, 'ipad')
  const cis = () => sync.view().check_ins.filter((c) => c.event_id === GALA.id)
  const arrivals = () => new Map<string, Arrival>(cis().filter((c) => c.guest_id).map((c) =>
    [c.guest_id as string, { handle: c.id, at: c.checked_in_at, by: strip(c.checked_in_by), queued: sync.isQueued(c.id) }]))
  const add = (ci: Omit<CheckIn, 'id' | 'event_id' | 'checked_in_by' | 'checked_in_at'>) => {
    const full: CheckIn = { id: newCheckinId(), event_id: GALA.id, checked_in_by: staffName, checked_in_at: new Date().toISOString(), ...ci }
    sync.add(full)
    return full.id
  }
  const api: Door = {
    gala: GALA,
    guests: GUESTS,
    sponsors: door.sponsors.filter((s) => s.event_id === GALA.id).map((s) => ({ order_id: s.order_id, name: s.name })),
    get status() { return { online: sync.status.online, pending: sync.status.pending } },
    arrivals,
    exceptions: () => cis().filter((c) => !c.guest_id).sort((a, b) => b.checked_in_at.localeCompare(a.checked_in_at))
      .map((c): ExceptionRow => ({ handle: c.id, name: c.arrival_name ?? '', type: c.type, at: c.checked_in_at, by: strip(c.checked_in_by), queued: sync.isQueued(c.id) })),
    notices: () => [],
    dismiss: () => {},
    checkIn(ids, method) {
      const inNow = arrivals()
      return ids.flatMap((id) => {
        const g = GUESTS.find((x) => x.id === id)
        return g && !inNow.has(id) ? [add({ guest_id: g.id, order_id: g.order_id, arrival_name: null, method, type: 'standard', note: '' })] : []
      })
    },
    async scan(code) {
      const g = GUESTS.find((x) => x.qr_token && x.qr_token.toLowerCase() === code.trim().toLowerCase())
      if (!g) return unknownCodeMessage(code)
      const a = arrivals().get(g.id)
      if (a) return `Already checked in: ${g.first_name} ${g.last_name} at ${time(a.at)} by ${a.by}. Don't admit this ticket twice.`
      api.checkIn([g.id], 'qr')
      return null
    },
    addException: (p) => add({ guest_id: null, order_id: p.orderId || null, arrival_name: p.name, method: 'exception', type: p.type, note: p.note }),
    async undo(handles) { handles.forEach((h) => sync.remove(h)); return null },
    subscribe: (fn) => sync.subscribe(fn),
    start: () => sync.start(),
    stop: () => sync.stop(),
  }
  return api
}
