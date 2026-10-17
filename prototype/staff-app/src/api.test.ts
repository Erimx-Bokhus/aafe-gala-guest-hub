// Issue #9: roles are checked by the server, every write goes through one staff_* function, and a check-in
// volunteer only ever holds the door list (no emails, phones, payments, notes or QR codes).
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDB } from '@shared/data'
import type { DB, StaffUser } from '@shared/types'
import { ROLES, checkInErrorText, demoApi, demoSnapshot, errorText, liveApi, loadLiveDb, selectAll, volunteerDb, type CheckinSnapshot } from './api'
import { prepareImport, sampleExport } from './importer'
import { queueGuestListReminders, salesforceSyncNow } from './store'

const staff = (role: StaffUser['role']): StaffUser => ({ id: `st-${role}`, name: `Test ${role}`, email: `${role}@aafe-demo.example.org`, role })
const VOL = staff('check_in_volunteer'), RM = staff('relationship_manager'), ADMIN = staff('gala_admin')

/** Demo API on a private copy of the demo data; `db()` reads the data after the actions. */
function demo(user: StaffUser) {
  let data = loadDB()
  const api = demoApi(user, (fn) => { data = fn(data) }, () => data)
  return { api, db: () => data }
}

describe('what a check-in volunteer holds', () => {
  const full = loadDB()
  const vdb = volunteerDb(demoSnapshot(full), VOL)
  const text = JSON.stringify(vdb)

  it('keeps every current guest with name, sponsor, table and seat', () => {
    const current = new Set(full.orders.filter((o) => o.event_id === full.meta.current_event_id && o.status !== 'cancelled').map((o) => o.id))
    const guests = full.guests.filter((g) => current.has(g.order_id))
    expect(vdb.guests).toHaveLength(guests.length)
    for (const g of guests) {
      const v = vdb.guests.find((x) => x.id === g.id)!
      expect(`${v.first_name} ${v.last_name}`).toBe(`${g.first_name} ${g.last_name}`)
      expect(vdb.event_tables.find((t) => t.id === v.table_id)?.number ?? null).toBe(full.event_tables.find((t) => t.id === g.table_id)?.number ?? null)
    }
  })

  it('has no email address, phone, payment, note, QR code, sent email or change log', () => {
    for (const g of full.guests) if (g.email) expect(text).not.toContain(g.email)
    for (const s of full.sponsors) {
      if (s.primary_contact_email) expect(text).not.toContain(s.primary_contact_email)
      if (s.phone) expect(text).not.toContain(s.phone)
    }
    for (const o of full.orders) if (o.internal_notes) expect(text).not.toContain(o.internal_notes)
    for (const g of full.guests) {
      if (g.qr_token) expect(text).not.toContain(g.qr_token)
      if (g.dietary_needs) expect(vdb.guests.find((x) => x.id === g.id)?.dietary_needs ?? null).toBeNull()
      if (g.relationship_note) expect(vdb.guests.find((x) => x.id === g.id)?.relationship_note ?? null).toBeNull()
    }
    expect(vdb.payments).toEqual([])
    expect(vdb.email_log).toEqual([])
    expect(vdb.audit_log).toEqual([])
    expect(vdb.staff_users).toEqual([VOL])
  })
})

