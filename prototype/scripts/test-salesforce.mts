// Salesforce stand-in: what salesforce-push sends (salesforce_outbox in backend.sql, mapped by _shared/salesforce.ts),
// pushed to the stand-in org (demo_salesforce.sql) and recorded (salesforce_mark_synced), all in PGlite.
// Runs with npm run test:backend. Invented data only.
import { readFileSync } from 'node:fs'
import { BATCH, EXTERNAL_ID, pushAll, summarize, toBatches, type Outbox, type PushPorts } from '../supabase/functions/_shared/salesforce.ts'
// @ts-expect-error plain JavaScript helper
import { counter, D, openTestDb } from './test-db.mjs'
const { db, as, err } = await openTestDb()
await db.exec(readFileSync(D + 'demo_salesforce.sql', 'utf8'))
await db.exec(readFileSync(D + 'demo_salesforce.sql', 'utf8')) // re-running must be safe
const count = counter(), ok = count.ok
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as any[]
const ADMIN = 'mei.ortiz@aafe-demo.example.org'

// ---- Only the edge function's service role may call these
for (const sql of ['select salesforce_outbox()', `select salesforce_mark_synced('[]')`, `select demo_salesforce_upsert('Account', '[]')`]) {
  ok(/permission denied/.test((await err('authenticated', ADMIN, sql)) ?? ''), `signed-in staff can't run: ${sql}`)
}

// ---- What gets sent
const guest = (await q(`select g.id from guests g join orders o on o.id = g.order_id
  where o.event_id = current_event_id() and o.status <> 'cancelled' order by g.id limit 1`))[0].id
await as('authenticated', ADMIN, `select staff_check_in($1, 'search')`, [guest])
const outbox = async (): Promise<Outbox> => (await as('service_role', null, 'select salesforce_outbox() o'))[0].o
const o1 = await outbox()
const glOrders = new Set((await q(`select id from orders where event_id = current_event_id() and source = 'givelively'`)).map((r) => r.id))
const stripe = new Set((await q(`select id from payments where processor = 'stripe'`)).map((r) => r.id))
ok(glOrders.size > 0 && o1.opportunities.length > 0 && !o1.opportunities.some((x) => glOrders.has(x.id)), "Give Lively's orders are left to its own connector")
ok(o1.payments.length > 0 && !o1.payments.some((x) => stripe.has(x.id)), 'only the checks, ACH and wires staff recorded')
ok(o1.accounts.every((a) => o1.opportunities.some((x) => x.account_id === a.id)), 'an Account only for a sponsor with an order this sends')
const named = (await q(`select count(*)::int n from guests g join orders o on o.id = g.order_id where o.event_id = current_event_id() and o.status <> 'cancelled'`))[0].n
ok(o1.contacts.length === named, `every named guest, Give Lively buyers' guests included (${named})`)
const att = new Map((await q(`select g.id, g.attendance_status a from guests g join orders o on o.id = g.order_id where o.event_id = current_event_id()`)).map((r) => [r.id, r.a]))
const LABEL: Record<string, string> = { checked_in: 'Attended', no_show: 'No Show', expected: 'Registered' }
ok(o1.contacts.find((c) => c.id === guest)?.status === 'Attended' && o1.contacts.every((c) => c.status === LABEL[att.get(c.id)]), 'a checked-in guest is Attended, the rest by their status')
ok(!/phone|dietary|accessib/i.test(JSON.stringify(o1)), 'no phones, dietary or accessibility details')
ok(o1.contacts.every((c) => c.last), 'every Contact has a LastName, which Salesforce requires')

// ---- The shape Salesforce takes
const batches = toBatches(o1)
ok(batches.map((b) => b.sobject).join() === 'Campaign,Account,Opportunity,npe01__OppPayment__c,Contact,CampaignMember', 'parents are sent before the records that point to them')
ok(batches.every((b) => b.records.every((r) => r.attributes.type === b.sobject && typeof r[EXTERNAL_ID] === 'string')), 'every record names its type and carries our id')
const paid = o1.opportunities.find((x) => x.status === 'paid')
ok(!paid || batches[2].records.find((r) => r[EXTERNAL_ID] === paid.id)?.StageName === 'Closed Won', 'a paid order is Closed Won')

