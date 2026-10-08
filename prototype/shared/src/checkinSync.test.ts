// The iPad's offline queue (checkinSync.ts): every check-in reaches the sync server, even when the volunteer
// taps Undo or closes the gala while a request is still on its way.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SyncClient } from './checkinSync'
import type { CheckIn } from './types'

type Sent = { method: string; path: string }

/** A fake sync server. While `hold` is on, every write waits until `release()`. */
function fakeServer() {
  const sent: Sent[] = []
  let hold = false
  let waiting: (() => void)[] = []
  const reply = (body: unknown) => ({ status: 200, json: async () => body }) as Response
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '')
    const method = init.method ?? 'GET'
    if (method === 'GET') return reply({ check_ins: [], closures: {} })
    sent.push({ method, path })
    if (hold) await new Promise<void>((r) => waiting.push(r))
    return reply({ ok: true })
  })
  return {
    sent,
    holdWrites() { hold = true },
    release() { hold = false; waiting.forEach((r) => r()); waiting = [] },
  }
}

const ci = (id: string): CheckIn => ({ id, guest_id: `g-${id}`, event_id: 'ev-2027', checked_in_at: '2027-05-21T22:00:00Z' } as unknown as CheckIn)
const settle = () => new Promise((r) => setTimeout(r, 0))
const fallback = { check_ins: [], closures: {} }

afterEach(() => vi.unstubAllGlobals())

describe('SyncClient offline queue', () => {
  it('Undo while a check-in is sending: that check-in is deleted on the server and the next guest still gets through', async () => {
    const server = fakeServer()
    const client = new SyncClient('t1', fallback, 'Door 1', 'ipad')
    server.holdWrites()
    client.add(ci('a'))        // starts sending a
    await settle()
    client.add(ci('b'))        // queued behind a
    client.remove('a')         // volunteer taps Undo on a while it's still on its way
    server.release()
    await vi.waitFor(() => expect(client.status.pending).toBe(0))
    await settle()
    expect(server.sent).toEqual([
      { method: 'POST', path: '/api/checkins' },     // a, already on its way
      { method: 'POST', path: '/api/checkins' },     // b is not lost
      { method: 'DELETE', path: '/api/checkins/a' }, // the undo reaches the server, in the order it was tapped
    ])
  })

  it('Undo on a check-in that has not been sent yet just drops it', async () => {
    const server = fakeServer()
    const client = new SyncClient('t2', fallback, 'Door 1', 'ipad')
    server.holdWrites()
    client.add(ci('a'))
    await settle()
    client.add(ci('b'))
    client.remove('b')         // b never left the iPad
    server.release()
    await vi.waitFor(() => expect(client.status.pending).toBe(0))
    await settle()
    expect(server.sent).toEqual([{ method: 'POST', path: '/api/checkins' }])
  })

  it('Closing the gala while a re-open is sending keeps every queued write', async () => {
    const server = fakeServer()
    const client = new SyncClient('t3', fallback, 'Door 1', 'ipad')
    server.holdWrites()
    client.reopen('ev-2027')               // starts sending the re-open
    await settle()
    client.add(ci('b'))                    // queued behind it
    client.close({ event_id: 'ev-2027', guest_ids: [], closed_by: 'Mei', closed_at: '2027-05-22T03:00:00Z' })
    server.release()
    await vi.waitFor(() => expect(client.status.pending).toBe(0))
    await settle()
    expect(server.sent).toEqual([
      { method: 'DELETE', path: '/api/closures/ev-2027' }, // the re-open already on its way
      { method: 'POST', path: '/api/checkins' },           // b is not lost
      { method: 'POST', path: '/api/closures' },           // then the close
    ])
  })
})
