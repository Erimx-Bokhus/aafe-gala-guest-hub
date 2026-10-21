// @vitest-environment jsdom
// The live door list follows the server while the iPad is open (the Oct 12 audit's "frozen list" finding): a guest
// added after the door opened (a sponsor naming a guest, a comp added in the staff app) appears on the next refresh,
// and a refresh that only changes who arrived keeps the same list, so the screen doesn't re-sort every few seconds.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Snapshot, SnapshotGuest } from '@shared/offlineCheckin'
import type { StaffUser } from '@shared/types'

const server = vi.hoisted(() => ({
  snapshot: null as Snapshot | null, syncError: null as string | null, lists: 0, undoError: null as { message: string } | null,
  sent: [] as SnapshotGuest[], cursors: [] as (string | null)[], undone: [] as string[],
}))
/** door_sync() for one iPad: everything without a cursor, else the lines changed or gone since its last answer. */
function doorSync(cursor: string | null) {
  const s = server.snapshot
  if (!s) return null
  const full = cursor === null, before = new Map(server.sent.map((g) => [g.id, JSON.stringify(g)]))
  server.cursors.push(cursor)
  server.sent = s.guests
  return {
    ...s, cursor: String(server.cursors.length), full, count: s.guests.length,
    guests: full ? s.guests : s.guests.filter((g) => before.get(g.id) !== JSON.stringify(g)),
    removed: full ? [] : [...before.keys()].filter((id) => !s.guests.some((g) => g.id === id)),
    unnamed_seats: full ? s.unnamed_seats : null, exceptions: full ? s.exceptions : null,   // no test here changes these
  }
}
vi.mock('@shared/supabase', () => ({
  supabase: {
    rpc: async (fn: string, args: { p_items?: { client_id: string }[]; p_cursor?: string | null; p_id?: string }) => {
      if (fn === 'staff_undo_check_in' && server.undoError) return { data: null, error: server.undoError }
      if (fn === 'staff_undo_check_in') { server.undone.push(args.p_id ?? ''); return { data: { ok: true }, error: null } }
      if (fn === 'door_sync') { server.lists++; return { data: doorSync(args.p_cursor ?? null), error: null } }
      if (server.syncError) return { data: null, error: { message: server.syncError } }
      return { data: (args.p_items ?? []).map((i) => ({ client_id: i.client_id, status: 'checked_in' })), error: null }
    },
  },
}))
const { loadDoor } = await import('./liveDoor')

// Invented guests only (hard rule 1).
const guest = (id: string, first: string, last: string, o: Partial<SnapshotGuest> = {}): SnapshotGuest => ({
  id, order_id: 'ord-1', first_name: first, last_name: last, title: null, organization: 'Example Partners', sponsor: 'Example Partners',
  guest_type: 'sponsor_guest', table_number: 4, seat_number: 1, has_access_needs: false, qr_hash: null, qr_expires_at: null,
  arrived: false, checked_in_at: null, checked_in_by: null, device: null, ...o,
})
const list = (guests: SnapshotGuest[], at: string): Snapshot => ({
  event_id: 'ev-2027', event_name: 'AAFE Gala (demo)', generated_at: at, status: 'live', unnamed_seats: [], exceptions: [], guests,
})
const KENJI: StaffUser = { id: 'st-test-door', name: 'Door Tester', email: 'door@example.org', role: 'check_in_volunteer' }

beforeEach(() => { localStorage.clear(); server.syncError = null; server.lists = 0; server.undoError = null; server.sent = []; server.cursors = []; server.undone = [] })
afterEach(() => vi.useRealTimers())
/** The list is refreshed every 15 seconds: move the clock past that before a refresh is expected. */
const aMinuteLater = () => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(Date.now() + 61_000) }

