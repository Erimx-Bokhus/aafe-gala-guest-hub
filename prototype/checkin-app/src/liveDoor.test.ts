// @vitest-environment jsdom
// The live door list follows the server while the iPad is open (the Oct 12 audit's "frozen list" finding): a guest
// added after the door opened (a sponsor naming a guest, a comp added in the staff app) appears on the next refresh,
// and a refresh that only changes who arrived keeps the same list, so the screen doesn't re-sort every few seconds.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Snapshot, SnapshotGuest } from '@shared/offlineCheckin'
import type { StaffUser } from '@shared/types'

const server = vi.hoisted(() => ({ snapshot: null as unknown, undoError: null as { message: string } | null }))
vi.mock('@shared/supabase', () => ({
  supabase: {
    rpc: async (fn: string) => (fn === 'staff_undo_check_in' && server.undoError ? { data: null, error: server.undoError }
      : { data: fn === 'staff_checkin_snapshot' ? server.snapshot : [], error: null }),
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

beforeEach(() => localStorage.clear())

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
    door.start()
    await vi.waitFor(() => expect(changed).toHaveBeenCalled())
    door.stop()

    expect(door.guests).toBe(before)
    expect([...door.arrivals().keys()]).toEqual(['g-1'])
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
      expect(await undo('TypeError: Failed to fetch')).toBe("Undo didn't go through. Try again, or ask a gala admin to undo it.")
      expect(await undo('JWT expired')).toBe("Undo didn't go through. Try again, or ask a gala admin to undo it.")
    } finally {
      server.undoError = null
    }
  })
})
