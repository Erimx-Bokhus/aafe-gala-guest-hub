// The sponsor pipeline (slice D): the demo board gives the same totals, stages and prospects as staff_pipeline() on the same
// data, before and after the same staff actions (a goal, two new prospects, stage moves, a pledge and its payment); the stage
// rules, roles, and live calls.
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDB } from '@shared/data'
import type { DB, StaffUser } from '@shared/types'
import { demoApi, errorText, liveApi, type PipelineBoard } from './api'
import { parseAmount } from './store'
import { nyDate } from './date'
// @ts-expect-error plain JavaScript helper shared with the backend tests
import { openTestDb } from '../../scripts/test-db.mjs'

const seedStaff = (id: string) => loadDB().staff_users.find((u) => u.id === id)! as StaffUser
const MEI = seedStaff('st-mei'), DANIEL = seedStaff('st-daniel'), KENJI = seedStaff('st-kenji')

function demo(user: StaffUser, start: DB = loadDB()) {
  let data = start
  return { api: demoApi(user, (fn) => { data = fn(data) }, () => data), db: () => data, set: (fn: (d: DB) => DB) => { data = fn(data) },
    as: (u: StaffUser) => demoApi(u, (fn) => { data = fn(data) }, () => data) }
}
/** The board without ids and times (new records get random ones on each side), prospects in a fixed order. */
const comparable = (b: PipelineBoard) => ({
  goal: b.goal == null ? null : Number(b.goal), totals: b.totals, stages: b.stages,
  prospects: b.prospects.map(({ id: _id, stage_changed_at: _at, sponsor_id: _sp, order_id, ...p }) => ({ ...p, linked: !!order_id })).sort((a, c) => a.organization.localeCompare(c.organization)),
})
// A sponsor with only a ticket order this gala: a natural prospect for a sponsorship ask.
const ticketBuyer = (db: DB) => {
  const tiers = new Map(db.sponsorship_tiers.map((t) => [t.id, t.tier_category]))
  const mine = (sid: string) => db.orders.filter((o) => o.event_id === db.meta.current_event_id && o.sponsor_id === sid)
  return db.sponsors.find((s) => mine(s.id).length > 0 && mine(s.id).every((o) => tiers.get(o.tier_id) === 'ticket'))!
}