// ---- Push to the stand-in org, then record what it said
const ports: PushPorts = { upsert: async (sobject, records) => (await as('service_role', null, 'select demo_salesforce_upsert($1, $2::jsonb) r', [sobject, JSON.stringify(records)]))[0].r }
const mark = async (results: unknown) => (await as('service_role', null, 'select salesforce_mark_synced($1::jsonb) m', [JSON.stringify(results)]))[0].m
const r1 = await pushAll(o1, ports)
const s1 = summarize(r1)
ok(s1.failed === 0 && s1.sent === 1 + o1.accounts.length + o1.opportunities.length + o1.payments.length + 2 * o1.contacts.length, `everything lands: ${JSON.stringify(s1.by_object)}`)
const m1 = await mark(r1)
ok(m1.synced === r1.length && m1.failed === 0, 'every answer is recorded')
const acct = (await q(`select salesforce_account_id from sponsors where id = $1`, [o1.accounts[0].id]))[0].salesforce_account_id
ok(/^001MOCK/.test(acct), 'the sponsor keeps its Salesforce Account id')
ok(/^006MOCK/.test((await q(`select salesforce_opportunity_id from orders where id = $1`, [o1.opportunities[0].id]))[0].salesforce_opportunity_id), 'the order keeps its Opportunity id')
ok((await q(`select count(*)::int n from salesforce_sync where sf_object = 'CampaignMember' and status = 'synced'`))[0].n === o1.contacts.length, 'one synced CampaignMember row per guest')
ok((await q(`select count(*)::int n from audit_log where action = 'salesforce.synced'`))[0].n === 1, 'one change-log line for the run')

// ---- Sending again updates, never duplicates
const records = async () => (await q(`select count(*)::int n from demo_salesforce_records`))[0].n
const before = await records()
const r2 = await pushAll(await outbox(), ports)
await mark(r2)
ok(await records() === before, 'a second push adds no records in Salesforce')
ok(r2.every((x, i) => x.sf_id === r1[i].sf_id), 'each record keeps its Salesforce id')
ok((await q(`select count(*)::int n from salesforce_sync where entity = 'guest' and sf_object = 'Contact'`))[0].n === o1.contacts.length, 'and no duplicate sync rows')

// ---- Failures stay with their records
const lone = await pushAll({ campaign: null, accounts: [], opportunities: [], contacts: [],
  payments: [{ id: 'pay-orphan', order_id: 'ord-not-sent', amount: 100, date: '2027-01-15', method: 'check' }] }, ports)
ok(/INVALID_FIELD/.test(lone[0].error ?? ''), "a payment whose Opportunity Salesforce doesn't have fails, as in Salesforce")
await mark(lone)
ok((await q(`select status, error_message from salesforce_sync where entity_id = 'pay-orphan'`))[0]?.status === 'error', 'and is recorded as an error, with the reason')
const flaky: PushPorts = { upsert: (sobject, recs) => (sobject === 'Contact' ? Promise.reject(new Error('HTTP 503')) : ports.upsert(sobject, recs)) }
const r3 = await pushAll(await outbox(), flaky)
ok(r3.filter((x) => x.sf_object === 'Contact').every((x) => x.error === 'HTTP 503') && r3.filter((x) => x.sf_object !== 'Contact').every((x) => !x.error),
  'a call that fails outright fails its own records, and the rest still go')

// ---- Salesforce takes 200 records a call
const calls: [string, number][] = []
await pushAll({ ...o1, contacts: Array.from({ length: 450 }, (_, i) => ({ id: `g-batch-${i}`, first: 'Test', last: `Guest ${i}`, email: null, status: 'Registered' })) },
  { upsert: async (sobject, recs) => { calls.push([sobject, recs.length]); return recs.map(() => ({ success: true, id: 'x' })) } })
ok(BATCH === 200 && calls.filter(([s]) => s === 'Contact').map(([, n]) => n).join() === '200,200,50', '450 Contacts go in three calls')

console.log(`salesforce: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
