import { describe, expect, it } from 'vitest'
import { CheckInDesk, type KeyValueStore, type QueuedCheckIn, type Snapshot, type SnapshotGuest, type SyncResult } from '@shared/offlineCheckin'
import { checkSignOut, waitingMessage } from './signOut'

// Invented guests only (hard rule 1).
const guest = (id: string, first: string, last: string): SnapshotGuest => ({
  id, order_id: 'ord-1', first_name: first, last_name: last, title: null, organization: 'Example Partners', sponsor: 'Example Partners',
  guest_type: 'sponsor_guest', table_number: 4, seat_number: 1, accessibility_needs: null, qr_hash: null, qr_expires_at: null,
  arrived: false, checked_in_at: null, checked_in_by: null, device: null,
})
const SNAP: Snapshot = {
  event_id: 'ev-2027', event_name: 'AAFE Gala (demo)', generated_at: '2027-05-20T22:00:00Z', unnamed_seats: [],
  guests: [guest('g-1', 'José', 'Núñez'), guest('g-2', 'Mei', 'Chan')],
}
function deskWithTwoWaiting() {
  const data = new Map<string, string>()
  const store: KeyValueStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) }
  let n = 0
  const d = new CheckInDesk({ store, device: 'Door 1', staffName: 'Riley', now: () => new Date('2027-05-20T23:06:00Z'), newId: () => `id${++n}` })
  d.saveSnapshot(SNAP)
  d.checkIn('g-1', 'search')
  d.checkIn('g-2', 'search')
  return d
}
const online = async (items: QueuedCheckIn[]): Promise<SyncResult[]> => items.map((i) => ({ client_id: i.client_id, status: 'checked_in' }))
const offline = async (): Promise<SyncResult[]> => { throw new Error('Failed to fetch') }

describe('signing out of the iPad (audit bug 1)', () => {
  it('sends waiting check-ins first, then lets anyone sign out', async () => {
    const d = deskWithTwoWaiting()
    expect(d.pending()).toHaveLength(2)
    expect(await checkSignOut(d, online, 'check_in_volunteer')).toEqual({ ok: true })
    expect(d.pending()).toHaveLength(0)
  })

  it('stops a volunteer when check-ins can’t be sent, and keeps them on the iPad', async () => {
    const d = deskWithTwoWaiting()
    expect(await checkSignOut(d, offline, 'check_in_volunteer')).toEqual({ ok: false, waiting: 2, canForce: false })
    expect(d.pending()).toHaveLength(2)
  })

  it('lets a gala admin choose to sign out anyway', async () => {
    expect(await checkSignOut(deskWithTwoWaiting(), offline, 'gala_admin')).toEqual({ ok: false, waiting: 2, canForce: true })
  })

  it('signs out at once when nothing is waiting, without calling the server', async () => {
    const d = deskWithTwoWaiting()
    await d.sync(online)
    let calls = 0
    expect(await checkSignOut(d, async (items) => { calls++; return online(items) }, 'check_in_volunteer')).toEqual({ ok: true })
    expect(calls).toBe(0)
  })

  it('says how many would be lost and what to do', () => {
    expect(waitingMessage(1, false)).toBe('1 check-in hasn’t reached AAFE yet. Signing out now would delete it from this iPad. Connect to the internet and try again, or ask a gala admin.')
    expect(waitingMessage(3, true)).toBe('3 check-ins haven’t reached AAFE yet. Signing out now would delete them from this iPad. Connect to the internet and try again, or sign out anyway.')
  })
})
