// Sponsor-facing arrivals: only a gala admin switches them, on needs AAFE's privacy approval noted, both are logged,
// and the demo refuses the same way staff_set_sponsor_arrivals does.
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDB } from '@shared/data'
import type { StaffUser } from '@shared/types'
import { demoApi, errorText, liveApi } from './api'
// @ts-expect-error plain JavaScript helper shared with the backend tests
import { openTestDb } from '../../scripts/test-db.mjs'

const staff = (role: StaffUser['role']): StaffUser => ({ id: `st-${role}`, name: `Test ${role}`, email: `${role}@aafe-demo.example.org`, role })
const ADMIN = staff('gala_admin'), RM = staff('relationship_manager')
function demo(user: StaffUser) {
  let data = loadDB()
  return { api: demoApi(user, (fn) => { data = fn(data) }, () => data), db: () => data }
}
const gala = (d: ReturnType<typeof loadDB>) => d.gala_events.find((e) => e.id === d.meta.current_event_id)!

describe('sponsor arrivals switch', () => {
  it('starts off; switching on needs the approval noted; both directions are logged once', async () => {
    const { api, db } = demo(ADMIN)
    expect(gala(db()).sponsor_arrivals_visible ?? false).toBe(false)
    await expect(api.setSponsorArrivals(true, '  ')).rejects.toThrow(/invalid_input/)
    await api.setSponsorArrivals(true, 'Approved by email, Oct 20')
    expect(gala(db())).toMatchObject({ sponsor_arrivals_visible: true, sponsor_arrivals_note: 'Approved by email, Oct 20' })
    const logged = db().audit_log.filter((a) => a.action === 'gala.sponsor_arrivals')
    expect(logged.at(-1)?.summary).toBe('Sponsors can now see which of their guests have arrived (approval: Approved by email, Oct 20).')
    await api.setSponsorArrivals(true, 'again')   // already on: nothing changes, nothing logged
    expect(db().audit_log.filter((a) => a.action === 'gala.sponsor_arrivals')).toHaveLength(logged.length)
    await api.setSponsorArrivals(false, '')
    expect(gala(db()).sponsor_arrivals_visible).toBe(false)
    expect(db().audit_log.at(-1)?.summary).toBe('Sponsors can no longer see which of their guests have arrived.')
  })

  it('only a gala admin can switch it', async () => {
    await expect(demo(RM).api.setSponsorArrivals(true, 'note')).rejects.toThrow('forbidden')
  })

  it('refuses without a note in the same words as the database', async () => {
    const { err } = await openTestDb()
    const server = await err('authenticated', 'mei.ortiz@aafe-demo.example.org', `select staff_set_sponsor_arrivals(true, '')`)
    const local = await demo(ADMIN).api.setSponsorArrivals(true, '').catch((e: Error) => e.message)
    expect(local).toBe(server)
    expect(errorText(new Error(server))).toBe("Record AAFE's privacy approval (who and when) to switch arrivals on.")
  }, 60_000)

  it('live, one staff_set_sponsor_arrivals call, then reload', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const reload = vi.fn().mockResolvedValue(undefined)
    const api = liveApi({ rpc } as unknown as SupabaseClient, reload)
    await api.setSponsorArrivals(true, ' Approved Oct 20 ')
    await api.setSponsorArrivals(false, '')
    expect(rpc.mock.calls).toEqual([['staff_set_sponsor_arrivals', { p_on: true, p_note: 'Approved Oct 20' }], ['staff_set_sponsor_arrivals', { p_on: false, p_note: null }]])
    expect(reload).toHaveBeenCalledTimes(2)
  })
})
