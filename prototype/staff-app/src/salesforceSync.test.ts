// "Sync now" on the Integrations page: gala admins only; the demo marks its pending records synced, and live mode
// calls the salesforce-push function (a stand-in org in the demo) and shows its own reason when it can't run.
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDB } from '@shared/data'
import type { StaffUser } from '@shared/types'
import { demoApi, errorText, liveApi } from './api'
import { NOT_CONNECTED } from '../../supabase/functions/_shared/salesforce.ts'

const staff = (role: StaffUser['role']): StaffUser => ({ id: `st-${role}`, name: `Test ${role}`, email: `${role}@aafe-demo.example.org`, role })
function demo(user: StaffUser) {
  let data = loadDB()
  return { api: demoApi(user, (fn) => { data = fn(data) }, () => data), db: () => data }
}
/** A client whose salesforce-push answers with `status` and `body`, the way supabase-js reports it. */
function client(status: number, body: unknown) {
  const invoke = vi.fn().mockResolvedValue(status < 300
    ? { data: body, error: null }
    : { data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: new Response(JSON.stringify(body), { status }) }) })
  return { c: { functions: { invoke } } as unknown as SupabaseClient, invoke }
}

describe('demo', () => {
  it('a gala admin syncs: every pending record is marked synced', async () => {
    const { api, db } = demo(staff('gala_admin'))
    const pending = db().salesforce_sync.filter((s) => s.status === 'pending').length
    const r = await api.syncSalesforce()
    expect(r.sent).toBeGreaterThanOrEqual(pending)
    expect(r.failed).toBe(0)
    expect(db().salesforce_sync.filter((s) => s.status === 'pending')).toHaveLength(0)
  })
  it('other roles are refused, as the function refuses them', async () => {
    await expect(demo(staff('relationship_manager')).api.syncSalesforce()).rejects.toThrow('forbidden')
    await expect(demo(staff('check_in_volunteer')).api.syncSalesforce()).rejects.toThrow('forbidden')
  })
})

describe('live', () => {
  it('calls salesforce-push, reloads, and returns what it sent', async () => {
    const summary = { sent: 120, failed: 1, by_object: { Campaign: 1, Account: 4, Contact: 57, CampaignMember: 57 }, first_error: 'INVALID_FIELD: Foreign key external ID not found: npe01__Opportunity__r' }
    const { c, invoke } = client(200, summary)
    const reload = vi.fn().mockResolvedValue(undefined)
    expect(await liveApi(c, reload).syncSalesforce()).toEqual(summary)
    expect(invoke).toHaveBeenCalledWith('salesforce-push', { method: 'POST' })
    expect(reload).toHaveBeenCalledOnce()
  })
  it("shows the function's own words when it can't run: what happened and what to do, never a setting's name (Gate 3)", async () => {
    const notSet = client(500, { error: 'not_configured', message: NOT_CONNECTED })
    expect(errorText(await liveApi(notSet.c, async () => {}).syncSalesforce().catch((e) => e)))
      .toBe("Salesforce isn't connected: its keys aren't set in Supabase. Ask your technical partner.")
    const refused = client(403, { error: 'forbidden' })
    expect(errorText(await liveApi(refused.c, async () => {}).syncSalesforce().catch((e) => e))).toBe('Your role can’t do that.')
  })
})
