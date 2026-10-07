// Give Lively sync: what happens to each donation a poll returns (supabase/functions/_shared/givelively-sync.ts),
// run against the real gl_import() in PGlite. Runs with npm run test:backend.
import { pollStart, OVERLAP_MS, syncDonations, type SyncPorts } from '../supabase/functions/_shared/givelively-sync.ts'
// @ts-expect-error plain JavaScript helper
import { counter, openTestDb } from './test-db.mjs'
const { db } = await openTestDb()
const count = counter(), ok = count.ok
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as any[]

const PAGE = 'AAFE Gala 2027 (sync test)'
await db.query(`update gala_events set givelively_page_name = $1 where id = current_event_id()`, [PAGE])

const donation = (txn: string, over: Record<string, unknown> = {}) => ({
  transaction_id: txn, donation_date: '2026-10-06T15:04:00Z', first_name: 'Robin', last_name: 'Sync', email: `${txn.toLowerCase()}@sync.example.org`,
  company_name: 'Sync Test Partners', campaign_name: PAGE, ticket_level: 'Gold Sponsor', payment_method: 'Credit Card',
  donation_status: 'succeeded', quantity: 1, original_amount: 25000, covered_transaction_fee_amount: 0, gross_amount: 25000,
  transaction_fee_amount: 550, net_amount: 24450, total_refunded_amount: 0, ...over,
})
const DONATIONS = [
  donation('GL-S1'),
  donation('GL-S2', { campaign_name: 'Spring Appeal' }),            // another campaign
  donation('GL-S3', { donation_status: 'pending' }),                // ACH still settling
  { note: 'no id, no email, no amount' },                           // nothing to match on
  donation('GL-S4', { ticket_level: 'Mystery Package' }),           // a tier nobody has mapped
]

const saved = new Map<string, any>()
const ports: SyncPorts = {
  importRow: async (row) => {
    try { return { data: (await q(`select gl_import($1::jsonb, 'Give Lively sync') r`, [JSON.stringify([row])]))[0].r, error: null } }
    catch (e) { return { data: null, error: (e as Error).message } }
  },
  saveRaw: async (rec) => {
    saved.set(rec.transaction_id, rec)
    await db.query(`insert into givelively_raw (transaction_id, payload, last_seen_at, import_status, import_note) values ($1, $2, $3, $4, $5)
      on conflict (transaction_id) do update set payload = excluded.payload, last_seen_at = excluded.last_seen_at,
      import_status = excluded.import_status, import_note = excluded.import_note`,
      [rec.transaction_id, JSON.stringify(rec.payload), rec.last_seen_at, rec.import_status, rec.import_note])
  },
}
const totals = async () => (await q(`select (select count(*) from payments)::int pay, (select count(*) from orders)::int ord,
  (select count(*) from givelively_raw)::int raw, (select count(*) from import_review)::int rev`))[0]

// ---- First poll
const c1 = await syncDonations(DONATIONS, [PAGE], ports)
ok(c1.seen === 5 && c1.created === 1 && c1.not_gala === 1 && c1.not_settled === 1 && c1.unmapped === 1, `first poll counts: ${JSON.stringify(c1)}`)
const order = (await q(`select o.id, o.tier_id, sp.organization_name from payments p join orders o on o.id = p.order_id
  join sponsors sp on sp.id = o.sponsor_id where p.givelively_transaction_id = 'GL-S1'`))[0]
ok(order?.tier_id === 'gold' && order.organization_name === 'Sync Test Partners', 'the gala purchase becomes a Gold order for its company')
ok(!saved.has('GL-S2') && (await q(`select 1 from givelively_raw where transaction_id = 'GL-S2'`)).length === 0, 'another campaign is ignored and not stored')
ok(saved.get('GL-S3')?.import_status === 'skipped' && /pending.*once settled/.test(saved.get('GL-S3').import_note), 'a pending payment is stored as skipped, to import once settled')
ok((await q(`select 1 from payments where givelively_transaction_id = 'GL-S3'`)).length === 0, 'a pending payment creates no payment')
const junk = [...saved.keys()].find((k) => k.startsWith('unmapped-'))
ok(junk && saved.get(junk).import_status === 'unmapped', 'a donation with nothing to match on is stored as unmapped, keyed by its content')
ok((await q(`select count(*)::int n from import_review where reason = 'unknown_tier' and details ->> 'tier_purchased' = 'Mystery Package'`))[0].n === 1,
  'an unmapped tier goes to staff review')
ok((await q(`select 1 from payments where givelively_transaction_id = 'GL-S4'`)).length === 0, 'an unmapped tier creates no order until staff map it')

// ---- The next poll re-reads the overlap: nothing doubles
const before = await totals()
const c2 = await syncDonations(DONATIONS, [PAGE], ports)
ok(c2.created === 0 && c2.updated === 0, `second poll creates and updates nothing: ${JSON.stringify(c2)}`)
ok(JSON.stringify(await totals()) === JSON.stringify(before), 'second poll adds no payments, orders, stored rows, or review items')

// ---- The pending payment settles: the next poll imports it once
const c3 = await syncDonations([donation('GL-S3', { donation_status: 'succeeded' })], [PAGE], ports)
ok(c3.created === 1 && saved.get('GL-S3').import_status === 'imported', 'once settled, the payment imports on the next poll')
const c4 = await syncDonations([donation('GL-S3', { donation_status: 'succeeded' })], [PAGE], ports)
ok(c4.created === 0 && (await q(`select count(*)::int n from payments where givelively_transaction_id = 'GL-S3'`))[0].n === 1, 'and only once')

// ---- A refund on an imported purchase updates it
const c5 = await syncDonations([donation('GL-S1', { total_refunded_amount: 25000 })], [PAGE], ports)
ok(c5.updated === 1 && saved.get('GL-S1').import_status === 'updated', `a refund updates the payment: ${JSON.stringify(c5)}`)

// ---- The database refuses a row: it is recorded with the error and the rest carry on
const failing: SyncPorts = { ...ports, importRow: async (row) => row.txn === 'GL-S5' ? { data: null, error: 'boom' } : ports.importRow(row) }
const c6 = await syncDonations([donation('GL-S5'), donation('GL-S6')], [PAGE], failing)
ok(c6.unmapped === 1 && c6.created === 1, `a refused row doesn't stop the rest: ${JSON.stringify(c6)}`)
ok(saved.get('GL-S5')?.import_status === 'unmapped' && saved.get('GL-S5').import_note === 'boom', 'the refused row is stored with the error for staff')

// ---- No page name set: nothing counts as a gala sale
const c7 = await syncDonations([donation('GL-S7')], [], ports)
ok(c7.not_gala === 1 && c7.created === 0, 'without a page name nothing imports')

// ---- Where the next poll starts
ok(pollStart(null) === null && pollStart(0) === null, 'first poll reads everything')
ok(pollStart(1_800_000_000_000) === 1_800_000_000_000 - OVERLAP_MS && OVERLAP_MS === 600_000, 'later polls re-read the last 10 minutes')

console.log(`givelively sync: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