describe('live door list', () => {
  it('clears the list from the iPad once no gala is open (the server answers null)', async () => {
    server.snapshot = list([guest('g-1', 'Ana', 'Diaz')], '2027-05-20T22:00:00Z')
    expect(await loadDoor(KENJI)).not.toBeNull()
    server.snapshot = null
    expect(await loadDoor(KENJI)).toBeNull()
    expect(JSON.stringify({ ...localStorage })).not.toContain('Diaz')
  })

  it('shows a guest added after the door opened, on the next refresh', async () => {
    server.snapshot = list([guest('g-1', 'Ana', 'Diaz')], '2027-05-20T22:00:00Z')
    const door = (await loadDoor(KENJI))!
    expect(door.guests.map((g) => g.last_name)).toEqual(['Diaz'])

    server.snapshot = list([guest('g-1', 'Ana', 'Diaz'),
      guest('g-2', 'Rose', 'Tan', { order_id: 'ord-comp', sponsor: 'Complimentary guest of AAFE', guest_type: 'comp_relationship' }),
      guest('g-3', 'Lily', 'Huang', { order_id: 'ord-2', sponsor: 'Mott Harbor (synthetic)' })], '2027-05-20T22:00:05Z')
    const changed = vi.fn()
    door.subscribe(changed)
    aMinuteLater()
    door.start()
    await vi.waitFor(() => expect(changed).toHaveBeenCalled())
    door.stop()

    expect(door.guests.map((g) => g.last_name).sort()).toEqual(['Diaz', 'Huang', 'Tan'])
    expect(door.sponsors.map((s) => s.name)).toContain('Mott Harbor (synthetic)')
  })

  it('keeps the same list when a refresh only changes who arrived', async () => {
    server.snapshot = list([guest('g-1', 'Ana', 'Diaz'), guest('g-2', 'Ben', 'Ortiz')], '2027-05-20T22:00:00Z')
    const door = (await loadDoor(KENJI))!
    const before = door.guests

    server.snapshot = list([guest('g-1', 'Ana', 'Diaz', { arrived: true, checked_in_at: '2027-05-20T23:01:00Z', checked_in_by: 'Door 2', checkin_id: 'c-1' }),
      guest('g-2', 'Ben', 'Ortiz')], '2027-05-20T23:01:05Z')
    const changed = vi.fn()
    door.subscribe(changed)
    aMinuteLater()
    door.start()
    await vi.waitFor(() => expect(changed).toHaveBeenCalled())
    door.stop()

    expect(door.guests).toBe(before)
    expect([...door.arrivals().keys()]).toEqual(['g-1'])
  })

  // Gate 3, data use: check-ins go every 5 seconds; other doors' arrivals come every 15, as changes only.
  it('sends check-ins every 5 seconds but asks for list changes every 15, or when the connection comes back', async () => {
    server.snapshot = list([guest('g-1', 'Ana', 'Diaz'), guest('g-2', 'Ben', 'Ortiz')], '2027-05-20T22:00:00Z')
    const door = (await loadDoor(KENJI))!
    expect(server.lists).toBe(1)
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    door.start()
    door.checkIn(['g-1'], 'search')
    await vi.advanceTimersByTimeAsync(10_000)              // two ticks: check-ins sent, no list
    expect(door.status.pending).toBe(0)
    expect(server.lists).toBe(1)
    await vi.advanceTimersByTimeAsync(5_000)               // 15 seconds: one ask
    expect(server.lists).toBe(2)
    window.dispatchEvent(new Event('online'))              // back online: catch up at once
    await vi.advanceTimersByTimeAsync(0)
    expect(server.lists).toBe(3)
    door.stop()
  })

  // Oct 19 click-through: right after a check-in synced, the counter dropped it and the toast's Undo said "Undone"
  // without asking the server, so the guest stayed checked in.
  it('a synced check-in still counts before the next list refresh, and Undo then reaches the server', async () => {
    server.snapshot = list([guest('g-1', 'Ana', 'Diaz'), guest('g-2', 'Ben', 'Ortiz')], '2027-05-20T22:00:00Z')
    const door = (await loadDoor(KENJI))!
    const [handle] = door.checkIn(['g-1'], 'search')
    await vi.waitFor(() => expect(door.status.pending).toBe(0))   // sent at once; the list isn't due for 15 seconds
    expect(server.lists).toBe(1)
    expect(door.arrivals().get('g-1')).toMatchObject({ handle, queued: false })
    expect(await door.undo([handle!])).toBeNull()
    expect(server.undone).toEqual([handle])
    expect(door.arrivals().has('g-1')).toBe(false)
  })

  it('after the first list, asks only for what changed, also after the iPad restarts', async () => {
    server.snapshot = list([guest('g-1', 'Ana', 'Diaz'), guest('g-2', 'Ben', 'Ortiz')], '2027-05-20T22:00:00Z')
    await loadDoor(KENJI)
    server.snapshot = list([guest('g-1', 'Ana', 'Diaz', { arrived: true, checked_in_at: '2027-05-20T23:01:00Z', checked_in_by: 'Door 2', checkin_id: 'c-1' }),
      guest('g-2', 'Ben', 'Ortiz')], '2027-05-20T23:01:05Z')
    const door = (await loadDoor(KENJI))!   // the app reopened: the saved list and its cursor are still on the iPad
    expect(server.cursors).toEqual([null, '1'])
    expect([...door.arrivals().keys()]).toEqual(['g-1'])
    expect(door.guests.map((g) => g.last_name)).toEqual(['Diaz', 'Ortiz'])
  })

  it('tells "offline" from "AAFE refused" (an expired sign-in), and keeps the check-ins either way', async () => {
    server.snapshot = list([guest('g-1', 'Ana', 'Diaz')], '2027-05-20T22:00:00Z')
    const door = (await loadDoor(KENJI))!
    const changed = vi.fn()
    door.subscribe(changed)
    server.syncError = 'TypeError: Failed to fetch'
    door.checkIn(['g-1'], 'search')
    await vi.waitFor(() => expect(door.status.online).toBe(false))
    expect(door.status.refused).toBe(false)
    server.syncError = 'JWT expired'
    door.start()
    await vi.waitFor(() => expect(door.status.refused).toBe(true))
    door.stop()
    expect(door.status.online).not.toBe(false)
    expect(door.status.pending).toBe(1)
  })

  it('a gala closed mid-shift: its list leaves the iPad, check-ins not synced yet stay queued', async () => {
    server.snapshot = list([guest('g-1', 'Ana', 'Diaz'), guest('g-2', 'Ben', 'Ortiz')], '2027-05-20T22:00:00Z')
    const door = (await loadDoor(KENJI))!
    server.syncError = 'no gala is open'
    door.checkIn(['g-2'], 'search')
    server.snapshot = null
    aMinuteLater()
    door.start()
    await vi.waitFor(() => expect(door.status.closed).toBe(true))
    door.stop()
    expect(JSON.stringify({ ...localStorage })).not.toContain('Ortiz')
    expect(door.status.pending).toBe(1)
  })
})