describe('the demo pipeline matches the database', () => {
  it('same board as staff_pipeline() from the seed, and after the same actions on both sides', async () => {
    const { as, err, db: sdb } = await openTestDb()
    const sql = async (q: string, params: unknown[] = []) => (await as('authenticated', MEI.email, q, params))[0]?.r
    const { api, db, set } = demo(MEI)
    const board = async () => [comparable(await sql('select staff_pipeline() r')), comparable(await api.pipeline())]

    // From the seed: every sponsorship order on this gala's list is a prospect, at the stage its order reached.
    let [server, mine] = await board()
    expect(mine).toEqual(server)
    expect(server.totals.prospects).toBeGreaterThan(5)
    expect(server.stages.find((s: { stage: string }) => s.stage === 'payment_received')!.count).toBeGreaterThan(0)

    // The same staff actions on both sides.
    const buyer = ticketBuyer(db())
    const tier = db().sponsorship_tiers.find((t) => t.tier_category === 'sponsorship' && t.contribution_amount > 0)!
    await sql('select staff_set_sponsorship_goal(250000)'); await api.setSponsorshipGoal(250000)
    const newOrg = { organization: 'Lotus Street Bakery', contact_name: 'Rina Cho', contact_email: 'rina@lotus-sample.example.org', sector: 'small_business', ask_amount: 5000, notes: 'Met at the spring fair.' }
    const sNew = await sql('select staff_save_prospect($1) r', [JSON.stringify(newOrg)])
    const dNew = await api.saveProspect({ ...newOrg, sector: 'small_business' })
    // An individual sponsor (item 6): no organization; the contact's name becomes the sponsor's name on both sides.
    const person = { contact_name: 'Dana Example Individual', ask_amount: 1500 }
    await sql('select staff_save_prospect($1) r', [JSON.stringify({ ...person, sector: 'individual' })]); await api.saveProspect({ ...person, sector: 'individual' })
    const sBuyer = await sql('select staff_save_prospect($1) r', [JSON.stringify({ sponsor_id: buyer.id, ask_tier_id: tier.id, ask_amount: tier.contribution_amount, follow_up_owner_id: 'st-priya' })])
    const dBuyer = await api.saveProspect({ sponsor_id: buyer.id, ask_tier_id: tier.id, ask_amount: tier.contribution_amount, follow_up_owner_id: 'st-priya' })
    for (const stage of ['reached_out', 'in_conversation']) { await sql('select staff_set_prospect_stage($1, $2) r', [sNew, stage]); await api.setProspectStage(dNew, stage as 'reached_out') }
    await sql(`select staff_set_prospect_stage($1, 'lost') r`, [sBuyer]); await api.setProspectStage(dBuyer, 'lost')
    // The bakery pledges (a new sponsor record, the same name): its prospect moves to closed won by itself.
    await sql(`select staff_add_pledge('Lotus Street Bakery', 'Rina Cho', 'rina@lotus-sample.example.org', $1, 'check') r`, [tier.id])
    await api.addPledge({ org: 'Lotus Street Bakery', contact: 'Rina Cho', email: 'rina@lotus-sample.example.org', tierId: tier.id, source: 'check' })
    ;[server, mine] = await board()
    expect(mine).toEqual(server)
    expect(mine.prospects.find((p) => p.organization === 'Lotus Street Bakery')).toMatchObject({ stage: 'closed_won', commitment: tier.contribution_amount, received: 0 })
    // Then pays part of it: payment received.
    const sOrder = (await as('authenticated', MEI.email, `select order_id from sponsor_prospects where id = $1`, [sNew]))[0].order_id
    const dOrder = (await api.pipeline()).prospects.find((p) => p.id === dNew)!.order_id!
    // Dated today: the server refuses a payment dated more than 3 days ahead (#224).
    const today = nyDate(new Date())
    await sql(`select staff_record_payment($1, 'check', 1000, $2::date, '4411') r`, [sOrder, today])
    await api.recordPayment(dOrder, { method: 'check', amount: 1000, received: today, check_number: '4411' })
    ;[server, mine] = await board()
    expect(mine).toEqual(server)
    expect(mine.goal).toBe(250000)
    expect(mine.prospects.find((p) => p.organization === 'Lotus Street Bakery')).toMatchObject({ stage: 'payment_received', received: 1000, balance: tier.contribution_amount - 1000 })

    // The same refusals, word for word.
    const refusals: [string, unknown[], () => Promise<unknown>][] = [
      [`select staff_set_prospect_stage($1, 'lost')`, [sNew], () => api.setProspectStage(dNew, 'lost')],
      [`select staff_set_prospect_stage($1, 'payment_received')`, [sBuyer], () => api.setProspectStage(dBuyer, 'payment_received')],
      ['select staff_save_prospect($1)', [JSON.stringify({ sponsor_id: buyer.id })], () => api.saveProspect({ sponsor_id: buyer.id })],
      ['select staff_save_prospect($1)', [JSON.stringify({ organization: buyer.organization_name, contact_name: 'X' })], () => api.saveProspect({ organization: buyer.organization_name, contact_name: 'X' })],
      ['select staff_save_prospect($1)', [JSON.stringify({ id: sNew, ask_amount: -1 })], () => api.saveProspect({ id: dNew, ask_amount: -1 })],
      ['select staff_set_sponsorship_goal(-5)', [], () => api.setSponsorshipGoal(-5)],
    ]
    for (const [q, params, run] of refusals) {
      const sqlErr = await err('authenticated', MEI.email, q, params)
      await expect(run()).rejects.toThrow(sqlErr)
      expect(sqlErr).toMatch(/^(invalid_input|invalid_transition)/)
    }

    // Then Give Lively refunds it in full, the donor-covered fee too, and the order is cancelled, as gl_import does
    // (Oct 12 audit): the prospect is lost and nothing counts as received, on both sides.
    await sdb.query(`update payments set refunded_amount = original_amount + 11.30 where order_id = $1`, [sOrder])
    await sdb.query(`update orders set status = 'cancelled', updated_at = now() where id = $1`, [sOrder])
    set((d) => ({ ...d, payments: d.payments.map((x) => (x.order_id === dOrder ? { ...x, refunded_amount: x.original_amount + 11.3 } : x)),
      orders: d.orders.map((o) => (o.id === dOrder ? { ...o, status: 'cancelled' as const, updated_at: new Date().toISOString() } : o)) }))
    ;[server, mine] = await board()
    expect(mine).toEqual(server)
    expect(mine.prospects.find((p) => p.organization === 'Lotus Street Bakery')).toMatchObject({ stage: 'lost', received: 0, probability: 0 })
    expect(mine.stages.find((x) => x.stage === 'payment_received')!.received).toBeGreaterThanOrEqual(0)
  }, 120_000)
})

