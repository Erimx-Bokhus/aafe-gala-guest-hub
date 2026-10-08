// Offline check-in on the iPad (decided Oct 6): keep checking guests in when the venue's internet
// drops, and sync later. Plain TypeScript with no React or Supabase, so the check-in screen wires it up
// and the tests run it directly (offlineCheckin.test.ts).
//
//   1. While online, save the list:   desk.saveSnapshot(await rpc('staff_checkin_snapshot'))
//   2. At the door (online or not):    desk.scan(code) / desk.checkIn(guestId) / desk.checkInException(...)
//      Each check-in is saved on the iPad first, so nothing is lost if the connection drops mid-way.
//   3. When online:                    desk.sync((items) => rpc('staff_sync_check_ins', { p_items: items }))
//   4. Banner:                         desk.banner(navigator.onLine)  → "Offline · 3 check-ins waiting"
//
// First arrival wins: if another door checked the guest in first, sync() returns a conflict saying who
// and when ("Already checked in at 7:04 PM by Door 2"); the database logs it. The saved list holds no
// emails, phones, payments or notes; clear() it after gala night.

export interface SnapshotGuest {
  id: string
  order_id: string
  first_name: string
  last_name: string
  title: string | null
  organization: string | null
  sponsor: string
  guest_type: string
  table_number: number | null
  seat_number: number | null
  accessibility_needs: string | null
  /** SHA-256 of the guest's QR code (upper-cased), or null when there is none or it expired. */
  qr_hash: string | null
  qr_expires_at: string | null
  arrived: boolean
  checked_in_at: string | null
  checked_in_by: string | null
  device: string | null
  /** The sponsorship or ticket package, for the seat line ("Ticket · Community Ticket"). */
  package?: string | null
  /** The check-in's id and the iPad's client_id for it, so Undo can name it (staff_undo_check_in). */
  checkin_id?: string | null
  checkin_client_id?: string | null
}

/** A walk-in or other approved exception already on the server (notes stay off the iPad). */
export interface SnapshotException {
  id: string
  client_id: string | null
  name: string
  type: string
  order_id: string | null
  checked_in_at: string
  checked_in_by: string
  device: string | null
}

export interface Snapshot {
  event_id: string
  event_name: string
  generated_at: string
  guests: SnapshotGuest[]
  unnamed_seats: { order_id: string; sponsor: string; count: number }[]
  /** For the sign-in screen; 'closed' tells the iPad to clear its saved list. */
  event_date?: string
  doors_time?: string | null
  venue_name?: string | null
  status?: 'planning' | 'live' | 'closed'
  exceptions?: SnapshotException[]
}

export type QueuedCheckIn =
  | { client_id: string; kind: 'guest'; guest_id: string; method: 'qr' | 'search'; at: string; device: string }
  | { client_id: string; kind: 'exception'; name: string; order_id: string | null; type: string; note: string; at: string; device: string }

/** One result per item from staff_sync_check_ins(). */
export interface SyncResult {
  client_id: string
  status: 'checked_in' | 'conflict' | 'already_synced' | 'error'
  first_at?: string | null
  first_by?: string | null
  first_device?: string | null
  error?: string
}

/** A check-in the server didn't count because someone else was first, or refused. Shown to staff. */
export interface Notice {
  client_id: string
  guest_id: string | null
  name: string
  kind: 'conflict' | 'error'
  message: string
}

export type Outcome =
  | { kind: 'checked_in'; guest: SnapshotGuest }
  | { kind: 'already'; guest: SnapshotGuest; message: string }
  | { kind: 'unknown_code' }
  | { kind: 'expired_code'; guest: SnapshotGuest }
  | { kind: 'not_found' }

/** localStorage fits; tests pass a Map-backed stand-in. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const KEYS = { snapshot: 'snapshot', queue: 'queue', notices: 'notices' }
/** Items per sync call; the database takes at most 1,000. */
export const BATCH = 200

/** The QR code's hash, as the database stores it: SHA-256 hex of the trimmed, upper-cased code. */
export async function hashCode(code: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(code.trim().toUpperCase()))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** "7:04 PM", in New York time (the gala's). */
export const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })

/** "Already checked in at 7:04 PM by Door 2" (the device if known, else the person). */
export const alreadyMessage = (at: string | null | undefined, by: string | null | undefined, device: string | null | undefined) =>
  `Already checked in${at ? ` at ${clock(at)}` : ''}${device || by ? ` by ${device || by}` : ''}`

