// Fixes from the Oct 12 audit, each set up with what the demo data lacks: a second gala, a deadline already
// passed, a partial refund. Runs with npm run test:backend. Invented data only.
import { counter, openTestDb } from './test-db.mjs'
import { deadlinePassed } from '../supabase/functions/_shared/emails.ts'
import { retry } from '../supabase/functions/_shared/retry.ts'
import { classify } from '../supabase/functions/_shared/givelively.ts'
import { CANCELLED_STATUS } from '../../import-engine/src/index.ts'
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
// Just after the gala (never marked live, not closed yet): it stays current for 30 days, then next year's takes over.
const { d: d2027 } = await one(`select event_date::text d from gala_events where id = 'ev-2027'`)
await db.exec(`insert into gala_events (id, year, name, event_date, guest_list_deadline, status) values ('ev-2028', 2028, 'AAFE Gala 2028 (test)', (now() at time zone 'America/New_York')::date + 360, (now() at time zone 'America/New_York')::date + 330, 'planning')`)
await db.exec(`update gala_events set event_date = (now() at time zone 'America/New_York')::date - 5 where id = 'ev-2027'`)
ok(await current() === 'ev-2027', "5 days after this year's gala, it's still current, not next year's in planning")
await db.exec(`update gala_events set event_date = (now() at time zone 'America/New_York')::date - 40 where id = 'ev-2027'`)
ok(await current() === 'ev-2028', "40 days after (and never closed), next year's gala becomes current")
await db.query(`update gala_events set event_date = $1 where id = 'ev-2027'`, [d2027]); await db.exec(`delete from gala_events where id = 'ev-2028'`)
ok(await current() === 'ev-2027', 'and back again')

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

// ---- One set of failure words: the CSV upload, the sync and gl_import agree (Cornell's #109 review)
const STATUSES = ['Failed', 'Declined', 'Cancelled', 'Voided', 'Reversed', 'ACH Returned', 'Payment failed', 'Succeeded', 'Completed', 'Pending', 'Partially Refunded']
const disagree = []
for (const [i, status] of STATUSES.entries()) {
  const csv = CANCELLED_STATUS.test(status)
  const sync = classify({ txn: 'GL-X', email: 'x@example.org', gross: 100, original: 100, campaign: 'AAFE Gala 2027', status }, ['AAFE Gala 2027']) === 'failed'
  await imp(row(`GL-WORDS-${i}`, { status }))
  const sql = (await state(`GL-WORDS-${i}`)).status === 'cancelled'
  if (csv !== sync || csv !== sql) disagree.push(`${status}: csv ${csv}, sync ${sync}, gl_import ${sql}`)
}
ok(disagree.length === 0, `the CSV upload, the sync and gl_import cancel on the same statuses ${disagree.join('; ')}`)
ok(CANCELLED_STATUS.test('Declined') && CANCELLED_STATUS.test('ACH Returned'), 'a declined or returned payment is cancelled by the CSV upload too')
// A full refund: the CSV path and gl_import cancel; the sync hands it to gl_import as an import (it isn't a failed payment).
for (const [i, status] of ['Refunded', 'Fully Refunded', 'Refund'].entries()) {
  const sync = classify({ txn: 'GL-X', email: 'x@example.org', gross: 100, original: 100, campaign: 'AAFE Gala 2027', status }, ['AAFE Gala 2027'])
  await imp(row(`GL-REFUND-${i}`, { status }))
  const sql = (await state(`GL-REFUND-${i}`)).status === 'cancelled'
  ok(CANCELLED_STATUS.test(status) && sql && sync === 'import', `"${status}": the CSV upload and gl_import cancel, the sync passes it to gl_import (classify says ${sync})`)
}

// ---- The email sender's save is retried, not counted as a failed send
let tries = 0
ok(await retry(async () => { if (++tries < 3) throw new Error('db blip'); return 'saved' }, [1, 1, 1]) === 'saved' && tries === 3, 'a save that fails twice is retried until it works')
tries = 0
ok(await retry(async () => { tries++; throw new Error('db down') }, [1, 1]).then(() => false, (e) => e.message === 'db down') && tries === 3, 'and gives up with the last error')

// ---- Saving a guest again in the portal (Oct 12 audit, Cornell): only a real change to the badge undoes staff's review
// Its own link: an earlier check in this file replaces Acme's.
const LINK = 'resave-test-link'
await db.query(`update orders set portal_token = hash_token($1), portal_token_expires_at = now() + interval '30 days' where id = 'ord-acme'`, [LINK])
const portalSave = async (slot, g) => (await as('anon', null, `select portal_save_guest($1, $2, $3) v`, [LINK, slot, g]))[0].v
const freeSlot = (await as('anon', null, `select portal_get_view($1) v`, [LINK]))[0].v.seats.find((x) => x.status === 'unnamed').slot
const guest = { first_name: 'Robin', last_name: 'Resave', title: 'Director', organization: 'Resave Partners', email: 'robin.resave@example.org', dietary_needs: '', accessibility_needs: '' }
await portalSave(freeSlot, guest)
const gid = (await one(`select g.id from guests g join seats s on s.guest_id = g.id join orders o on o.id = s.order_id where o.id = 'ord-acme' and s.slot_number = $1`, [freeSlot])).id
await db.query(`update seats set status = 'reviewed' where guest_id = $1`, [gid]); await db.query(`update guests set badge_status = 'printed' where id = $1`, [gid])
const stateOf = async () => one(`select g.badge_status b, s.status st, (select count(*)::int from audit_log a where a.entity_id = g.id) logs
  from guests g join seats s on s.guest_id = g.id where g.id = $1`, [gid])
const reviewed = await stateOf()
await portalSave(freeSlot, guest)
ok(JSON.stringify(await stateOf()) === JSON.stringify(reviewed), `saving the same guest again changes nothing: badge stays printed, seat stays reviewed, nothing logged (${JSON.stringify(await stateOf())})`)
await portalSave(freeSlot, { ...guest, title: ' Director ', dietary_needs: null })
ok(JSON.stringify(await stateOf()) === JSON.stringify(reviewed), 'blank and missing, or extra spaces, are not a change')
await portalSave(freeSlot, { ...guest, dietary_needs: 'Vegetarian' })
const afterFood = await stateOf()
ok(afterFood.b === 'printed' && afterFood.st === 'reviewed' && afterFood.logs === reviewed.logs + 1, `a food answer is saved and logged without undoing the review (${JSON.stringify(afterFood)})`)
ok((await one(`select dietary_needs d from guests where id = $1`, [gid])).d === 'Vegetarian', 'and the food answer is stored')
await portalSave(freeSlot, { ...guest, dietary_needs: 'Vegetarian', title: 'Executive Director' })
const afterTitle = await stateOf()
ok(afterTitle.b === 'reprint_needed' && afterTitle.st === 'submitted', `a new title on a printed badge needs a reprint and a new review (${JSON.stringify(afterTitle)})`)
await db.query(`update seats set status = 'reviewed' where guest_id = $1`, [gid]); await db.query(`update guests set badge_status = 'ready' where id = $1`, [gid])
await portalSave(freeSlot, { ...guest, dietary_needs: 'Vegetarian', title: 'Executive Director', organization: 'Resave Group' })
const afterOrg = await stateOf()
ok(afterOrg.b === 'needs_review' && afterOrg.st === 'submitted', 'a new organization on an unprinted badge goes back to review')
await as('anon', null, `select portal_release_seat($1, $2)`, [LINK, freeSlot])

console.log(`audit fixes: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