describe('demo mode follows the server’s role rules', () => {
  it('refuses a volunteer every manager action, and changes nothing', async () => {
    const { api, db } = demo(VOL)
    const before = JSON.stringify(db())
    const g = db().guests[0]
    await expect(api.updateGuest(g.id, { title: 'Changed' })).rejects.toThrow('forbidden')
    await expect(api.markPrinted([g.id])).rejects.toThrow('forbidden')
    await expect(api.recordPayment(db().orders[0].id, { method: 'check', amount: 10, received: '2026-10-08' })).rejects.toThrow('forbidden')
    await expect(api.updateGalaEvent({ dress_code: 'x' })).rejects.toThrow('forbidden')
    expect(JSON.stringify(db())).toBe(before)
  })

  it('lets a volunteer check a guest in, once', async () => {
    const { api, db } = demo(VOL)
    const g = db().guests.find((x) => x.attendance_status === 'expected' && x.order_id !== 'ord-rel')!
    expect(await api.checkIn(g.id, 'search')).toEqual({ already: false })
    expect(db().guests.find((x) => x.id === g.id)!.attendance_status).toBe('checked_in')
    expect(await api.checkIn(g.id, 'search')).toEqual({ already: true })
    expect(db().check_ins.filter((c) => c.guest_id === g.id)).toHaveLength(1)
  })

  it('checks a guest in by QR code, and says when the code is unknown', async () => {
    const { api, db } = demo(VOL)
    const g = db().guests.find((x) => x.qr_token && x.attendance_status === 'expected')!
    expect(await api.checkInByCode(` ${g.qr_token!.toLowerCase()} `)).toEqual({ guestId: g.id, already: false })
    await expect(api.checkInByCode('NOT-A-CODE')).rejects.toThrow(/^not_found/)
  })

  it('only a gala admin edits the gala information; relationship managers set logo and ad status, logged', async () => {
    await expect(demo(RM).api.updateGalaEvent({ dress_code: 'Cocktail' })).rejects.toThrow('forbidden')
    const admin = demo(ADMIN)
    await admin.api.updateGalaEvent({ dress_code: 'Cocktail' })
    expect(admin.db().gala_events.find((e) => e.id === admin.db().meta.current_event_id)!.dress_code).toBe('Cocktail')

    const rm = demo(RM)
    const o = rm.db().orders.find((x) => x.logo_status === 'pending')!
    await rm.api.setMaterialStatus(o.id, 'logo', 'received')
    expect(rm.db().orders.find((x) => x.id === o.id)!.logo_status).toBe('received')
    expect(rm.db().audit_log.at(-1)).toMatchObject({ action: 'materials.updated', actor: RM.name, from_state: 'pending', to_state: 'received' })
  })

  it('refuses a seat that is already taken', async () => {
    const { api, db } = demo(RM)
    const sat = db().guests.find((g) => g.table_id && g.seat_number)!
    const other = db().guests.find((g) => !g.table_id && g.order_id !== sat.order_id)!
    await expect(api.assignSeat(other.id, sat.table_id, sat.seat_number)).rejects.toThrow('seat_taken')
  })
})