describe('the pipeline, in demo mode', () => {
  it('a staff stage holds until the order changes; editing logs only what changed', async () => {
    const { api, db } = demo(DANIEL)
    const id = await api.saveProspect({ organization: 'Harbor Sample Partners', contact_name: 'Lena Ortiz', ask_amount: 10000 })
    await api.setProspectStage(id, 'in_conversation')
    expect((await api.pipeline()).prospects.find((p) => p.id === id)!.stage).toBe('in_conversation')
    await api.saveProspect({ id, ask_amount: 10000, notes: 'Wants a table near the stage.' })
    expect(db().audit_log.at(-1)).toMatchObject({ action: 'prospect.updated', summary: 'Harbor Sample Partners: notes edited.', actor: DANIEL.name })
    await expect(api.setProspectStage(id, 'payment_received')).rejects.toThrow('invalid_transition: record the payment first')
    expect(db().audit_log.filter((a) => a.entity === 'prospect').map((a) => a.action)).toEqual(expect.arrayContaining(['prospect.created', 'prospect.stage', 'prospect.updated']))
  })

  it('a check-in volunteer cannot see the pipeline; a relationship manager cannot set the goal', async () => {
    const { as } = demo(MEI)
    await expect(as(KENJI).pipeline()).rejects.toThrow('forbidden')
    await expect(as(KENJI).saveProspect({ organization: 'A', contact_name: 'B' })).rejects.toThrow('forbidden')
    await expect(as(DANIEL).setSponsorshipGoal(1)).rejects.toThrow('forbidden')
    await as(MEI).setSponsorshipGoal(100000)
    expect((await as(DANIEL).pipeline()).goal).toBe(100000)
  })

  it('adding an organization that is already a sponsor says what to do, without an internal id (Gate 3)', async () => {
    const { api } = demo(DANIEL)
    const sp = loadDB().sponsors.find((x) => x.organization_name === 'Acme Community Partners')!
    const e = await api.saveProspect({ organization: 'acme community partners', contact_name: 'X' }).catch((x: unknown) => x)
    expect(errorText(e)).toBe('Acme Community Partners is already a sponsor: choose them from the existing sponsors instead.')
    expect(String(e)).not.toContain(sp.id)
  })
})

describe('live mode', () => {
  it('one staff_* call each; writes reload, the board read does not', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'pr-1', error: null })
    const reload = vi.fn().mockResolvedValue(undefined)
    const api = liveApi({ rpc } as unknown as SupabaseClient, reload)
    await api.pipeline()
    expect(await api.saveProspect({ sponsor_id: 'sp-1', ask_amount: 5000 })).toBe('pr-1')
    await api.setProspectStage('pr-1', 'reached_out'); await api.setSponsorshipGoal(250000)
    expect(rpc.mock.calls).toEqual([
      ['staff_pipeline', {}], ['staff_save_prospect', { p: { sponsor_id: 'sp-1', ask_amount: 5000 } }],
      ['staff_set_prospect_stage', { p_id: 'pr-1', p_stage: 'reached_out' }], ['staff_set_sponsorship_goal', { p_amount: 250000 }]])
    expect(reload).toHaveBeenCalledTimes(3)
  })
})

// Cornell's review of #93: "1.2.3" or "." used to become NaN, which JSON sends as null, so the goal or the ask was cleared.
describe('the Goal and Ask boxes', () => {
  it('read an amount, take empty as none, and refuse what is not a number', () => {
    expect(parseAmount('25000')).toBe(25000)
    expect(parseAmount('2500.50')).toBe(2500.5)
    expect(parseAmount('  ')).toBeNull()
    for (const bad of ['1.2.3', '.', '..']) expect(() => parseAmount(bad)).toThrow(/invalid_input: enter a valid amount/)
  })
})
