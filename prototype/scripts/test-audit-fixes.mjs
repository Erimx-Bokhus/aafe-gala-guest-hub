// Fixes from the Oct 12 audit, each set up with what the demo data lacks: a second gala, a deadline already
// passed, a partial refund. Runs with npm run test:backend. Invented data only.
import { counter, openTestDb } from './test-db.mjs'
import { deadlinePassed } from '../supabase/functions/_shared/emails.ts'
import { retry } from '../supabase/functions/_shared/retry.ts'
const { db, as, err } = await openTestDb()
const count = counter(), ok = count.ok
const q = async (sql, params) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]
const ADMIN = 'mei.ortiz@aafe-demo.example.org', RM = 'daniel.seo@aafe-demo.example.org'
const current = async () => (await one(`select current_event_id() id`)).id

// ---- The current gala: next year's gala in planning doesn't take over this year's
ok(await current() === 'ev-2027', 'the demo gala is current')
await db.exec(`insert into gala_events (id, year, name, event_date, guest_list_deadline, status) values ('ev-2028', 2028, 'AAFE Gala 2028 (test)', '2028-05-18', '2028-04-20', 'planning')`)
ok(await current() === 'ev-2027', "creating next year's gala in planning leaves this year's current")
await db.exec(`update gala_events set status = 'live' where id = 'ev-2028'`)
ok(await current() === 'ev-2028', 'a gala marked live is current')
await db.exec(`update gala_events set status = 'planning' where id = 'ev-2028'; update gala_events set status = 'closed' where id = 'ev-2027'`)
ok(await current() === 'ev-2028', "once this year's gala is closed, next year's is current")
await db.exec(`update gala_events set status = 'planning' where id = 'ev-2027'; delete from gala_events where id = 'ev-2028'`)
ok(await current() === 'ev-2027', 'and back')

// ---- A late purchase: no link that would arrive expired; staff extend that one order's deadline
const order = (await one(`select id from orders where event_id = current_event_id() and status <> 'cancelled' and source <> 'givelively' order by id limit 1`)).id
await db.query(`update orders set guest_list_deadline = (now() at time zone 'America/New_York')::date - 3 where id = $1`, [order])
const draft = (await one(`select enqueue_email('portal_link', 'late.buyer@example.org', 'Late Buyer', $1, null, 'staff') id`, [order])).id
  ?? (await one(`select id from email_log where order_id = $1 and template = 'portal_link' and approved_at is null order by id desc limit 1`, [order])).id
ok(/deadline .* has passed/.test(await err('authenticated', ADMIN, `select staff_approve_email($1)`, [draft]) ?? ''), "a link for an order whose deadline has passed can't be approved")
ok(/forbidden/.test(await err('authenticated', RM, `select staff_set_order_deadline($1, (now() at time zone 'America/New_York')::date + 10)`, [order]) ?? ''), 'only a gala admin moves one order\'s deadline')
ok(/after the gala/.test(await err('authenticated', ADMIN, `select staff_set_order_deadline($1, '2027-06-30')`, [order]) ?? ''), "the deadline can't be after the gala")
await db.query(`update orders set portal_token = 'abc123' where id = $1`, [order])
await as('authenticated', ADMIN, `select staff_set_order_deadline($1, (now() at time zone 'America/New_York')::date + 10)`, [order])
const o = await one(`select guest_list_deadline::text dl, portal_token_expires_at = (((now() at time zone 'America/New_York')::date + 11)::timestamp at time zone 'America/New_York') moved from orders where id = $1`, [order])
ok(o.moved, 'a link already sent moves with the new deadline')
ok((await one(`select count(*)::int n from audit_log where action = 'order.deadline_changed' and entity_id = $1`, [order])).n === 1, 'the change is logged')
ok((await err('authenticated', ADMIN, `select staff_approve_email($1)`, [draft])) === null, 'then the link can be approved')
ok(deadlinePassed('2026-10-01', new Date('2026-10-02T03:59:00Z')) === false && deadlinePassed('2026-10-01', new Date('2026-10-02T04:01:00Z')) === true,
  'the sender counts a deadline day as over at midnight New York time')
ok(deadlinePassed(null) === false, 'no deadline is never passed')

// ---- Refunds: a partial refund keeps the order; a full one cancels it
const row = (txn, over) => ({ txn, email: `${txn.toLowerCase()}@audit.example.org`, date: '2026-10-06T15:04:00Z', first: 'Robin', last: 'Audit', company: '',
  campaign: 'AAFE Gala 2027', tier_id: 'community_ticket', ticket_level: 'Community Ticket', method: 'Credit Card', status: 'succeeded',
  quantity: 2, original: 500, gross: 500, fee: 11.3, net: 488.7, refunded: 0, ...over })
const imp = async (r) => (await as('service_role', null, `select gl_import($1::jsonb, 'audit test') r`, [JSON.stringify([r])]))[0].r
const state = async (txn) => one(`select o.status, (select count(*)::int from seats s where s.order_id = o.id and s.status <> 'cancelled') open_seats
  from payments p join orders o on o.id = p.order_id where p.givelively_transaction_id = $1`, [txn])
await imp(row('GL-AUDIT-PARTIAL', { status: 'Partially Refunded', refunded: 250 }))
const partial = await state('GL-AUDIT-PARTIAL')
ok(partial.status === 'partially_paid' && partial.open_seats === 2, `"Partially Refunded" keeps the order and its seats (${JSON.stringify(partial)})`)
await imp(row('GL-AUDIT-FULL', { status: 'Refunded', refunded: 0 }))
ok((await state('GL-AUDIT-FULL')).status === 'cancelled', '"Refunded" on its own still cancels')
await imp(row('GL-AUDIT-AMOUNT', { refunded: 500 }))
ok((await state('GL-AUDIT-AMOUNT')).status === 'cancelled', 'a full refund by amount still cancels')

// ---- The email sender's save is retried, not counted as a failed send
let tries = 0
ok(await retry(async () => { if (++tries < 3) throw new Error('db blip'); return 'saved' }, [1, 1, 1]) === 'saved' && tries === 3, 'a save that fails twice is retried until it works')
tries = 0
ok(await retry(async () => { tries++; throw new Error('db down') }, [1, 1]).then(() => false, (e) => e.message === 'db down') && tries === 3, 'and gives up with the last error')

console.log(`audit fixes: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
