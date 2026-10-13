import { describe, expect, it } from 'vitest'
import { alreadyMessage, BATCH, CheckInDesk, hashCode, type KeyValueStore, type QueuedCheckIn, type Snapshot, type SnapshotGuest, type SyncResult } from './offlineCheckin'

// Invented guests only (hard rule 1).
const guest = (id: string, first: string, last: string, extra: Partial<SnapshotGuest> = {}): SnapshotGuest => ({
  id, order_id: 'ord-1', first_name: first, last_name: last, title: null, organization: 'Example Partners', sponsor: 'Example Partners',
  guest_type: 'sponsor_guest', table_number: 4, seat_number: 1, has_access_needs: false, qr_hash: null, qr_expires_at: null,
  arrived: false, checked_in_at: null, checked_in_by: null, device: null, ...extra,
})
// SHA-256 of each code, worked out independently (the database's hash_token gives the same).
const HASHES: Record<string, string> = {
  'AAFE-0123456789ABCDEF0123456789ABCDEF': 'ae499808dad4b9d475e780bfeb0917bb9bf3f4e788f380a4090bc72a58954bf7',
  'AAFE-OLD': 'f401ee8a0e9aa2c65b259928fb9330d67bc42c6e2e8d1208c887ede60842f4b3',
}
const sha = (s: string) => HASHES[s]!
const CODE = 'AAFE-0123456789ABCDEF0123456789ABCDEF'
const SNAP: Snapshot = {
  event_id: 'ev-2027', event_name: 'AAFE Gala (demo)', generated_at: '2027-05-20T22:00:00Z', unnamed_seats: [],
  guests: [
    guest('g-1', 'José', 'Núñez', { qr_hash: sha(CODE), qr_expires_at: '2027-05-21T10:00:00Z' }),
    guest('g-2', 'Mei', 'Chan', { organization: 'Harbor Example Co' }),
    guest('g-3', 'Ana', 'Park', { arrived: true, checked_in_at: '2027-05-20T23:04:00Z', checked_in_by: 'Kenji', device: 'Door 2' }),
    guest('g-4', 'Old', 'Code', { qr_hash: sha('AAFE-OLD'), qr_expires_at: '2027-05-20T10:00:00Z' }),
  ],
}

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
}
function desk(store = memoryStore(), device = 'Door 1') {
  let n = 0
  const d = new CheckInDesk({ store, device, staffName: 'Riley', now: () => new Date('2027-05-20T23:06:00Z'), newId: () => `id${++n}` })
  d.saveSnapshot(SNAP)
  return d
}
const answer = (status: SyncResult['status'], extra: Partial<SyncResult> = {}) => async (items: QueuedCheckIn[]) =>
  items.map((i) => ({ client_id: i.client_id, status, ...extra }))

describe('offline check-in at the door', () => {
  it('hashes a code the way the database does (trimmed, upper-cased SHA-256)', async () => {
    expect(await hashCode(` ${CODE.toLowerCase()} `)).toBe(sha(CODE))
  })

  it('checks a guest in from a scanned code, with no connection', async () => {
    const d = desk()
    const out = await d.scan(CODE.toLowerCase())
    expect(out).toMatchObject({ kind: 'checked_in', guest: { id: 'g-1', arrived: true, device: 'Door 1' } })
    expect(d.pending()).toEqual([{ client_id: 'door-1-id1', kind: 'guest', guest_id: 'g-1', method: 'qr', at: '2027-05-20T23:06:00.000Z', device: 'Door 1' }])
  })

  it('refuses unknown and expired codes', async () => {
    const d = desk()
    expect(await d.scan('AAFE-NOPE')).toEqual({ kind: 'unknown_code' })
    expect(await d.scan('AAFE-OLD')).toMatchObject({ kind: 'expired_code', guest: { id: 'g-4' } })
    expect(d.pending()).toEqual([])
  })

  it('says who was first when a guest is already checked in', () => {
    const d = desk()
    const out = d.checkIn('g-3')
    expect(out.kind).toBe('already')
    expect(out.kind === 'already' && out.message).toBe('Already checked in at 7:04 PM by Door 2')
    expect(d.checkIn('g-2').kind).toBe('checked_in')
    expect(d.checkIn('g-2')).toMatchObject({ kind: 'already', message: 'Already checked in at 7:06 PM by Door 1' })
    expect(d.pending()).toHaveLength(1)
  })

  it('finds guests by name, organization or sponsor, ignoring case and accents', () => {
    const d = desk()
    expect(d.search('jose nunez').map((g) => g.id)).toEqual(['g-1'])
    expect(d.search('harbor').map((g) => g.id)).toEqual(['g-2'])
    expect(d.search('   ')).toEqual([])
  })

  it('keeps check-ins across a page reload, and over a refreshed list', () => {
    const store = memoryStore()
    desk(store).checkIn('g-2')
    const again = desk(store)   // same iPad storage, list saved again from the server (which hasn't heard yet)
    expect(again.pending()).toHaveLength(1)
    expect(again.guests().find((g) => g.id === 'g-2')).toMatchObject({ arrived: true, device: 'Door 1' })
  })

  it('records walk-ins, and needs a name and reason', () => {
    const d = desk()
    expect(d.checkInException({ name: ' Pat Walker ', order_id: 'ord-1', type: 'walk_in' })).toMatchObject({ kind: 'exception', name: 'Pat Walker' })
    expect(() => d.checkInException({ name: '', type: 'walk_in' })).toThrow()
  })

  it('shows the banner the team chose', () => {
    const d = desk()
    expect(d.banner(true)).toBeNull()
    expect(d.banner(false)).toBe('Offline')
    d.checkIn('g-1'); d.checkIn('g-2')
    expect(d.banner(false)).toBe('Offline · 2 check-ins waiting')
    expect(d.banner(true)).toBe('2 check-ins waiting to sync')
  })
})