describe('live mode: one staff_* function per action', () => {
  function client(result: { data?: unknown; error?: { message: string } | null } = {}) {
    const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null })
    const from = vi.fn()
    return { c: { rpc, from } as unknown as SupabaseClient, rpc, from }
  }

  it('maps every action to its server function, then reloads', async () => {
    const { c, rpc } = client()
    const reload = vi.fn().mockResolvedValue(undefined)
    const api = liveApi(c, reload)
    await api.updateGuest('g-1', { title: 'Director' })
    await api.setSeatStatus('g-1', 'reviewed')
    await api.markPrinted(['g-1', 'g-2'])
    await api.assignSeat('g-1', null, null)
    await api.recordPayment('ord-1', { method: 'check', amount: 500, received: '2026-10-08', check_number: '' })
    await api.setMaterialStatus('ord-1', 'program_ad', 'approved')
    await api.updateGalaEvent({ dress_code: 'Black tie' })
    await api.checkInException({ name: 'Walk In', orderId: null, type: 'Comp guest', note: '' })
    expect(rpc.mock.calls).toEqual([
      ['staff_update_guest', { p_guest_id: 'g-1', p_patch: { title: 'Director' } }],
      ['staff_set_seat_status', { p_guest_id: 'g-1', p_to: 'reviewed' }],
      ['staff_mark_printed', { p_guest_ids: ['g-1', 'g-2'] }],
      ['staff_assign_seat', { p_guest_id: 'g-1', p_table_id: null, p_seat: null }],
      ['staff_record_payment', { p_order_id: 'ord-1', p_method: 'check', p_amount: 500, p_received: '2026-10-08', p_check_number: null }],
      ['staff_set_material_status', { p_order_id: 'ord-1', p_material: 'program_ad', p_status: 'approved' }],
      ['staff_update_gala_event', { p_patch: { dress_code: 'Black tie' } }],
      ['staff_check_in_exception', { p_name: 'Walk In', p_order_id: null, p_type: 'Comp guest', p_note: '' }],
    ])
    expect(reload).toHaveBeenCalledTimes(8)
  })

  it('names every action the role table covers', () => {
    const api = liveApi(client().c, async () => {})
    expect(Object.keys(api).filter((k) => k !== 'live').sort()).toEqual(Object.keys(ROLES).sort())
  })

  it('passes the server’s refusal through, without reloading', async () => {
    const { c } = client({ error: { message: 'forbidden' } })
    const reload = vi.fn()
    await expect(liveApi(c, reload).markPrinted(['g-1'])).rejects.toThrow('forbidden')
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads when the server says a record changed since the page loaded, so staff see the latest (Gate 3)', async () => {
    const { c } = client({ error: { message: "invalid_transition: this guest's status changed (now reviewed); check the latest and try again" } })
    const reload = vi.fn().mockResolvedValue(undefined)
    const e = await liveApi(c, reload).setSeatStatus('g-1', 'reviewed').catch((x: unknown) => x)
    expect(errorText(e)).toBe("This guest's status changed (now reviewed); check the latest and try again.")
    expect(reload).toHaveBeenCalledOnce()
  })

  it('says so plainly when no gala is open, for a manager and a volunteer alike (Gate 3)', async () => {
    const vol = client({ data: null })   // staff_checkin_snapshot() answers null when no gala is open
    const e1 = await loadLiveDb(vol.c, VOL).catch((x: unknown) => x)
    const none = { select: () => ({ order: () => ({ range: async () => ({ data: [], error: null }), limit: async () => ({ data: [], error: null }) }) }) }
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })   // staff_current_event() answers null too
    const e2 = await loadLiveDb({ rpc, from: () => none } as unknown as SupabaseClient, ADMIN).catch((x: unknown) => x)
    for (const e of [e1, e2]) expect(errorText(e)).toBe('No gala is open right now. Ask a gala admin to check the gala’s status.')
  })

  it('reads the QR result from the server', async () => {
    const { c, rpc } = client({ data: { guest_id: 'g-9', already_checked_in: true } })
    expect(await liveApi(c, async () => {}).checkInByCode('ABC')).toEqual({ guestId: 'g-9', already: true })
    expect(rpc).toHaveBeenCalledWith('staff_check_in_qr', { p_code: 'ABC' })
  })

  it("loads this year's gala as the server says, even with next year's in planning", async () => {
    const d = loadDB(), now = d.meta.current_event_id
    const tables = { ...d, gala_events: [...d.gala_events, { ...d.gala_events.find((e) => e.id === now)!, id: 'ev-2099', year: 2099, status: 'planning' }] } as unknown as Record<string, unknown[]>
    const rows = (t: string) => ({ select: () => ({ order: () => ({
      range: async (a: number, b: number) => ({ data: (tables[t] ?? []).slice(a, b + 1), error: null }),
      limit: async () => ({ data: [], error: null }) }) }) })
    const rpc = vi.fn().mockResolvedValue({ data: now, error: null })
    const ldb = await loadLiveDb({ rpc, from: rows } as unknown as SupabaseClient, ADMIN)
    expect(rpc).toHaveBeenCalledWith('staff_current_event')
    expect(ldb.meta.current_event_id).toBe(now)
  })

  it('loads a volunteer from the door list only, never the tables', async () => {
    const snap: CheckinSnapshot = demoSnapshot(loadDB())
    const { c, rpc, from } = client({ data: snap })
    const vdb: DB = await loadLiveDb(c, VOL)
    expect(rpc).toHaveBeenCalledWith('staff_checkin_snapshot')
    expect(from).not.toHaveBeenCalled()
    expect(vdb.guests).toHaveLength(snap.guests.length)
  })
})

