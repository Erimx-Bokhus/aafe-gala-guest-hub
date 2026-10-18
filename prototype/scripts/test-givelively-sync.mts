// Give Lively sync: what happens to each donation a poll returns (supabase/functions/_shared/givelively-sync.ts),
// run against the real gl_import() in PGlite. Runs with npm run test:backend.
import { pollStart, OVERLAP_MS, syncDonations, withoutKey, type SyncPorts } from '../supabase/functions/_shared/givelively-sync.ts'
import { normalize } from '../supabase/functions/_shared/givelively.ts'
// @ts-expect-error plain JavaScript helper
import { counter, openTestDb } from './test-db.mjs'
const { db, as } = await openTestDb()
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
// Gate 2 review (Oct 15): another campaign's donation is never kept, even one the sync can't read; and what is kept has
// no phone number or postal address (the feed's other fields stay, so staff can see what Give Lively sends).
{
  const kept = new Map<string, any>()
  const keep: SyncPorts = { importRow: async () => ({ data: null, error: null }), saveRaw: async (r) => { kept.set(r.transaction_id, r) } }
  await syncDonations([
    { campaign_name: 'Year-End Appeal', email: 'appeal@example.org', phone: '(212) 555-0199', street_address: '1 Example St' },
    { campaign_name: '', first_name: 'Unreadable', donor_email_address: 'unreadable@example.org', phone_number: '(212) 555-0198',
      billing: { address_1: '2 Example St', city: 'New York', zip: '10002' } },
  ], [PAGE], keep)
  const rows = [...kept.values()]
  ok(rows.length === 1 && JSON.stringify(rows[0].payload).includes('Unreadable'), `only the unreadable row is kept, not the other campaign's (${rows.length})`)
  const kept1 = JSON.stringify(rows[0]?.payload ?? {})
  ok(!/555-|Example St|10002|New York/.test(kept1) && kept1.includes('unreadable@example.org'), `kept without phone or address, email kept: ${kept1}`)
}

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

// ---- A bank payment that settled and was imported, then bounced (Natalie's backend review, item 1)
const s3 = (await q(`select o.id from payments p join orders o on o.id = p.order_id where p.givelively_transaction_id = 'GL-S3'`))[0].id
ok((await q(`select count(*)::int n from email_log where order_id = $1 and status = 'queued'`, [s3]))[0].n >= 1, 'the imported purchase has its guest-list link waiting for approval')
const bounced = donation('GL-S3', { donation_status: 'failed', payment_method: 'Bank Account (ACH)' })
const c8 = await syncDonations([bounced], [PAGE], ports)
ok(c8.failed === 1 && c8.updated === 1 && c8.not_settled === 0, `a failed donation reaches gl_import: ${JSON.stringify(c8)}`)
ok((await q(`select status from orders where id = $1`, [s3]))[0].status === 'cancelled', 'the bounced purchase is cancelled')
ok((await q(`select count(*)::int n from seats where order_id = $1 and status <> 'cancelled'`, [s3]))[0].n === 0, 'and its seats')
ok((await q(`select count(*)::int n from email_log where order_id = $1 and status = 'queued'`, [s3]))[0].n === 0, 'its unsent guest-list link is discarded')
ok((await q(`select count(*)::int n from import_review where order_id = $1 and reason = 'refund'`, [s3]))[0].n === 1, 'staff get a review item')
ok(saved.get('GL-S3').import_status === 'updated' && /failed.*cancelled/.test(saved.get('GL-S3').import_note), 'the stored donation says what happened')
const c9 = await syncDonations([bounced], [PAGE], ports)
ok(c9.updated === 0 && (await q(`select count(*)::int n from import_review where order_id = $1 and reason = 'refund'`, [s3]))[0].n === 1, 'the next poll changes nothing')
// A donation that failed before it was ever imported creates nothing.
const before8 = await totals()
const c10 = await syncDonations([donation('GL-S8', { donation_status: 'declined' })], [PAGE], ports)
ok(c10.failed === 1 && c10.created === 0, `a failed donation never imported creates nothing: ${JSON.stringify(c10)}`)
const after8 = await totals()
ok(after8.pay === before8.pay && after8.ord === before8.ord && after8.rev === before8.rev, 'no payment, order or review item')
ok(saved.get('GL-S8')?.import_status === 'skipped' && /nothing to undo/.test(saved.get('GL-S8').import_note), 'it is stored as skipped, with why')

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

const KEY = 'k3y/with+chars' // gitleaks:allow (an invented test key, not a credential)
const netErr = `error sending request for url (https://secure.givelively.org/nonprofits/org/json_dataclips/${encodeURIComponent(KEY)}.json?start_time_ms=1): dns error`
ok(!withoutKey(netErr, KEY).includes(encodeURIComponent(KEY)) && withoutKey(netErr, KEY).includes('***') && !withoutKey(`bad ${KEY}`, KEY).includes(KEY), 'a network error never carries the API key into the saved status')