// Gate 3: every failure at the door says what happened and what to do.
describe('what the door says when something fails', () => {
  it('an unknown QR code says the ticket may have been replaced and what to do instead', async () => {
    server.snapshot = list([guest('g-1', 'Ana', 'Diaz')], '2027-05-20T22:00:00Z')
    const door = (await loadDoor(KENJI))!
    expect(await door.scan(' AAFE-NOT-A-TICKET ')).toBe(
      'No guest found for code “AAFE-NOT-A-TICKET”. The ticket may have been replaced. Search the guest by name, or add an approved exception.')
  })

  it('an undo that fails says why, in words, and what to do', async () => {
    server.snapshot = list([guest('g-1', 'Ana', 'Diaz')], '2027-05-20T22:00:00Z')
    const door = (await loadDoor(KENJI))!
    const undo = async (message: string) => { server.undoError = { message }; return door.undo(['c-synced']) }
    try {
      expect(await undo('not_found: no check-in to undo'))
        .toBe("That check-in is still sending. In a few seconds, tap the guest's name and choose Undo check-in.")
      expect(await undo('forbidden: only Kenji Abe or a gala admin can undo this check-in'))
        .toBe('Only Kenji Abe or a gala admin can undo this check-in')
      expect(await undo('TypeError: Failed to fetch'))
        .toBe('Undo needs a connection for a check-in that has already synced. Try again once this iPad is back online.')
      expect(await undo('JWT expired')).toBe("Undo didn't go through. Try again, or ask a gala admin to undo it.")
    } finally {
      server.undoError = null
    }
  })
})