const fold = (s: string | null | undefined) => (s ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim()

export class CheckInDesk {
  private readonly store: KeyValueStore
  private readonly device: string
  private readonly staffName: string
  private readonly now: () => Date
  private readonly newId: () => string
  /** Storage keys start with this, so each signed-in person's list and queue stay apart on a shared iPad. */
  private readonly prefix: string
  private syncing = false

  constructor(opts: { store: KeyValueStore; device: string; staffName: string; now?: () => Date; newId?: () => string; prefix?: string }) {
    this.store = opts.store
    this.prefix = opts.prefix ?? 'aafe-checkin-'
    this.device = opts.device
    this.staffName = opts.staffName
    this.now = opts.now ?? (() => new Date())
    this.newId = opts.newId ?? (() => globalThis.crypto.randomUUID())
  }

  // ---- The saved list

  saveSnapshot(s: Snapshot) {
    this.write(KEYS.snapshot, s)
  }

  get snapshot(): Snapshot | null {
    return this.read<Snapshot | null>(KEYS.snapshot, null)
  }

  /** Guests with this iPad's unsynced check-ins applied on top of the saved list. */
  guests(): SnapshotGuest[] {
    const s = this.snapshot
    if (!s) return []
    const mine = new Map(this.pending().flatMap((q) => (q.kind === 'guest' ? [[q.guest_id, q] as const] : [])))
    return s.guests.map((g) => {
      const q = mine.get(g.id)
      return q && !g.arrived ? { ...g, arrived: true, checked_in_at: q.at, checked_in_by: this.staffName, device: q.device } : g
    })
  }

  /** Name, organization or sponsor search, ignoring case and accents. Blank finds nothing. */
  search(text: string, limit = 25): SnapshotGuest[] {
    const words = fold(text).split(/\s+/).filter(Boolean)
    if (!words.length) return []
    return this.guests()
      .filter((g) => {
        const hay = fold([g.first_name, g.last_name, g.organization, g.sponsor].join(' '))
        return words.every((w) => hay.includes(w))
      })
      .slice(0, limit)
  }

  // ---- At the door

  /** A scanned or typed QR code, checked against the saved hashes (works offline). */
  async scan(code: string): Promise<Outcome> {
    const hash = await hashCode(code)
    const g = this.guests().find((x) => x.qr_hash === hash)
    if (!g) return { kind: 'unknown_code' }
    if (g.qr_expires_at && new Date(g.qr_expires_at) <= this.now()) return { kind: 'expired_code', guest: g }
    return this.checkIn(g.id, 'qr')
  }

  checkIn(guestId: string, method: 'qr' | 'search' = 'search'): Outcome {
    const g = this.guests().find((x) => x.id === guestId)
    if (!g) return { kind: 'not_found' }
    if (g.arrived) return { kind: 'already', guest: g, message: alreadyMessage(g.checked_in_at, g.checked_in_by, g.device) }
    const item: QueuedCheckIn = { client_id: this.clientId(), kind: 'guest', guest_id: g.id, method, at: this.now().toISOString(), device: this.device }
    this.write(KEYS.queue, [...this.pending(), item])
    return { kind: 'checked_in', guest: { ...g, arrived: true, checked_in_at: item.at, checked_in_by: this.staffName, device: this.device } }
  }

  /** A walk-in or other exception (staff_check_in_exception's offline twin). */
  checkInException(e: { name: string; order_id?: string | null; type: string; note?: string }) {
    if (!e.name.trim() || !e.type.trim()) throw new Error('A name and a reason are required.')
    const item: QueuedCheckIn = {
      client_id: this.clientId(), kind: 'exception', name: e.name.trim(), order_id: e.order_id ?? null, type: e.type.trim(),
      note: e.note?.trim() ?? '', at: this.now().toISOString(), device: this.device,
    }
    this.write(KEYS.queue, [...this.pending(), item])
    return item
  }

  /** Takes a check-in that hasn't synced yet off the queue (undo while offline). False if it already left. */
  cancel(clientId: string): boolean {
    const before = this.pending()
    const after = before.filter((q) => q.client_id !== clientId)
    if (after.length === before.length || this.syncing) return false
    this.write(KEYS.queue, after)
    return true
  }

  // ---- Sync

  pending(): QueuedCheckIn[] {
    return this.read<QueuedCheckIn[]>(KEYS.queue, [])
  }

  /** Conflicts and refusals from earlier syncs, newest last, until staff dismiss them. */
  notices(): Notice[] {
    return this.read<Notice[]>(KEYS.notices, [])
  }

  dismissNotice(clientId: string) {
    this.write(KEYS.notices, this.notices().filter((n) => n.client_id !== clientId))
  }

  /** "Offline · 3 check-ins waiting", "3 check-ins waiting to sync", or null when there is nothing to say. */
  banner(online: boolean): string | null {
    const n = this.pending().length
    const waiting = `${n} check-in${n === 1 ? '' : 's'} waiting`
    if (!online) return n ? `Offline · ${waiting}` : 'Offline'
    return n ? `${waiting} to sync` : null
  }

  /**
   * Sends waiting check-ins, oldest first. Answered items leave the queue; conflicts and refusals become
   * notices for staff. If `send` throws (still offline), everything stays queued. Never runs twice at once.
   */
  async sync(send: (items: QueuedCheckIn[]) => Promise<SyncResult[]>): Promise<{ synced: number; conflicts: number; errors: number; offline: boolean }> {
    const totals = { synced: 0, conflicts: 0, errors: 0, offline: false }
    if (this.syncing) return totals
    this.syncing = true
    try {
      for (;;) {
        const batch = this.pending().slice(0, BATCH)
        if (!batch.length) break
        let results: SyncResult[]
        try {
          results = await send(batch)
        } catch {
          totals.offline = true
          break
        }
        const byId = new Map(results.map((r) => [r.client_id, r]))
        const answered = new Set<string>()
        const notices: Notice[] = []
        for (const item of batch) {
          const r = byId.get(item.client_id)
          if (!r) continue
          answered.add(item.client_id)
          const guest = item.kind === 'guest' ? this.snapshot?.guests.find((g) => g.id === item.guest_id) : undefined
          const name = item.kind === 'guest' ? (guest ? `${guest.first_name} ${guest.last_name}` : item.guest_id) : item.name
          if (r.status === 'conflict') {
            totals.conflicts++
            notices.push({ client_id: item.client_id, guest_id: item.kind === 'guest' ? item.guest_id : null, name, kind: 'conflict',
              message: `${name}: ${alreadyMessage(r.first_at, r.first_by, r.first_device)}. This iPad's check-in at ${clock(item.at)} was not counted.` })
            if (item.kind === 'guest') this.markFirst(item.guest_id, r)
          } else if (r.status === 'error') {
            totals.errors++
            notices.push({ client_id: item.client_id, guest_id: item.kind === 'guest' ? item.guest_id : null, name, kind: 'error',
              message: `${name}: not synced (${r.error ?? 'refused'}). Check this guest in again or tell a gala admin.` })
          } else totals.synced++
        }
        this.write(KEYS.queue, this.pending().filter((q) => !answered.has(q.client_id)))
        if (notices.length) this.write(KEYS.notices, [...this.notices(), ...notices])
        if (!answered.size) break   // the server answered none of them; try again later
      }
    } finally {
      this.syncing = false
    }
    return totals
  }

  /** After gala night: remove the saved list, the queue and notices from the iPad. */
  clear() {
    for (const k of Object.values(KEYS)) this.store.removeItem(this.prefix + k)
  }

  // ---- Internals

  private markFirst(guestId: string, r: SyncResult) {
    const s = this.snapshot
    if (!s) return
    this.saveSnapshot({
      ...s,
      guests: s.guests.map((g) => (g.id === guestId
        ? { ...g, arrived: true, checked_in_at: r.first_at ?? g.checked_in_at, checked_in_by: r.first_by ?? g.checked_in_by, device: r.first_device ?? g.device }
        : g)),
    })
  }

  private clientId() {
    return `${this.device.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${this.newId()}`.slice(0, 100)
  }

  private read<T>(key: string, fallback: T): T {
    try {
      const v = this.store.getItem(this.prefix + key)
      return v ? (JSON.parse(v) as T) : fallback
    } catch {
      return fallback
    }
  }

  private write(key: string, value: unknown) {
    this.store.setItem(this.prefix + key, JSON.stringify(value))
  }
}
