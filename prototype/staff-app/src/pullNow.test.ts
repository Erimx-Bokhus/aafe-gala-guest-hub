// "Pull now" on the Integrations page: gala admins only; the demo imports one invented purchase, and live mode calls the
// givelively-sync function (the same one the 15-minute schedule runs) and shows its own reason when it can't run.
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDB } from '@shared/data'
import type { StaffUser } from '@shared/types'
import { demoApi, errorText, liveApi } from './api'

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
  it("shows the function's own reason when it can't run", async () => {
    const notSet = client(500, { error: 'not_configured', message: 'Set GIVELIVELY_ORG_ID and GIVELIVELY_API_KEY.' })
    const e1 = await liveApi(notSet.c, async () => {}).pullGiveLively().catch((e) => e)
    expect(errorText(e1)).toBe('Set GIVELIVELY_ORG_ID and GIVELIVELY_API_KEY.')
    const down = client(502, { error: 'givelively_error', message: 'Give Lively returned HTTP 503.' })
    expect(errorText(await liveApi(down.c, async () => {}).pullGiveLively().catch((e) => e))).toBe('Give Lively returned HTTP 503.')
    const refused = client(403, { error: 'forbidden' })
    expect(errorText(await liveApi(refused.c, async () => {}).pullGiveLively().catch((e) => e))).toBe('Your role can’t do that.')
  })
})
