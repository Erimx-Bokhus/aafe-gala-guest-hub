// "Pull now" on the Integrations page: gala admins only; the demo imports one invented purchase, and live mode calls the
// givelively-sync function (the same one the 15-minute schedule runs) and shows its own reason when it can't run.
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDB } from '@shared/data'
import type { StaffUser } from '@shared/types'
import { demoApi, errorText, liveApi } from './api'
import { NOT_CONNECTED, pollFailure } from '../../supabase/functions/_shared/givelively-sync.ts'

const staff = (role: StaffUser['role']): StaffUser => ({ id: `st-${role}`, name: `Test ${role}`, email: `${role}@aafe-demo.example.org`, role })
function demo(user: StaffUser) {
  let data = loadDB()
  return { api: demoApi(user, (fn) => { data = fn(data) }, () => data), db: () => data }
}
/** A client whose givelively-sync answers with `status` and `body`, the way supabase-js reports it. */
function client(status: number, body: unknown) {
  const invoke = vi.fn().mockResolvedValue(status < 300
    ? { data: body, error: null }
    : { data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context: new Response(JSON.stringify(body), { status }) }) })
  return { c: { functions: { invoke } } as unknown as SupabaseClient, invoke }
}

describe('demo', () => {
  it('a gala admin pulls one new invented purchase, with its order and a draft guest-list email', async () => {
    const { api, db } = demo(staff('gala_admin'))
    const orders = db().orders.length, drafts = db().email_log.filter((m) => m.status === 'queued').length
    const c = await api.pullGiveLively()
    expect(c).toMatchObject({ seen: 1, created: 1, skipped: 0 })
    expect(db().orders.length).toBe(orders + 1)
    expect(db().email_log.filter((m) => m.status === 'queued').length).toBe(drafts + 1)
  })
  it('other roles are refused, as the function refuses them', async () => {
    await expect(demo(staff('relationship_manager')).api.pullGiveLively()).rejects.toThrow('forbidden')
    await expect(demo(staff('check_in_volunteer')).api.pullGiveLively()).rejects.toThrow('forbidden')
  })
})

describe('live', () => {
  it('calls givelively-sync, reloads, and returns its counts', async () => {
    const { c, invoke } = client(200, { seen: 4, created: 1, updated: 1, skipped: 0, needs_review: 1, not_gala: 1, not_settled: 1, unmapped: 0 })
    const reload = vi.fn().mockResolvedValue(undefined)
    const counts = await liveApi(c, reload).pullGiveLively()
    expect(invoke).toHaveBeenCalledWith('givelively-sync', { method: 'POST' })
    expect(reload).toHaveBeenCalledOnce()
    expect(counts).toMatchObject({ created: 1, updated: 1, needs_review: 1, not_settled: 1 })
  })
  it("shows the function's own words when it can't run: what happened and what to do, never a setting's name (Gate 3)", async () => {
    const shown = async (status: number, body: unknown) => errorText(await liveApi(client(status, body).c, async () => {}).pullGiveLively().catch((e) => e))
    expect(await shown(500, { error: 'not_configured', message: NOT_CONNECTED }))
      .toBe("Give Lively isn't connected: its keys aren't set in Supabase. Ask your technical partner.")
    expect(await shown(502, { error: 'givelively_error', message: pollFailure(404) }))
      .toBe("Give Lively didn't accept AAFE's org ID or API key. Ask your technical partner to check them.")
    expect(await shown(502, { error: 'givelively_error', message: pollFailure(503) }))
      .toBe("Couldn't reach Give Lively. Try again in a few minutes; the 15-minute schedule keeps trying.")
    expect(pollFailure(null)).toBe(pollFailure(503))
    const refused = client(403, { error: 'forbidden' })
    expect(errorText(await liveApi(refused.c, async () => {}).pullGiveLively().catch((e) => e))).toBe('Your role can’t do that.')
  })
})