describe('error text', () => {
  it('says plainly why the server refused', () => {
    expect(errorText(new Error('forbidden'))).toBe('Your role can’t do that.')
    expect(errorText(new Error('seat_taken'))).toBe('That seat is already taken.')
    expect(errorText(new Error('invalid_transition: assign a table and seat first'))).toBe('Assign a table and seat first.')
    expect(errorText(new Error('something unexpected'))).toMatch(/^Something went wrong/)
  })

  it("shows the server's own reason when it gives one", () => {
    expect(errorText(new Error('forbidden: only Kenji Abe or a gala admin can undo this check-in'))).toBe('Only Kenji Abe or a gala admin can undo this check-in.')
  })

  // Gate 3: every failure staff can hit says what happened and what to do.
  it('says what happened and what to do for a lost connection, an expired sign-in, a guest off the list and an expired ticket', () => {
    for (const m of ['TypeError: Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.', 'fetch failed']) {
      expect(errorText(new Error(m))).toBe('Couldn’t reach AAFE’s database. Check the internet connection and try again.')
    }
    expect(errorText({ message: 'JWT expired' })).toBe('Your sign-in has expired. Sign out and sign in again; this change wasn’t saved.')
    expect(errorText(new Error('invalid JWT'))).toBe('Your sign-in has expired. Sign out and sign in again; this change wasn’t saved.')
    expect(errorText(new Error("not_found: guest is not on this gala's list")))
      .toBe('This guest is no longer on tonight’s list (their order may have been cancelled). Ask a gala admin, or add an approved exception.')
    expect(errorText(new Error('not_found: no draft with that id'))).toMatch(/^That record wasn’t found/)
    expect(errorText(new Error('expired: QR code has expired'))).toBe('This ticket’s QR code has expired. Check the guest in by name.')
  })

  it('ends with one period, never two, when the server already wrote one', () => {
    const m = errorText(new Error("invalid_input: a demo gala can't be added to a project that holds real galas. Use a project without the demo sets for real data."))
    expect(m).toBe("A demo gala can't be added to a project that holds real galas. Use a project without the demo sets for real data.")
  })

  it('a check-in that fails with the internet down says what still works at the door', () => {
    expect(checkInErrorText(new Error('TypeError: Failed to fetch')))
      .toBe('Not checked in. If the internet is down, use the iPad check-in app (it works offline) or the printed list.')
    expect(checkInErrorText(new Error('forbidden'))).toBe('Your role can’t do that.')
  })
})

// Review of PR #72 (Oct 8): the volunteer's walk-ins, paging order, a sponsor's whole history, and gala deadline moves.
describe('the volunteer door list keeps walk-in details', () => {
  const snap = demoSnapshot(loadDB())
  const withExtras: CheckinSnapshot = {
    ...snap,
    unnamed_seats: [...snap.unnamed_seats, { order_id: 'ord-only-unnamed', sponsor: 'Unnamed Seats Example Co', count: 4 }],
    exceptions: [{ id: 'ci-walkin', client_id: null, name: 'Walk-in Example', type: 'Walk-in pending confirmation', order_id: 'ord-only-unnamed', checked_in_at: '2027-05-20T23:00:00Z', checked_in_by: 'Test Volunteer', device: null }],
  }
  const v = volunteerDb(withExtras, VOL)

  it('lists a sponsor whose seats are all unnamed, for the walk-in "With sponsor" choice', () => {
    expect(v.orders.some((o) => o.id === 'ord-only-unnamed')).toBe(true)
    expect(v.sponsors.find((s) => s.id === 'sp-ord-only-unnamed')?.organization_name).toBe('Unnamed Seats Example Co')
  })
  it("counts tonight's walk-ins as arrivals", () => {
    const w = v.check_ins.find((c) => c.id === 'ci-walkin')
    expect(w?.arrival_name).toBe('Walk-in Example')
    expect(w?.guest_id).toBeNull()
  })
  it('the demo door list carries the same unnamed seats and walk-ins the database sends', () => {
    const full = loadDB()
    const current = new Set(full.orders.filter((o) => o.event_id === full.meta.current_event_id && o.status !== 'cancelled').map((o) => o.id))
    const unnamed = full.seats.filter((s) => !s.guest_id && s.status !== 'cancelled' && current.has(s.order_id)).length
    expect(snap.unnamed_seats.reduce((n, u) => n + u.count, 0)).toBe(unnamed)
    expect(snap.exceptions).toHaveLength(full.check_ins.filter((c) => !c.guest_id && c.event_id === full.meta.current_event_id).length)
  })
})

