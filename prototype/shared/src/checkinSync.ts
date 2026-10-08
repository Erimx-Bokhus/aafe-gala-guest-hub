// Check-in sync client shared by the iPad check-in app and the staff app.
// Talks to the small sync server in server/ (port 8787). If the server can't be reached,
// writes wait in an offline queue (saved to localStorage when the browser allows it) and are sent when it's back.
// PRODUCTION: swap the fetch calls for Supabase inserts/deletes + a realtime subscription on `check_ins`.
import { useEffect, useState } from 'react'
import type { CheckIn } from './types'

// `__PORT_8787__` is rewritten by the preview host to a proxy path for the sandbox server.
// Locally (npm run dev / OPEN-*.html) it stays as-is, so we fall back to localhost:8787.
const RAW_API = '__PORT_8787__'
export const API_BASE: string = RAW_API.startsWith('__') ? 'http://localhost:8787' : RAW_API

export interface Closure { event_id: string; guest_ids: string[]; closed_by: string; closed_at: string }
export interface SyncSnapshot { check_ins: CheckIn[]; closures: Record<string, Closure> }
export type SyncOp =
  | { kind: 'add'; ci: CheckIn }
  | { kind: 'del'; id: string }
  | { kind: 'close'; closure: Closure }
  | { kind: 'reopen'; event_id: string }
export interface SyncStatus { online: boolean | null; pending: number; lastSync: string | null; lastError: string | null }

// ---- storage that never throws (sandboxed previews block localStorage; then we keep the queue in memory) ----
const mem: Record<string, string> = {}
function getStore(): Storage | null {
  try { const s = window.localStorage; const k = '__aafe_t'; s.setItem(k, '1'); s.removeItem(k); return s } catch { return null }
}
const ls = getStore()
export const storageAvailable = !!ls
const sget = (k: string) => { try { return ls ? ls.getItem(k) : (mem[k] ?? null) } catch { return mem[k] ?? null } }
const sset = (k: string, v: string) => { mem[k] = v; try { ls?.setItem(k, v) } catch { /* memory only */ } }

class NetErr extends Error {}
async function call(method: string, path: string, body?: unknown, device?: string) {
  let r: Response
  try {
    r = await fetch(`${API_BASE}${path}`, { method, credentials: 'same-origin', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json', ...(device ? { 'X-Device': device } : {}) } : (device ? { 'X-Device': device } : {}), body: body ? JSON.stringify(body) : undefined })
  } catch (e) { throw new NetErr(String(e)) }
  if (r.status >= 500 || r.status === 0) throw new NetErr(`HTTP ${r.status}`)
  const j = await r.json().catch(() => { throw new NetErr('bad response') })
  return { status: r.status, j }
}

export class SyncClient {
  private snap: SyncSnapshot
  private queue: SyncOp[]
  private listeners = new Set<() => void>()
  private busy = false
  private timer: ReturnType<typeof setInterval> | null = null
  status: SyncStatus = { online: null, pending: 0, lastSync: null, lastError: null }
  constructor(private key: string, fallback: SyncSnapshot, private device: string, private source: string) {
    const saved = sget(`${key}:snap`)
    this.snap = saved ? JSON.parse(saved) : fallback
    const q = sget(`${key}:queue`)
    this.queue = q ? JSON.parse(q) : []
    this.status.pending = this.queue.length
  }
  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private emit() { this.status = { ...this.status, pending: this.queue.length }; sset(`${this.key}:queue`, JSON.stringify(this.queue)); this.listeners.forEach((f) => f()) }

  /** Server snapshot + anything still waiting in the queue. */
  view(): SyncSnapshot {
    let check_ins = this.snap.check_ins.slice()
    const closures = { ...this.snap.closures }
    for (const op of this.queue) {
      if (op.kind === 'add' && !check_ins.some((c) => c.id === op.ci.id)) check_ins.push(op.ci)
      if (op.kind === 'del') check_ins = check_ins.filter((c) => c.id !== op.id)
      if (op.kind === 'close') closures[op.closure.event_id] = op.closure
      if (op.kind === 'reopen') delete closures[op.event_id]
    }
    return { check_ins, closures }
  }
  isQueued(id: string) { return this.queue.some((o) => o.kind === 'add' && o.ci.id === id) }

  add(ci: CheckIn) { this.queue.push({ kind: 'add', ci: { ...ci, source: this.source } as CheckIn }); this.emit(); void this.tick() }
  remove(id: string) {
    const i = this.queue.findIndex((o) => o.kind === 'add' && o.ci.id === id)
    if (i >= 0) this.queue.splice(i, 1) // never reached the server — just drop it
    else this.queue.push({ kind: 'del', id })
    this.emit(); void this.tick()
  }
  close(closure: Closure) { this.queue = this.queue.filter((o) => !(o.kind === 'reopen' && o.event_id === closure.event_id)); this.queue.push({ kind: 'close', closure }); this.emit(); void this.tick() }
  reopen(event_id: string) { this.queue.push({ kind: 'reopen', event_id }); this.emit(); void this.tick() }

  /** Send queued writes in order, then pull the latest snapshot. */
  async tick() {
    if (this.busy) return
    this.busy = true
    try {
      while (this.queue.length) {
        const op = this.queue[0]
        const r = op.kind === 'add' ? await call('POST', '/api/checkins', op.ci, this.device)
          : op.kind === 'del' ? await call('DELETE', `/api/checkins/${encodeURIComponent(op.id)}`, undefined, this.device)
          : op.kind === 'close' ? await call('POST', '/api/closures', op.closure, this.device)
          : await call('DELETE', `/api/closures/${encodeURIComponent(op.event_id)}`, undefined, this.device)
        if (r.status >= 400) this.status.lastError = r.j?.error ?? `HTTP ${r.status}` // rejected (bad data): drop it, don't block the queue
        this.queue.shift(); this.emit()
      }
      const { j } = await call('GET', '/api/checkins')
      this.snap = { check_ins: j.check_ins ?? [], closures: j.closures ?? {} }
      sset(`${this.key}:snap`, JSON.stringify(this.snap))
      this.status = { ...this.status, online: true, lastSync: new Date().toISOString() }
    } catch (e) {
      if (e instanceof NetErr) this.status = { ...this.status, online: false }
      else this.status = { ...this.status, lastError: String(e) }
    } finally {
      this.busy = false
      this.emit()
    }
  }
  start(ms = 3000) { if (this.timer) return; void this.tick(); this.timer = setInterval(() => void this.tick(), ms) }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null }
}

/** React hook: re-render whenever the sync client's view or status changes. */
export function useSync(client: SyncClient) {
  const [, setN] = useState(0)
  useEffect(() => { client.start(); const off = client.subscribe(() => setN((n) => n + 1)); return () => { off() } }, [client])
  return { view: client.view(), status: client.status }
}

export const newCheckinId = () => `ci-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
export const EXCEPTION_TYPES = ['Arrived with sponsor', 'Sponsor seat not previously named', 'Comp guest', 'Approved by relationship manager', 'Walk-in pending confirmation']
