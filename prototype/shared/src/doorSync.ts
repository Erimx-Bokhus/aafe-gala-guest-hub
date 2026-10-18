// The door list by changes (Gate 3, data use, part 3). The iPad (checkin-app/src/liveDoor.ts) and the staff app's
// volunteer view (staff-app/src/api.ts) keep their saved list up to date with door_sync(cursor) in backend.sql: after the
// first call, only the guests whose line changed, the guests no longer on the list, and the unnamed seats and walk-ins
// when something under them changed. The cursor is saved with the list, so it survives the iPad restarting.
import type { Snapshot, SnapshotException, SnapshotGuest } from './offlineCheckin'

/** door_sync()'s answer: the snapshot's fields, but only what changed unless `full`. */
export interface DoorSync extends Omit<Snapshot, 'guests' | 'unnamed_seats' | 'exceptions' | 'cursor' | 'full_at'> {
  cursor: string
  full: boolean
  guests: SnapshotGuest[]
  /** Guests no longer on the list: removed, or their order cancelled or moved to another gala. */
  removed: string[]
  /** Whole, and only when something under them changed; null means unchanged. */
  unnamed_seats: Snapshot['unnamed_seats'] | null
  exceptions: SnapshotException[] | null
  /** How many guests the list has, to check the merged copy against. */
  count: number
}

/** Everything again now and then, whatever the checks say: a safety net. */
export const DOOR_FULL_EVERY_MS = 4 * 3600_000

const byName = (a: SnapshotGuest, b: SnapshotGuest) =>
  a.last_name.localeCompare(b.last_name, 'en', { sensitivity: 'base' }) || a.first_name.localeCompare(b.first_name, 'en', { sensitivity: 'base' })

/** A changed guest keeps its place and a new one is slotted in by name, so the list on screen doesn't reshuffle. */
function mergeGuests(base: SnapshotGuest[], changed: SnapshotGuest[], removed: string[]): SnapshotGuest[] {
  if (!changed.length && !removed.length) return base   // the same array: a caller can tell nothing changed
  const gone = new Set(removed), fresh = new Map(changed.map((g) => [g.id, g]))
  const guests = base.filter((g) => !gone.has(g.id)).map((g) => fresh.get(g.id) ?? g)
  const known = new Set(guests.map((g) => g.id))
  for (const g of changed) {
    if (known.has(g.id)) continue
    const at = guests.findIndex((x) => byName(g, x) < 0)
    guests.splice(at < 0 ? guests.length : at, 0, g)
  }
  return guests
}

/**
 * Merges an answer into the saved list. `drifted`: the merged list no longer has the server's count (e.g. a guest moved
 * out of reach without a removal), so the caller asks for everything again.
 */
export function mergeDoorSync(saved: Snapshot | null, d: DoorSync): { snapshot: Snapshot; drifted: boolean } {
  const base = d.full || !saved ? null : saved
  const { cursor, removed, count, guests: changed, unnamed_seats, exceptions } = d
  const event = { event_id: d.event_id, event_name: d.event_name, generated_at: d.generated_at, event_date: d.event_date,
    doors_time: d.doors_time, venue_name: d.venue_name, status: d.status }
  const guests = base ? mergeGuests(base.guests, changed, removed) : changed
  const snapshot: Snapshot = {
    ...event,
    guests,
    unnamed_seats: unnamed_seats ?? base?.unnamed_seats ?? [],
    exceptions: exceptions ?? base?.exceptions ?? [],
    cursor,
    full_at: base ? base.full_at : undefined,
  }
  return { snapshot, drifted: guests.length !== count }
}

/**
 * One refresh: asks for what changed since the saved list's cursor (or everything, the first time, after 4 hours, or
 * for another gala), merges it, and asks for everything again if the merged list drifted. Null: no gala is open.
 * `call` is door_sync(p_cursor, p_event).
 */
export async function syncDoorList(
  call: (cursor: string | null, event: string | null) => Promise<DoorSync | null>,
  saved: Snapshot | null,
  now: number = Date.now(),
): Promise<Snapshot | null> {
  const from = saved?.cursor && saved.full_at !== undefined && now - saved.full_at < DOOR_FULL_EVERY_MS ? saved.cursor : null
  let d = await call(from, saved?.event_id ?? null)
  if (!d) return null
  let m = mergeDoorSync(from ? saved : null, d)
  if (!d.full && m.drifted) {
    d = await call(null, d.event_id)
    if (!d) return null
    m = mergeDoorSync(null, d)
  }
  return d.full ? { ...m.snapshot, full_at: now } : m.snapshot
}
