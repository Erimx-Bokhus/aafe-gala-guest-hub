// The approval list and guest-list reminders: the demo matches staff_email_queue() and staff_queue_guest_list_reminders(),
// only managers use them, reminders are drafts (hard rule 4), and live mode calls the server.
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDB } from '@shared/data'
import type { StaffUser } from '@shared/types'
import { demoApi, demoEmailQueue, liveApi } from './api'
import { queueGuestListReminders } from './store'
// @ts-expect-error plain JavaScript helper shared with the backend tests
import { openTestDb } from '../../scripts/test-db.mjs'

const staff = (role: StaffUser['role']): StaffUser => ({ id: `st-${role}`, name: `Test ${role}`, email: `${role}@aafe-demo.example.org`, role })
const VOL = staff('check_in_volunteer'), RM = staff('relationship_manager')
const ADMIN_EMAIL = 'mei.ortiz@aafe-demo.example.org'
function demo(user: StaffUser) {
  let data = loadDB()
  return { api: demoApi(user, (fn) => { data = fn(data) }, () => data), db: () => data }
}
const judge = (q: { id: string; template: string; to_name: string; state: string; organization: string | null; tier: string | null; deadline: string | null; seats_unnamed: number; seats_total: number; guest: string | null }[]) =>
  q.map(({ id, template, to_name, state, organization, tier, deadline, seats_unnamed, seats_total, guest }) => ({ id, template, to_name, state, organization, tier, deadline, seats_unnamed, seats_total, guest }))
    .sort((a, b) => a.id.localeCompare(b.id))

describe('the demo matches the database', () => {
  it('lists the same unsent emails, with the same sponsor, package, seats, deadline and guest', async () => {
    const { as } = await openTestDb()
    const live = (await as('authenticated', ADMIN_EMAIL, 'select staff_email_queue() q'))[0].q
    expect(live.length).toBeGreaterThan(0)
    expect(judge(demoEmailQueue(loadDB()))).toEqual(judge(live))
  }, 60_000)

  it('drafts reminders for the same sponsors', async () => {
    const { db, as } = await openTestDb()
    const n = (await as('authenticated', ADMIN_EMAIL, 'select staff_queue_guest_list_reminders() n'))[0].n
    const drafted = (await db.query(`select order_id from email_log where template = 'guest_list_reminder' and status = 'queued' and trigger = 'staff_manual' order by order_id`)).rows.map((r: { order_id: string }) => r.order_id)
    const r = queueGuestListReminders(loadDB(), RM)
    expect(r.n).toBe(n)
    expect(r.db.email_log.filter((m) => m.template === 'guest_list_reminder' && m.status === 'queued' && m.trigger === 'staff_manual').map((m) => m.order_id).sort()).toEqual(drafted)
  }, 60_000)
})

describe('reminders and the approval list (demo)', () => {
  it('reminders are drafts staff must approve, logged once, and not drafted twice', async () => {
    const { api, db } = demo(RM)
    const before = (await api.emailQueue()).length
    const n = await api.queueReminders()
    expect(n).toBeGreaterThan(0)
    const q = await api.emailQueue()
    expect(q.length).toBe(before + n)
    expect(q.filter((e) => e.template === 'guest_list_reminder' && e.state === 'draft').length).toBeGreaterThanOrEqual(n)
    expect(db().email_log.filter((m) => m.template === 'guest_list_reminder' && m.status === 'sent' && m.trigger === 'staff_manual')).toHaveLength(0)
    expect(db().audit_log.at(-1)).toMatchObject({ action: 'email.reminders_drafted', actor: RM.name })
    expect(await api.queueReminders()).toBe(0)
  })

  it('a check-in volunteer can neither see the list nor draft reminders', async () => {
    const { api } = demo(VOL)
    await expect(api.emailQueue()).rejects.toThrow('forbidden')
    await expect(api.queueReminders()).rejects.toThrow('forbidden')
  })
})

describe('live mode', () => {
  it('reads the queue from staff_email_queue and returns the server’s reminder count, then reloads', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [], error: null }).mockResolvedValueOnce({ data: 3, error: null })
    const reload = vi.fn().mockResolvedValue(undefined)
    const api = liveApi({ rpc } as unknown as SupabaseClient, reload)
    await api.emailQueue()
    expect(reload).not.toHaveBeenCalled()
    expect(await api.queueReminders(5)).toBe(3)
    expect(rpc.mock.calls).toEqual([['staff_email_queue', {}], ['staff_queue_guest_list_reminders', { p_min_days: 5 }]])
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