describe('paged reads', () => {
  it('reads a table of 2,500 rows in id order, each row once', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: `r${String(i).padStart(4, '0')}` }))
    const order = vi.fn()
    const client = { from: () => ({ select: () => ({ order: (col: string) => { order(col); return { range: async (a: number, b: number) => ({ data: rows.slice(a, b + 1), error: null }) } } }) }) }
    const got = await selectAll(client as unknown as SupabaseClient, 'guests')
    expect(got).toHaveLength(2500)
    expect(new Set(got.map((r) => (r as { id: string }).id)).size).toBe(2500)
    expect(order).toHaveBeenCalledWith('id')
    expect(order).toHaveBeenCalledTimes(3)
  })
})

describe("a sponsor's whole change history", () => {
  it('live, asks the server for that order only, oldest first', async () => {
    const eq = vi.fn(), ord = vi.fn()
    const client = { rpc: vi.fn(), from: vi.fn(() => ({ select: () => ({ eq: (c: string, v: string) => { eq(c, v); return { order: async (col: string) => { ord(col); return { data: [{ id: 1, order_id: 'ord-acme' }], error: null } } } } }) })) }
    const log = await liveApi(client as unknown as SupabaseClient, async () => {}).history('ord-acme')
    expect(client.from).toHaveBeenCalledWith('audit_log')
    expect(eq).toHaveBeenCalledWith('order_id', 'ord-acme')
    expect(ord).toHaveBeenCalledWith('id')
    expect(log).toHaveLength(1)
  })
  it('demo, returns every entry for the order; a volunteer may not read it', async () => {
    const all = loadDB().audit_log.filter((a) => a.order_id === 'ord-acme')
    expect(await demo(RM).api.history('ord-acme')).toHaveLength(all.length)
    await expect(demo(VOL).api.history('ord-acme')).rejects.toThrow('forbidden')
  })
})

describe('moving the gala deadline (demo, like staff_update_gala_event)', () => {
  it("moves sponsors on the gala's deadline, not one with its own", async () => {
    const { api, db } = demo(ADMIN)
    const ev = db().gala_events.find((e) => e.id === db().meta.current_event_id)!
    const on = db().orders.filter((o) => o.event_id === ev.id && (o.guest_list_deadline ?? '') === (ev.guest_list_deadline ?? '')).map((o) => o.id)
    const own = db().orders.find((o) => o.event_id === ev.id && (o.guest_list_deadline ?? '') !== (ev.guest_list_deadline ?? ''))
    await api.updateGalaEvent({ guest_list_deadline: '2027-05-01' })
    for (const id of on) expect(db().orders.find((o) => o.id === id)!.guest_list_deadline).toBe('2027-05-01')
    if (own) expect(db().orders.find((o) => o.id === own.id)!.guest_list_deadline).toBe(own.guest_list_deadline)
    expect(on.length).toBeGreaterThan(0)
  })
})

describe('demo actions that answer with counts answer at once (Oct 15)', () => {
  /** Like the app: React applies each change at its next render, not when it's queued. */
  function deferred(user: StaffUser) {
    let data = loadDB()
    const queue: ((d: DB) => DB)[] = []
    const api = demoApi(user, (fn) => { queue.push(fn) }, () => data)
    return { api, db: () => data, render: () => { for (const fn of queue.splice(0)) data = fn(data) } }
  }

  it('the import, Pull now, reminders and Salesforce sync say what they did, and it is saved', async () => {
    const { api, db, render } = deferred(ADMIN)
    await api.setGalaPage("AAFE's 53rd Annual Gala"); render()
    await api.setTierMapping('Ticket', 'community_ticket'); render()
    const sample = sampleExport(db())
    const prep = await prepareImport(sample.csv, sample.fileName, db())
    const orders = db().orders.length
    expect(await api.importGiveLively(prep.rows, prep.run)).toMatchObject({ created: 3 })
    render()
    expect(db().orders.length).toBe(orders + 3)

    expect(await api.pullGiveLively()).toMatchObject({ created: 1 })
    render()
    expect(db().orders.length).toBe(orders + 4)

    const reminders = queueGuestListReminders(db(), ADMIN, 0).n
    expect(reminders).toBeGreaterThan(0)
    expect(await api.queueReminders(0)).toBe(reminders)
    render()
    expect(queueGuestListReminders(db(), ADMIN, 0).n).toBe(0)

    const synced = salesforceSyncNow(db()).n
    expect(synced).toBeGreaterThan(0)
    expect((await api.syncSalesforce()).sent).toBe(synced)
  })
})