describe('syncing', () => {
  it('sends waiting check-ins and empties the queue', async () => {
    const d = desk()
    d.checkIn('g-1'); d.checkIn('g-2')
    const sent: QueuedCheckIn[][] = []
    const res = await d.sync(async (items) => { sent.push(items); return answer('checked_in')(items) })
    expect(res).toEqual({ synced: 2, conflicts: 0, errors: 0, offline: false })
    expect(sent[0]!.map((i) => i.client_id)).toEqual(['door-1-id1', 'door-1-id2'])
    expect(d.pending()).toEqual([])
    expect(d.banner(true)).toBeNull()
  })

  it('keeps everything when still offline', async () => {
    const d = desk()
    d.checkIn('g-1')
    const res = await d.sync(async () => { throw new TypeError('Failed to fetch') })
    expect(res.offline).toBe(true)
    expect(d.pending()).toHaveLength(1)
  })

  it('treats an item synced before (the answer was lost) as done', async () => {
    const d = desk()
    d.checkIn('g-1')
    expect((await d.sync(answer('already_synced'))).synced).toBe(1)
    expect(d.pending()).toEqual([])
  })

  it('first arrival wins: a conflict becomes a notice saying who was first, and the list is corrected', async () => {
    const d = desk()
    d.checkIn('g-2')
    const res = await d.sync(answer('conflict', { first_at: '2027-05-20T23:04:00Z', first_by: 'Kenji', first_device: 'Door 2' }))
    expect(res.conflicts).toBe(1)
    expect(d.notices()).toEqual([{
      client_id: 'door-1-id1', guest_id: 'g-2', name: 'Mei Chan', kind: 'conflict',
      message: "Mei Chan: Already checked in at 7:04 PM by Door 2. This iPad's check-in at 7:06 PM was not counted.",
    }])
    expect(d.guests().find((g) => g.id === 'g-2')).toMatchObject({ checked_in_by: 'Kenji', device: 'Door 2' })
    d.dismissNotice('door-1-id1')
    expect(d.notices()).toEqual([])
  })

  it('a refused item becomes a notice and leaves the queue; unanswered items stay', async () => {
    const d = desk()
    d.checkIn('g-1'); d.checkIn('g-2')
    // The server answers only the first item (say the second's answer was cut off).
    const res = await d.sync(async (items) => items.filter((i) => i.client_id === 'door-1-id1')
      .map((i) => ({ client_id: i.client_id, status: 'error' as const, error: 'not_found' })))
    expect(res.errors).toBe(1)
    expect(d.notices()[0]).toMatchObject({ kind: 'error', name: 'José Núñez' })
    expect(d.pending().map((q) => q.client_id)).toEqual(['door-1-id2'])
  })

  it(`sends in batches of ${BATCH}`, async () => {
    const store = memoryStore()
    const many: QueuedCheckIn[] = Array.from({ length: BATCH + 5 }, (_, i) => ({
      client_id: `c${i}`, kind: 'exception', name: `Walk-in ${i}`, order_id: null, type: 'walk_in', note: '', at: '2027-05-20T23:00:00Z', device: 'Door 1',
    }))
    store.setItem('aafe-checkin-queue', JSON.stringify(many))
    const d = desk(store)
    const sizes: number[] = []
    await d.sync(async (items) => { sizes.push(items.length); return answer('checked_in')(items) })
    expect(sizes).toEqual([BATCH, 5])
  })

  it('never runs two syncs at once', async () => {
    const d = desk()
    d.checkIn('g-1')
    let release!: () => void
    const first = d.sync((items) => new Promise((ok) => { release = () => ok(answer('checked_in')(items) as unknown as SyncResult[]) }))
    const second = await d.sync(answer('checked_in'))
    expect(second.synced).toBe(0)
    release()
    expect((await first).synced).toBe(1)
  })

  it('clears everything from the iPad after gala night', () => {
    const store = memoryStore()
    const d = desk(store)
    d.checkIn('g-1')
    d.clear()
    expect(store.data.size).toBe(0)
    expect(d.guests()).toEqual([])
  })

  it('undoes a check-in that has not synced yet, and not one that already left', async () => {
    const d = desk()
    d.checkIn('g-2')
    const [item] = d.pending()
    expect(d.cancel(item.client_id)).toBe(true)
    expect(d.pending()).toHaveLength(0)
    expect(d.guests().find((g) => g.id === 'g-2')?.arrived).toBe(false)
    d.checkIn('g-2')
    const [sent] = d.pending()
    await d.sync(answer('checked_in'))
    expect(d.cancel(sent.client_id)).toBe(false)   // synced: the server undoes it (staff_undo_check_in)
  })

  it("keeps each signed-in person's list and queue apart on a shared iPad", () => {
    const store = memoryStore()
    const a = new CheckInDesk({ store, device: 'Door 1', staffName: 'Riley', prefix: 'aafe-checkin:st-a:' })
    const b = new CheckInDesk({ store, device: 'Door 1', staffName: 'Kenji', prefix: 'aafe-checkin:st-b:' })
    a.saveSnapshot(SNAP); b.saveSnapshot(SNAP)
    a.checkIn('g-2')
    expect(b.pending()).toHaveLength(0)
    a.clear()
    expect(a.snapshot).toBeNull()
    expect(b.snapshot).not.toBeNull()
  })

  it('says "already checked in" sensibly with missing details', () => {
    expect(alreadyMessage(null, null, null)).toBe('Already checked in')
    expect(alreadyMessage('2027-05-20T23:04:00Z', 'Kenji', null)).toBe('Already checked in at 7:04 PM by Kenji')
  })
})