// ---- Gate 1 (#146): Give Lively's older field names, disputes, and a held tier coming back (the Oct 14 research).
{
  // Older names (page_name, donation_amount) and the event export's own column names are read, not stored as unmapped.
  const old = normalize({ id: 'GL-OLD-1', donation_date: '2026-10-07T15:00:00Z', first_name: 'Ola', last_name: 'Older', email: 'ola@sync.example.org',
    page_name: PAGE, ticket_level: 'Gold Sponsor', donation_amount: '25,000.00', payment_method: 'Credit Card', status: 'succeeded', quantity: 1 })
  ok(old.campaign === PAGE && old.gross === 25000, `older names read: page_name ${old.campaign}, donation_amount ${old.gross}`)
  const exported = normalize({ 'Transaction ID': 'GL-EXP-1', 'Date/Time of Purchase': '2026-10-07T16:00:00Z', 'First Name': 'Eve', 'Last Name': 'Export',
    Email: 'eve@sync.example.org', 'Page Name': PAGE, 'Tier Purchased': 'Gold Sponsor', 'Tickets Purchased': '1', 'Amount Spent': '$25,000.00',
    'Amount Refunded': '$0.00', 'Transaction Fee Covered': 'TRUE', 'Company/Organization Name': 'Export Partners' })
  ok(exported.campaign === PAGE && exported.ticket_level === 'Gold Sponsor' && exported.gross === 25000 && exported.quantity === 1 && exported.company === 'Export Partners',
    'the event export\'s column names are read too')
  ok(exported.covered === null, `a covered fee that only says TRUE is unknown, not NaN (${exported.covered})`)
  const c = await syncDonations([{ id: 'GL-OLD-1', donation_date: '2026-10-07T15:00:00Z', first_name: 'Ola', last_name: 'Older', email: 'ola@sync.example.org',
    page_name: PAGE, ticket_level: 'Gold Sponsor', donation_amount: 25000, payment_method: 'Credit Card', status: 'succeeded', transaction_fee_amount: 550 }], [PAGE], ports)
  ok(c.created === 1 && c.unmapped === 0, `a donation with the older names imports: ${JSON.stringify(c)}`)

  // A dispute: a staff review and the payment flagged, nothing cancelled; asked again, no second review.
  const disputedNew = await syncDonations([donation('GL-D1', { dispute_status: 'needs_response' })], [PAGE], ports)
  const d1 = (await q(`select o.id, o.status, p.reconciliation_status rec from payments p join orders o on o.id = p.order_id where p.givelively_transaction_id = 'GL-D1'`))[0]
  ok(disputedNew.created === 1 && d1?.status === 'paid' && d1.rec === 'needs_review', 'a purchase that arrives disputed is imported, flagged, not cancelled')
  ok((await q(`select count(*)::int n from import_review where order_id = $1 and reason = 'disputed' and details ->> 'status' = 'needs_response'`, [d1.id]))[0].n === 1,
    'and staff get a "disputed" review with Give Lively\'s status')
  await syncDonations([donation('GL-D2')], [PAGE], ports)
  const later = await syncDonations([donation('GL-D2', { dispute: { status: 'lost' } })], [PAGE], ports)
  const d2 = (await q(`select o.id, o.status, p.reconciliation_status rec from payments p join orders o on o.id = p.order_id where p.givelively_transaction_id = 'GL-D2'`))[0]
  ok(later.updated === 1 && d2.status === 'paid' && d2.rec === 'needs_review', `a dispute on a purchase imported earlier flags it and cancels nothing: ${JSON.stringify(later)}`)
  ok((await q(`select count(*)::int n from audit_log where entity = 'payment' and action = 'payment.disputed' and order_id = $1`, [d2.id]))[0].n === 1, 'the dispute is in the change log')
  await syncDonations([donation('GL-D2', { dispute: { status: 'lost' } })], [PAGE], ports)
  ok((await q(`select count(*)::int n from import_review where order_id = $1 and reason = 'disputed'`, [d2.id]))[0].n === 1, 'the next poll adds no second review')
  for (const none of ['', 'none', 'false', 'N/A']) {
    const t = `GL-ND-${none || 'blank'}`
    await syncDonations([donation(t, { dispute_status: none })], [PAGE], ports)
    ok((await q(`select count(*)::int n from import_review r join payments p on p.order_id = r.order_id where p.givelively_transaction_id = $1 and r.reason = 'disputed'`, [t]))[0].n === 0,
      `"${none}" is no dispute`)
  }

  // GL-S4 waited on its tier ("Mystery Package"). The sync had moved on; linking the tier makes the next poll look back.
  await db.query(`update givelively_sync_state set cursor_ms = 1791300000000 where id = 1`)
  await as('authenticated', 'mei.ortiz@aafe-demo.example.org', `select staff_set_tier_mapping('Mystery Package', 'silver')`)
  ok((await q(`select cursor_ms from givelively_sync_state`))[0].cursor_ms === null, 'linking a tier the sync held resets its cursor: the next poll looks back over everything')
  const back = await syncDonations(DONATIONS, [PAGE], ports)
  ok(back.created === 1 && (await q(`select o.tier_id from payments p join orders o on o.id = p.order_id where p.givelively_transaction_id = 'GL-S4'`))[0]?.tier_id === 'silver',
    `and the held purchase is imported on its new level, nothing else twice: ${JSON.stringify(back)}`)
  await db.query(`update givelively_sync_state set cursor_ms = 1791300000000 where id = 1`)
  await as('authenticated', 'mei.ortiz@aafe-demo.example.org', `select staff_set_tier_mapping('Brand New Tier', 'silver')`)
  ok((await q(`select cursor_ms::text c from givelively_sync_state`))[0].c === '1791300000000', 'linking a tier nothing was held for leaves the cursor alone')
}

console.log(`givelively sync: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
