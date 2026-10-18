// The iPad's half of the door list by changes (Gate 3, data use, part 3): merging door_sync() answers into the saved
// list. The server half, and a merged list compared with a fresh full one after every kind of change, is
// scripts/test-door-sync.mjs.
import { describe, expect, it, vi } from 'vitest'
import { DOOR_FULL_EVERY_MS, mergeDoorSync, syncDoorList, type DoorSync } from './doorSync'
import type { Snapshot, SnapshotGuest } from './offlineCheckin'

// Invented guests only (hard rule 1).
const g = (id: string, first: string, last: string, o: Partial<SnapshotGuest> = {}): SnapshotGuest => ({
  id, order_id: 'ord-1', first_name: first, last_name: last, title: null, organization: 'Example Partners', sponsor: 'Example Partners',
  guest_type: 'sponsor_guest', table_number: 4, seat_number: 1, has_access_needs: false, qr_hash: null, qr_expires_at: null,
  arrived: false, checked_in_at: null, checked_in_by: null, device: null, ...o,
})
const EVENT = { event_id: 'ev-2027', event_name: 'AAFE Gala (demo)', generated_at: '2027-05-20T22:00:00Z', status: 'live' as const }
const UNNAMED = [{ order_id: 'ord-2', sponsor: 'Mott Harbor (synthetic)', count: 2 }]
const all = (guests: SnapshotGuest[], cursor = 'c1'): DoorSync =>
  ({ ...EVENT, cursor, full: true, guests, removed: [], unnamed_seats: UNNAMED, exceptions: [], count: guests.length })
const changes = (o: Partial<DoorSync> & { count: number }, cursor = 'c2'): DoorSync =>
  ({ ...EVENT, cursor, full: false, guests: [], removed: [], unnamed_seats: null, exceptions: null, ...o })
const saved = (guests: SnapshotGuest[]): Snapshot =>
  ({ ...EVENT, guests, unnamed_seats: UNNAMED, exceptions: [], cursor: 'c1', full_at: 1_000 })

describe('merging door_sync answers', () => {
  it('a changed guest keeps its place, a new one is slotted in by name, a removed one leaves', () => {
    const before = saved([g('g-1', 'Ana', 'Diaz'), g('g-2', 'Ben', 'Ortiz'), g('g-3', 'Lily', 'Wong')])
    const { snapshot, drifted } = mergeDoorSync(before, changes({
      guests: [g('g-2', 'Ben', 'Ortiz', { arrived: true }), g('g-4', 'Rose', 'Kim')], removed: ['g-3'], count: 3 }))
    expect(snapshot.guests.map((x) => x.last_name)).toEqual(['Diaz', 'Kim', 'Ortiz'])
    expect(snapshot.guests.find((x) => x.id === 'g-2')?.arrived).toBe(true)
    expect(snapshot.unnamed_seats).toBe(before.unnamed_seats)   // not sent: unchanged
    expect(snapshot.cursor).toBe('c2')
    expect(snapshot.full_at).toBe(1_000)
    expect(drifted).toBe(false)
  })

  it('nothing changed: the same guest list, so a caller can skip redrawing', () => {
    const before = saved([g('g-1', 'Ana', 'Diaz')])
    expect(mergeDoorSync(before, changes({ count: 1 })).snapshot.guests).toBe(before.guests)
  })

  it('replaces the unnamed seats and walk-ins when they come', () => {
    const walkIn = { id: 'ci-1', client_id: null, name: 'Walk-in Example', type: 'Walk-in pending confirmation', order_id: null, checked_in_at: '2027-05-20T23:00:00Z', checked_in_by: 'Door 2', device: null }
    const { snapshot } = mergeDoorSync(saved([g('g-1', 'Ana', 'Diaz')]), changes({ unnamed_seats: [], exceptions: [walkIn], count: 1 }))
    expect(snapshot.unnamed_seats).toEqual([])
    expect(snapshot.exceptions).toEqual([walkIn])
  })
})

describe('one refresh', () => {
  it('asks for everything the first time, then for changes since the saved cursor', async () => {
    const call = vi.fn().mockResolvedValueOnce(all([g('g-1', 'Ana', 'Diaz')]))
    const first = (await syncDoorList(call, null, 5_000))!
    expect(call).toHaveBeenLastCalledWith(null, null)
    expect(first.full_at).toBe(5_000)
    call.mockResolvedValueOnce(changes({ guests: [g('g-1', 'Ana', 'Diaz', { arrived: true })], count: 1 }))
    const next = (await syncDoorList(call, first, 6_000))!
    expect(call).toHaveBeenLastCalledWith('c1', 'ev-2027')
    expect(next.guests[0].arrived).toBe(true)
    expect(next.full_at).toBe(5_000)
  })

  it('asks for everything again when the merged list drifts from the server count', async () => {
    const call = vi.fn()
      .mockResolvedValueOnce(changes({ count: 2 }))   // one guest went out of reach without a removal
      .mockResolvedValueOnce(all([g('g-1', 'Ana', 'Diaz'), g('g-2', 'Ben', 'Ortiz')], 'c3'))
    const out = (await syncDoorList(call, saved([g('g-1', 'Ana', 'Diaz')]), 2_000))!
    expect(call.mock.calls).toEqual([['c1', 'ev-2027'], [null, 'ev-2027']])
    expect(out.guests).toHaveLength(2)
    expect(out.full_at).toBe(2_000)
  })

  it('asks for everything after 4 hours, whatever the checks say', async () => {
    const call = vi.fn().mockResolvedValueOnce(all([g('g-1', 'Ana', 'Diaz')]))
    await syncDoorList(call, saved([g('g-1', 'Ana', 'Diaz')]), 1_000 + DOOR_FULL_EVERY_MS)
    expect(call).toHaveBeenLastCalledWith(null, 'ev-2027')
  })

  it('no gala open: null', async () => {
    expect(await syncDoorList(vi.fn().mockResolvedValue(null), saved([]))).toBeNull()
  })
})
