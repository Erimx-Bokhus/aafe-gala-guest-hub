// Backend tests: loads schema.sql + seed.sql + backend.sql into in-memory Postgres (PGlite)
// with stand-ins for Supabase roles and auth.jwt(), then runs both apps' flows.  npm run test:backend
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { D, openTestDb } from './test-db.mjs'
const { db, as, err } = await openTestDb()
let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m) } }
const ADMIN = 'mei.ortiz@aafe-demo.example.org', RM = 'daniel.seo@aafe-demo.example.org'
const vol = (await db.query(`select email from staff_users where role='check_in_volunteer'`)).rows[0].email

// ---- Every foreign key has an index on its referencing columns (Oct 12 audit): without one, following it or
// deleting the row it points at reads the whole table. A new foreign key needs an index in backend.sql.
const unindexed = (await db.query(`
  select c.conrelid::regclass::text || ' (' || c.conname || ')' fk from pg_constraint c
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace
    and not exists (select 1 from pg_index i where i.indrelid = c.conrelid
                    and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] @> c.conkey
                    and c.conkey @> (i.indkey::int2[])[0:cardinality(c.conkey) - 1])
  order by 1`)).rows.map((r) => r.fk)
ok(unindexed.length === 0, `every foreign key has an index${unindexed.length ? ': missing ' + unindexed.join(', ') : ''}`)
ok((await db.query(`select 1 from pg_indexes where indexname = 'audit_log_order_id_idx'`)).rows.length === 1, "the portal's activity list has its index")

// ---- Guest portal
const v = (await as('anon', null, `select portal_get_view('ac-6w9k3p5d') v`))[0].v
ok(v.organization && v.seats.length > 0, 'portal view loads with seed token')
ok(!JSON.stringify(v).match(/transaction_fee|internal_notes|method|relationship_note|check_number/), 'portal view hides staff-only fields')
ok(await err('anon', null, `select portal_get_view('wrong-token')`) === 'invalid_link', 'bad token rejected')
// Oct 19 click-through: the refusal came back as HTTP 500. PostgREST answers a PT404 with 404.
ok(await db.query(`do $$ begin perform portal_get_view('wrong-token'); exception when sqlstate 'PT404' then null; end $$`).then(() => true, () => false),
  'a refused link is HTTP 404 (errcode PT404), not a server error')
ok((await err('anon', null, `select * from orders`))?.includes('permission') || (await as('anon', null, `select * from orders`)).length === 0, 'anon cannot read tables')
const slot = v.seats.find((s) => s.status === 'unnamed').slot
const v2 = (await as('anon', null, `select portal_save_guest('ac-6w9k3p5d', $1, $2) v`, [slot, { first_name: 'Test', last_name: 'Person', dietary_needs: 'vegan' }]))[0].v
ok(v2.seats.find((s) => s.slot === slot).status === 'submitted', 'guest saved -> submitted')
ok(v2.activity[0].summary.includes('Test Person added'), 'guest activity logged')
ok((await err('anon', null, `select portal_save_guest('ac-6w9k3p5d', $1, $2)`, [slot, { first_name: '' }]))?.startsWith('invalid_input'), 'empty name rejected')
const v3 = (await as('anon', null, `select portal_release_seat('ac-6w9k3p5d', $1) v`, [slot]))[0].v
ok(v3.seats.find((s) => s.slot === slot).status === 'unnamed', 'seat released')
// A guest with a QR invitation can still be removed: the unsent invitation is discarded (audit of Oct 8).
const v4 = (await as('anon', null, `select portal_save_guest('ac-6w9k3p5d', $1, $2) v`, [slot, { first_name: 'Invited', last_name: 'Guest', email: 'invited.guest@example.org' }]))[0].v
const invited = (await db.query(`select guest_id from seats s join orders o on o.id = s.order_id where s.slot_number = $1 and s.guest_id is not null and exists (select 1 from guests g where g.id = s.guest_id and g.last_name = 'Guest' and g.first_name = 'Invited')`, [slot])).rows[0].guest_id
const invite = (await as('authenticated', RM, `select staff_send_qr_invite($1) id`, [invited]))[0].id
ok(v4 && (await err('anon', null, `select portal_release_seat('ac-6w9k3p5d', $1)`, [slot])) === null, 'a guest with a QR invitation can be removed in the portal')
const invRow = (await db.query(`select status, guest_id from email_log where id = $1`, [invite])).rows[0]
ok(invRow.guest_id === null && (invRow.status === 'cancelled' || invRow.status === 'sent'), 'and the invitation is unlinked (discarded if unsent): ' + JSON.stringify(invRow))
// Whether a portal guest is a ticket holder comes from the tier's category, not its id (audit of Oct 8).
await db.exec(`insert into sponsorship_tiers (id, name, contribution_amount, included_seat_count, tier_category) values ('gala_seat', 'Gala Seat', 300, 1, 'ticket')`)
const acmeTier = (await db.query(`select tier_id from orders where id = 'ord-acme'`)).rows[0].tier_id
await db.query(`update orders set tier_id = 'gala_seat' where id = 'ord-acme'`)
await as('anon', null, `select portal_save_guest('ac-6w9k3p5d', $1, $2)`, [slot, { first_name: 'Ticket', last_name: 'Holder' }])
ok((await db.query(`select guest_type from guests where first_name = 'Ticket' and last_name = 'Holder'`)).rows[0]?.guest_type === 'ticket_holder', "a ticket tier's guest is a ticket holder whatever the tier is called")
await as('anon', null, `select portal_release_seat('ac-6w9k3p5d', $1)`, [slot])
await db.query(`update orders set tier_id = $1 where id = 'ord-acme'`, [acmeTier])
ok(await err('anon', null, `select staff_add_pledge('a','b','c','gold','check')`) !== null, 'anon cannot call staff functions')
ok(await err('anon', null, `select gl_import('[]', 'x')`) !== null, 'anon cannot call gl_import')

// ---- Staff
ok((await as('authenticated', ADMIN, `select staff_me() m`))[0].m.role === 'gala_admin', 'staff_me resolves role')
ok((await as('authenticated', RM, `select count(*)::int n from guests`))[0].n > 0, 'RM reads guests')
ok((await as('authenticated', vol, `select count(*)::int n from guests`))[0].n === 0, 'volunteer cannot read guests table')
ok((await as('authenticated', 'stranger@example.org', `select count(*)::int n from orders`))[0].n === 0, 'non-staff user reads nothing')
ok((await as('authenticated', vol, `select jsonb_array_length(checkin_list()) n`))[0].n > 0, 'volunteer gets check-in list')
ok((await err('authenticated', vol, `select staff_add_pledge('a','b','c@example.org','gold','check')`)) === 'forbidden', 'volunteer cannot add pledge')
ok((await err('authenticated', RM, `update audit_log set summary='x'`)) !== null || (await as('authenticated', RM, `select count(*)::int n from audit_log where summary='x'`))[0].n === 0, 'audit_log not updatable')
ok((await err('authenticated', RM, `insert into guests (id) values ('x')`)) !== null, 'no direct writes')

const ord = (await as('authenticated', RM, `select staff_add_pledge('Test Org','Pat Lee','pat@test.example.org','gold','check') id`))[0].id
const seats = (await db.query(`select count(*)::int n from seats where order_id=$1`, [ord])).rows[0].n
ok(seats === 10, 'pledge creates 10 gold seats')
ok((await db.query(`select count(*)::int n from email_log where order_id=$1 and status='queued' and template='portal_link'`, [ord])).rows[0].n === 1, 'pledge queues portal link')
await as('authenticated', RM, `select staff_record_payment($1,'check',10000,'2026-10-02','1234')`, [ord])
ok((await db.query(`select status from orders where id=$1`, [ord])).rows[0].status === 'partially_paid', 'partial payment status')
// A full Give Lively refund returns the covered fee too, so it's larger than the amount it cancels. It counts as 0, not
// as minus the fee: a sponsor who then pays the whole commitment by check is paid, not partly paid (as in #170).
const ord2 = (await as('authenticated', RM, `select staff_add_pledge('Refund Org','Sam Ito','sam@test.example.org','gold','check') id`))[0].id
await db.exec(`insert into payments select (jsonb_populate_record(null::payments, to_jsonb(p) || jsonb_build_object('id', 'pay-refunded-fee', 'order_id', '${ord2}',
  'original_amount', 1000, 'covered_fee_amount', 30, 'gross_amount', 1030, 'refunded_amount', 1030, 'net_amount', 0))).* from payments p limit 1`)
const c2 = (await db.query(`select commitment_amount::float c from orders where id=$1`, [ord2])).rows[0].c
await as('authenticated', RM, `select staff_record_payment($1, 'check', $2, '2026-10-03', '5002')`, [ord2, c2])
ok((await db.query(`select status from orders where id=$1`, [ord2])).rows[0].status === 'paid', 'a fully refunded payment counts 0, not minus its covered fee')

// Email: drafts never send until staff approve (hard rule 4)
const draft = (await db.query(`select id from email_log where order_id=$1 and status='queued' and template='portal_link'`, [ord])).rows[0].id
await as('service_role', null, `select email_mark_sent($1, hash_token('new-link-abc'))`, [draft])
ok((await db.query(`select status from email_log where id=$1`, [draft])).rows[0].status === 'queued', 'unapproved draft is not sent')
ok((await err('authenticated', vol, `select staff_approve_email($1)`, [draft])) === 'forbidden', 'volunteer cannot approve email')
await as('authenticated', RM, `select staff_approve_email($1)`, [draft])
await as('service_role', null, `select email_mark_sent($1, hash_token('new-link-abc'))`, [draft])
ok((await db.query(`select status from email_log where id=$1`, [draft])).rows[0].status === 'sent', 'approved draft is sent')
ok((await db.query(`select (portal_token_expires_at at time zone 'America/New_York')::text t from orders where id=$1`, [ord])).rows[0].t === '2027-04-24 00:00:00', 'link expires at end of guest-list deadline day')
ok((await as('anon', null, `select portal_get_view('new-link-abc')->>'organization' o`))[0].o === 'Test Org', 'minted link works after send')

// Guest -> staff review -> seat -> badge -> check-in
await as('anon', null, `select portal_save_guest('new-link-abc', 1, $1)`, [{ first_name: 'Ana', last_name: 'Diaz' }])
const gid = (await db.query(`select guest_id from seats where order_id=$1 and slot_number=1`, [ord])).rows[0].guest_id
// Change log keeps the old and new value of each edited field (staff only; the portal shows the summary).
const lastChanges = async (action) => (await db.query(`select changes from audit_log where entity_id=$1 and action=$2 order by id desc limit 1`, [gid, action])).rows[0].changes
ok((await lastChanges('guest.submitted')) === null, 'a new guest has no old values to log')
const editView = (await as('anon', null, `select portal_save_guest('new-link-abc', 1, $1) v`, [{ first_name: 'Ana', last_name: 'Diaz', title: 'Analyst', dietary_needs: 'vegetarian' }]))[0].v
const portalEdit = (await lastChanges('guest.updated')) ?? {}
ok(Object.keys(portalEdit).sort().join() === 'dietary_needs,title' && portalEdit.title?.from === null && portalEdit.title?.to === 'Analyst'
  && portalEdit.dietary_needs?.to === 'vegetarian', 'portal edit logs old and new values of the changed fields only')
ok(editView.activity.every((a) => Object.keys(a).sort().join() === 'action,at,summary'), 'portal activity never shows the old and new values')
ok((await db.query(`select count(*)::int n from pg_proc where proname = 'write_audit'`)).rows[0].n === 1, 'one write_audit after re-running backend.sql')
ok((await err('authenticated', RM, `select staff_set_seat_status($1,'badge_ready')`, [gid])) === "invalid_transition: this guest's status changed (now submitted); check the latest and try again",
  'cannot skip review, and the refusal says the status changed and what to do (Gate 3)')
await as('authenticated', RM, `select staff_set_seat_status($1,'reviewed')`, [gid])
// An admitted guest with no table gets a badge too (Oct 25: it prints without a table line).
const unseated = (await db.query(`select g.id from guests g join seats s on s.guest_id = g.id join orders o on o.id = g.order_id
  where s.status = 'reviewed' and g.table_id is null and o.status <> 'cancelled' order by g.id limit 1`)).rows[0]?.id
if (!unseated) throw new Error('the demo data has no reviewed guest without a table')
ok((await err('authenticated', RM, `select staff_set_seat_status($1,'badge_ready')`, [unseated])) === null
  && (await db.query(`select badge_status from guests where id = $1`, [unseated])).rows[0].badge_status === 'ready', 'badge_ready without a table')
const taken = (await db.query(`select table_id, seat_number from guests where table_id is not null limit 1`)).rows[0]
ok((await err('authenticated', RM, `select staff_assign_seat($1,$2,$3)`, [gid, taken.table_id, taken.seat_number])) === 'seat_taken', 'occupied seat rejected')
const n = (await as('authenticated', RM, `select staff_seat_order_at_table($1,'tb-11') n`, [ord]))[0].n
ok(n === 1, 'group seating seats the named guest')
await as('authenticated', RM, `select staff_set_seat_status($1,'badge_ready')`, [gid])
await as('authenticated', RM, `select staff_mark_printed(array[$1])`, [gid])
await as('authenticated', RM, `select staff_update_guest($1, $2)`, [gid, { title: 'Director', email: '' }])
ok((await db.query(`select badge_status from guests where id=$1`, [gid])).rows[0].badge_status === 'reprint_needed', 'title edit flags reprint')
const staffEdit = (await lastChanges('guest.updated')) ?? {}
ok(Object.keys(staffEdit).join() === 'title' && staffEdit.title?.from === 'Analyst' && staffEdit.title?.to === 'Director',
  'staff edit logs old and new values (a blank email that was already empty is not a change)')
ok((await as('authenticated', vol, `select staff_check_in($1) r`, [gid]))[0].r === true, 'volunteer checks guest in')
ok((await as('authenticated', vol, `select staff_check_in($1) r`, [gid]))[0].r === false, 'double check-in is a no-op')
ok((await err('anon', null, `select portal_release_seat('new-link-abc', 1)`))?.startsWith('seat_locked'), 'checked-in seat locked in portal')
const comp = (await as('authenticated', ADMIN, `select staff_add_comp_guest($1) id`, [{ first_name: 'Rep', last_name: 'Chen', email: 'rep@x.example.org', relationship_note: 'Council' }]))[0].id
// QR e-tickets (hard rule 6): minted only when the email sends, stored as a hash on the seat.
ok((await db.query(`select qr_token from guests where id=$1`, [comp])).rows[0].qr_token === null, 'no QR code stored on a new comp guest')
ok((await db.query(`select count(*)::int n from guests where qr_token is not null`)).rows[0].n === 0, 'seed QR codes moved off guests')
ok((await db.query(`select count(*)::int n from seats where qr_token_hash ~ '^[0-9a-f]{64}$'`)).rows[0].n === 8, 'seed QR codes kept only as hashes on seats')
// Stands in for send-emails: mint a code, email it, hand back its hash.
const newCode = () => 'AAFE-' + randomBytes(16).toString('hex').toUpperCase()
async function sendQr(guestId) {
  const id = (await as('authenticated', RM, `select staff_send_qr_invite($1) id`, [guestId]))[0].id
  const code = newCode()
  await as('service_role', null, `select email_mark_sent($1, hash_token($2))`, [id, code])
  return code
}
const checkInQr = (code) => as('authenticated', vol, `select staff_check_in_qr($1) r`, [code])
const q1 = await sendQr(comp), q2 = await sendQr(comp)
ok((await err('authenticated', vol, `select staff_check_in_qr($1)`, [q1]))?.startsWith('not_found'), 'resending replaces the old code')
ok((await db.query(`select (s.qr_token_expires_at = qr_expiry(o.event_id)) ok from seats s join orders o on o.id = s.order_id where s.guest_id=$1`, [comp])).rows[0].ok, 'code expires the morning after gala night')
ok((await checkInQr(q2.toLowerCase()))[0].r.first_name === 'Rep', 'QR check-in (any case)')
ok((await checkInQr(q2))[0].r.already_checked_in === true, 'second scan reports already checked in')
const ada = (await as('authenticated', ADMIN, `select staff_add_comp_guest($1) id`, [{ first_name: 'Ada', last_name: 'Lin', email: 'ada@x.example.org' }]))[0].id
const qa = await sendQr(ada)
await db.query(`update seats set qr_token_expires_at = now() - interval '1 minute' where guest_id=$1`, [ada])
ok((await err('authenticated', vol, `select staff_check_in_qr($1)`, [qa]))?.startsWith('expired'), 'expired code rejected')
const bo = (await as('authenticated', ADMIN, `select staff_add_comp_guest($1) id`, [{ first_name: 'Bo', last_name: 'Park', email: 'bo@x.example.org' }]))[0].id
const qb = await sendQr(bo)
await as('authenticated', RM, `select staff_update_guest($1, $2)`, [bo, { first_name: 'Bea' }])
ok((await err('authenticated', vol, `select staff_check_in_qr($1)`, [qb]))?.startsWith('not_found'), 'renaming the guest voids the code')
const qb2 = await sendQr(bo)
const boSeat = (await db.query(`select id from seats where guest_id=$1`, [bo])).rows[0].id
await db.query(`update seats set guest_id = null, status = 'unnamed' where id=$1`, [boSeat])
ok((await err('authenticated', vol, `select staff_check_in_qr($1)`, [qb2]))?.startsWith('not_found'), 'freeing the seat voids the code')
ok((await err('authenticated', vol, `select staff_check_in_qr($1)`, [newCode()]))?.startsWith('not_found'), 'unknown code rejected')
const inv = (await as('authenticated', RM, `select staff_send_qr_invite($1) id`, [comp]))[0].id
ok((await db.query(`select approved_by from email_log where id=$1`, [inv])).rows[0].approved_by === 'Daniel Seo', 'RM sending own QR invite counts as approval')
await as('authenticated', RM, `select staff_cancel_email($1)`, [inv])
ok((await db.query(`select status from email_log where id=$1`, [inv])).rows[0].status === 'cancelled', 'staff can discard an email')
await as('authenticated', vol, `select staff_check_in_exception('Walk In', null, 'walk_in', 'paid at door')`)

// ---- Give Lively import
const rows = [
  { txn: 'GL-T1', date: '2026-10-01T14:05:00Z', first: 'Grace', last: 'Yoon', email: 'grace@bp.example.org', company: 'Brightpath', campaign: 'AAFE Gala 2027', ticket_level: 'Bronze — Performance Sponsor', method: 'Credit Card', original: 10000, covered: 0, gross: 10000, fee: 220.3, net: 9779.7 },
  { txn: 'GL-T2', date: '2026-10-01T16:40:00Z', first: 'Luis', last: 'Romero', email: 'luis@x.example.org', company: '', campaign: 'AAFE Gala 2027', ticket_level: 'Community Ticket', method: 'Bank (ACH)', original: 500, covered: 4, gross: 504, fee: 4.03, net: 499.97 },
  { txn: 'GL-T3', date: '2026-10-02', first: 'Ama', last: 'B', email: 'ama@x.example.org', company: 'B & Co', ticket_level: 'Mystery Package', method: 'paypal', original: 300, gross: 300 },
]
let res = (await as('service_role', null, `select gl_import($1, 'Give Lively sync') r`, [JSON.stringify(rows)]))[0].r
ok(res.created === 2 && res.unknown_tier === 1 && res.review_items === 1, 'GL import creates 2; unknown package goes to review, not a default tier: ' + JSON.stringify(res))
ok((await db.query(`select count(*)::int n from orders where givelively_order_ref='GL-T3'`)).rows[0].n === 0, 'unknown package creates nothing')
res = (await as('service_role', null, `select gl_import($1, 'Give Lively sync') r`, [JSON.stringify(rows)]))[0].r
ok(res.created === 0 && res.skipped === 2 && res.unknown_tier === 1 && res.review_items === 0, 'GL import is idempotent; review not repeated: ' + JSON.stringify(res))
const t2 = (await db.query(`select o.commitment_amount::float c, (select count(*)::int from seats where order_id=o.id) s from orders o where givelively_order_ref='GL-T2'`)).rows[0]
ok(t2.s === 2 && t2.c === 500, '2 community tickets -> 2 seats')
ok((await db.query(`select transaction_fee_amount::float f from payments where givelively_transaction_id='GL-T1'`)).rows[0].f === 220.3, 'GL fee stored as reported')
res = (await as('service_role', null, `select gl_import($1, 'x') r`, [JSON.stringify([{ ...rows[0], refunded: 1000 }])]))[0].r
ok(res.updated === 1, 'refund updates existing payment')
ok((await err('authenticated', RM, `select staff_import_givelively('[]')`)) === 'forbidden', 'only admin imports CSV')
ok((await as('authenticated', ADMIN, `select staff_import_givelively('[]') r`))[0].r.created === 0, 'admin CSV import ok')

// Give Lively table purchase -> what the sponsor sees in the Guest Portal
await as('service_role', null, `select gl_import($1, 'Give Lively sync')`, [JSON.stringify([{ txn: 'GL-TABLE', date: '2026-10-03T15:00:00Z', first: 'Hana', last: 'Kim', email: 'hana@lotus.example.org', company: 'Lotus Bank', campaign: 'AAFE Gala 2027', ticket_level: 'Gold — Documentary Screening Sponsor', method: 'Credit Card', original: 25000, covered: 0, gross: 25000, fee: 550.3 }])])
const tOrd = (await db.query(`select id from orders where givelively_order_ref='GL-TABLE'`)).rows[0].id
await db.exec(`update email_log set approved_by='test', approved_at=now() where order_id='${tOrd}'`)
await as('service_role', null, `select email_mark_sent(id, hash_token('lotus-link')) from email_log where order_id=$1`, [tOrd])
const pv = (await as('anon', null, `select portal_get_view('lotus-link') v`))[0].v
ok(pv.organization === 'Lotus Bank' && pv.contactName === 'Hana Kim', 'portal shows sponsor from Give Lively')
ok(pv.tierName.startsWith('Gold') && pv.seats.length === 10 && pv.seats.every((s) => s.status === 'unnamed'), 'portal shows 10 empty table seats')
ok(pv.money.status === 'paid' && pv.money.paid === 25000 && pv.money.payments.length === 1, 'portal shows Give Lively payment as paid')
// The sponsor sees what the staff app counts (#170, shared/src/data.ts orderMoney): paid toward the commitment, less
// refunds, never below 0. Not the gross, which includes a fee the donor chose to cover.
await db.exec(`update payments set covered_fee_amount = 300, gross_amount = original_amount + 300, refunded_amount = 5000 where order_id = '${tOrd}'`)
const pr = (await as('anon', null, `select portal_get_view('lotus-link') v`))[0].v
ok(pr.money.paid === 20000 && pr.money.balance === pr.money.commitment - 20000 && pr.money.status === 'partial', `portal: paid is the amount toward the commitment less refunds, not the gross (${pr.money.paid})`)
await db.exec(`update payments set refunded_amount = original_amount + 300 where order_id = '${tOrd}'`)
const po = (await as('anon', null, `select portal_get_view('lotus-link') v`))[0].v
ok(po.money.paid === 0 && po.money.balance === po.money.commitment, `portal: a refund larger than the payment never makes paid negative (${po.money.paid})`)
await db.exec(`update payments set covered_fee_amount = 0, gross_amount = original_amount, refunded_amount = 0 where order_id = '${tOrd}'`)
ok(pv.activity.some((a) => a.summary.includes('Lotus Bank')), 'portal activity shows the purchase')

// ---- Import engine -> gl_import (docs/import-matching-spec.md, database test cases)
const { purchaseKey } = await import('../../import-engine/src/purchaseKey.ts')
const sqlKey = (await db.query(`select purchase_key(' Grace.Kim@Example.org ', '2027-02-05T22:14:46Z') k`)).rows[0].k
ok(sqlKey === await purchaseKey('grace.kim@example.org', '2027-02-05T22:14:46Z'), 'SQL purchase key matches the import engine')
const reviews = async (reason) => (await db.query(`select * from import_review where reason=$1 and status='open' order by created_at`, [reason])).rows
const csv = (over) => ({ date: '2027-02-05T22:14:46Z', first: 'Grace', last: 'Kim', email: 'grace.kim@example.org', company: '',
  campaign: "AAFE's 52nd Annual Gala", ticket_level: 'Ticket', method: 'Stripe Card', original: 1000, gross: 1000, refunded: 0, quantity: 1, seats: 1, ...over })
const upload = (rowsIn, run = {}) => as('authenticated', ADMIN, `select staff_import_givelively($1, $2) r`, [JSON.stringify(rowsIn), JSON.stringify({ file_name: 'export.csv', file_hash: 'h', ...run })]).then((x) => x[0].r)

// Cases 34-35: "Ticket" needs a tier mapping; mapping it resolves the review and the re-run creates the order.
res = await upload([csv({ guest_text: 'me', guests: [{ display_name: 'Grace Kim', email: 'grace.kim@example.org', is_buyer: true }] })])
ok(res.unknown_tier === 1 && res.created === 0 && (await reviews('unknown_tier')).some((v) => v.details.tier_purchased === 'Ticket'), 'case 35: unmapped "Ticket" goes to review')
ok((await err('authenticated', RM, `select staff_set_tier_mapping('Ticket', 'community_ticket')`)) === 'forbidden', 'only admin maps tiers')
await as('authenticated', ADMIN, `select staff_set_tier_mapping(' ticket ', 'community_ticket')`)
ok(!(await reviews('unknown_tier')).some((v) => v.details.tier_purchased === 'Ticket'), 'mapping resolves the open review')
res = await upload([csv({ guest_text: 'me', guests: [{ display_name: 'Grace Kim', email: 'grace.kim@example.org', is_buyer: true }] })])
ok(res.created === 1 && res.unknown_tier === 0 && res.names_prefilled === 1 && res.run_id, 'case 34 + 1: mapped tier imports; buyer seated: ' + JSON.stringify(res))
const g1 = (await db.query(`select o.id, o.tier_id, o.imported_guest_text t, g.display_name, g.last_updated_by u, s.status from payments p join orders o on o.id=p.order_id join seats s on s.order_id=o.id join guests g on g.id=s.guest_id where p.purchase_key=$1`, [sqlKey])).rows
ok(g1.length === 1 && g1[0].tier_id === 'community_ticket' && g1[0].t === 'me' && g1[0].display_name === 'Grace Kim' && g1[0].u === 'givelively_sync' && g1[0].status === 'submitted', 'pre-filled guest is "submitted", marked as from Give Lively')
ok((await db.query(`select status, counts from import_runs where id=$1`, [res.run_id])).rows[0].status === 'succeeded', 'import run recorded')
ok((await db.query(`select count(*)::int n from audit_log where action = 'guest.imported' and order_id = $1 and summary like 'Grace Kim added to seat 1 from the Give Lively guest list.'`, [g1[0].id])).rows[0].n === 1, 'the history says the pre-filled guest came from Give Lively (hard rule 7)')

// Case 3: same file twice changes nothing.
res = await upload([csv({ guest_text: 'me', guests: [{ display_name: 'Grace Kim', email: 'grace.kim@example.org', is_buyer: true }] })])
ok(res.created === 0 && res.updated === 0 && res.skipped === 1 && res.review_items === 0, 'case 3: re-import changes nothing')

// Case 21: a staff correction survives the next import.
await as('authenticated', RM, `select staff_update_guest($1, $2)`, [(await db.query(`select guest_id from seats where order_id=$1`, [g1[0].id])).rows[0].guest_id, { title: 'Dr.' }])
await upload([csv({ guest_text: 'me', guests: [{ display_name: 'Grace Kim', email: 'grace.kim@example.org', is_buyer: true }] })])
ok((await db.query(`select title from guests where order_id=$1`, [g1[0].id])).rows[0].title === 'Dr.', 'case 21: staff edit survives re-import')

// Cases 20 + 32: the guest list changed in Give Lively after names exist -> review, nothing overwritten.
res = await upload([csv({ guest_text: 'Sam Lee', guests: [{ display_name: 'Sam Lee', email: null }] })])
ok(res.review_items === 1 && (await reviews('guest_text_changed')).some((v) => v.details.old_text === 'me' && v.details.new_text === 'Sam Lee'), 'case 20: changed guest list goes to review')
ok((await db.query(`select display_name from guests where order_id=$1`, [g1[0].id])).rows[0].display_name === 'Grace Kim', 'case 32: existing names kept')
res = await upload([csv({ guest_text: 'Sam Lee', guests: [{ display_name: 'Sam Lee', email: null }] })])
ok(res.review_items === 0, 'the same change is not reviewed twice')

// Names arriving later on an order nobody has named yet are filled (first upload that names them).
const later = { date: '2027-02-06T15:00:00Z', email: 'ana.ruiz@example.org', first: 'Ana', last: 'Ruiz', ticket_level: 'Ticket', seats: 2, quantity: 2, original: 1000, gross: 1000 }
await upload([csv({ ...later, guest_text: 'TBD', guests: [] })])
res = await upload([csv({ ...later, guest_text: 'Jane Doe\nSam Park', guests: [{ display_name: 'Jane Doe' }, { display_name: 'Sam Park' }] })])
ok(res.names_prefilled === 2 && res.review_items === 0, 'names arriving after "TBD" fill the unnamed seats')

// Case 18: full refund cancels order and seats, raises review; nothing deleted.
const refundRow = csv({ date: '2027-02-07T15:00:00Z', email: 'bo.han@example.org', first: 'Bo', last: 'Han', guest_text: '' })
await upload([refundRow])
res = await upload([{ ...refundRow, refunded: 1000, status: 'refunded' }])
const ro = (await db.query(`select o.status, (select array_agg(distinct status) from seats where order_id=o.id) s from payments p join orders o on o.id=p.order_id where p.purchase_key=(select purchase_key('bo.han@example.org','2027-02-07T15:00:00Z'))`)).rows[0]
ok(ro.status === 'cancelled' && ro.s.length === 1 && ro.s[0] === 'cancelled' && (await reviews('refund')).length >= 1, 'case 18: refund cancels order and seats, review raised')

// Audit of Oct 8: an order that arrives already refunded is logged as cancelled...
await upload([csv({ date: '2027-02-07T16:00:00Z', email: 'al.ready@example.org', first: 'Al', last: 'Ready', guest_text: '', refunded: 1000, status: 'refunded' })])
ok((await db.query(`select count(*)::int n from audit_log a join payments p on p.order_id = a.order_id where a.action = 'order.cancelled'
                    and p.purchase_key = (select purchase_key('al.ready@example.org', '2027-02-07T16:00:00Z'))`)).rows[0].n === 1, 'an order that arrives already refunded is logged as cancelled')
// ...and a partial Give Lively refund counts the checks staff recorded on the same order.
const mixRow = csv({ date: '2027-02-07T17:00:00Z', email: 'mia.fold@example.org', first: 'Mia', last: 'Fold', guest_text: '' })
await upload([mixRow])
const mixOrder = (await db.query(`select order_id from payments where purchase_key = (select purchase_key('mia.fold@example.org', '2027-02-07T17:00:00Z'))`)).rows[0].order_id
await db.query(`update orders set commitment_amount = 1000 where id = $1`, [mixOrder])
await as('authenticated', RM, `select staff_record_payment($1, 'check', 100, current_date, '5001')`, [mixOrder])
await upload([{ ...mixRow, refunded: 100 }])
ok((await db.query(`select status from orders where id = $1`, [mixOrder])).rows[0].status === 'paid', 'a partial Give Lively refund still counts the check staff recorded')

// Case 14: shared inbox -> new sponsor + review.
await upload([csv({ date: '2027-02-08T15:00:00Z', email: 'grace.kim@example.org', first: 'Mark', last: 'Lee' })])
ok((await reviews('email_name_conflict')).some((v) => v.details.buyer === 'Mark Lee'), 'case 14: same email, different last name -> review')
ok((await db.query(`select count(*)::int n from sponsors where lower(primary_contact_email)='grace.kim@example.org'`)).rows[0].n === 2, 'case 14: a new sponsor so the order is not lost')

// Engine findings and missing purchases arrive with the upload.
res = await upload([csv({ date: '2027-02-09T15:00:00Z', email: 'cy.wu@example.org', first: 'Cy', last: 'Wu',
  guest_text: 'Susan Cho', guests: [{ display_name: 'Susan Cho' }], findings: [{ reason: 'possible_duplicate', details: { guest: 'Susan Cho', existing_guest_id: 'g-x' } }] })],
  { missing: [{ purchase_key: sqlKey, purchased_at: '2027-02-05T22:14:46Z' }] })
ok((await reviews('possible_duplicate')).length === 1 && (await reviews('missing_from_source')).length === 1 && res.missing_from_source === 1, 'case 22: engine findings and missing purchases become reviews')
ok((await db.query(`select status from orders o join payments p on p.order_id=o.id where p.purchase_key=$1`, [sqlKey])).rows[0].status !== 'cancelled', 'case 22: nothing cancelled automatically')

// Case 24: a failing upload applies nothing.
const before = (await db.query(`select count(*)::int n from orders`)).rows[0].n
ok((await err('authenticated', ADMIN, `select staff_import_givelively($1)`, [JSON.stringify([csv({ date: '2027-02-10T15:00:00Z', email: 'ok@example.org' }), csv({ date: '2027-02-10T16:00:00Z', email: 'bad@example.org', tier_id: 'no_such_tier', seats: 'x' })])])) !== null, 'case 24: bad row fails the upload')
ok((await db.query(`select count(*)::int n from orders`)).rows[0].n === before, 'case 24: nothing applied from a failed upload')

// Case 36: changing a mapping doesn't rewrite imported orders.
await as('authenticated', ADMIN, `select staff_set_tier_mapping('Ticket', 'gold')`)
ok((await db.query(`select tier_id from orders where id=$1`, [g1[0].id])).rows[0].tier_id === 'community_ticket', 'case 36: existing orders keep their tier')
ok((await db.query(`select count(*)::int n from audit_log where action='tier_mapping.set' and from_state='community_ticket'`)).rows[0].n === 1, 'case 36: mapping change logged')

// End to end: a CSV in the real export's format -> import engine (parse, split, match) -> staff_import_givelively.
{
  const { prepareUpload, toGlImport } = await import('../../import-engine/src/index.ts')
  const csvText = [
    'First Name,Last Name,Email,Tier Purchased,Tier Category,Tickets Purchased,Total Seats,Amount Spent,Amount Refunded,Transaction Fee Covered,Date/Time of Purchase,Payment Method,Status,Page Name,Company/Organization Name,Phone Number,"Please list the name(s) and email address(es) of all guests. To revise, email gala@aafe.org."',
    'Dana,Choi,dana.choi@example.org,Champion Sponsor,Sponsorship,1,6,"$7,500.00 ",$0.00,$0.00,2027-03-01 10:15:00 AM EST,Stripe Card,succeeded,AAFE\'s 52nd Annual Gala,Harbor Health,(212) 555-0150,"Jane Doe jane@example.org\nSam Lee\nBob"',
    'Eli,Park,eli.park@example.org,Ticket,Ticket,1,1,"$1,000.00 ",$0.00,$0.00,2027-03-02 07:00:00 PM EST,Stripe Card,succeeded,Year-End Appeal,,,',
  ].join('\n')
  const q = async (sql) => (await db.query(sql)).rows
  const prepared = await prepareUpload(csvText, {
    galaPageName: (await q(`select givelively_page_name p from gala_events where id=current_event_id()`))[0].p ?? "AAFE's 52nd Annual Gala",
    tiers: (await q(`select id, name, tier_category, included_seat_count from sponsorship_tiers`)).map((t) => ({ id: t.id, name: t.name, tierCategory: t.tier_category, includedSeatCount: t.included_seat_count })),
    tierMappings: (await q(`select givelively_name, tier_id from tier_mappings where event_id=current_event_id()`)).map((m) => ({ givelivelyName: m.givelively_name, tierId: m.tier_id })),
    sponsors: (await q(`select id, organization_name, primary_contact_name, primary_contact_email from sponsors`)).map((x) => ({ id: x.id, organizationName: x.organization_name, primaryContactName: x.primary_contact_name, primaryContactEmail: x.primary_contact_email })),
    existingGuests: (await q(`select g.id, g.order_id, coalesce(g.display_name, g.first_name || ' ' || g.last_name) n, g.email, g.organization from guests g join orders o on o.id=g.order_id where o.event_id=current_event_id()`)).map((x) => ({ id: x.id, orderId: x.order_id, displayName: x.n, email: x.email, organization: x.organization })),
    previousPurchases: [],
  })
  ok(prepared.rows.length === 1 && prepared.report.skippedOtherPage.length === 1, 'e2e: other Give Lively page skipped')
  const { rows: glRows, run } = await toGlImport(prepared, 'aafe-export.csv', csvText)
  res = await upload(glRows, run)
  const dana = (await q(`select o.tier_id, o.imported_guest_text t, (select count(*)::int from seats where order_id=o.id) seats,
    (select array_agg(g.display_name order by s.slot_number) from seats s join guests g on g.id=s.guest_id where s.order_id=o.id) names
    from orders o join sponsors sp on sp.id=o.sponsor_id where sp.primary_contact_email='dana.choi@example.org'`))[0]
  ok(dana.tier_id === 'champion' && dana.seats === 6, 'e2e: Champion sponsorship with 6 seats: ' + JSON.stringify(dana))
  ok(JSON.stringify(dana.names) === JSON.stringify(['Jane Doe', 'Sam Lee']), 'e2e: clear names pre-filled, "Bob" left for the sponsor')
  ok((await q(`select count(*)::int n from sponsors where phone like '%555-0150%'`))[0].n === 0, 'e2e: phone never imported')
  ok((await q(`select file_name, file_hash from import_runs where id='${res.run_id}'`))[0].file_hash === run.file_hash, 'e2e: run records the file')
}

// Gala page name and review resolution.
await as('authenticated', ADMIN, `select staff_set_gala_page($1)`, ["AAFE's 52nd Annual Gala"])
ok((await db.query(`select givelively_page_name p from gala_events where id=current_event_id()`)).rows[0].p === "AAFE's 52nd Annual Gala", 'gala page name saved')
const rv = (await reviews('possible_duplicate'))[0].id
await as('authenticated', RM, `select staff_resolve_import_review($1, 'Different person')`, [rv])
ok((await db.query(`select status, resolved_by from import_review where id=$1`, [rv])).rows[0].resolved_by === 'Daniel Seo', 'staff resolve a review item')
ok((await as('authenticated', vol, `select count(*)::int n from import_review`))[0].n === 0, 'volunteers cannot read the review queue')

// Views respect RLS
ok((await as('authenticated', vol, `select count(*)::int n from v_fee_totals`))[0].n === 0, 'fee view hidden from volunteer')
ok((await as('authenticated', ADMIN, `select count(*)::int n from v_fee_totals`))[0].n > 0, 'fee view visible to admin')
// ---- DEMO: fake Give Lively feed -> same mapping code the sync uses -> import -> Guest Portal
const { normalize, classify } = await import('../supabase/functions/_shared/givelively.ts')
await db.exec(readFileSync(D + 'demo_givelively.sql', 'utf8'))
await db.exec(readFileSync(D + 'demo_givelively.sql', 'utf8')) // re-run must not duplicate
const feed = (await db.query(`select payload from demo_givelively_donations order by modified_at desc`)).rows.map((r) => r.payload)
ok(feed.length === 4, 'fake feed has 4 starting donations')
const verdicts = feed.map((p) => classify(normalize(p), ['AAFE Gala 2027']))
ok(verdicts.filter((x) => x === 'import').length === 3 && verdicts.includes('not_gala'), 'sync imports 3 gala purchases, ignores the appeal: ' + verdicts)
const toImport = feed.map(normalize).filter((r) => classify(r, ['AAFE Gala 2027']) === 'import')
res = (await as('service_role', null, `select gl_import($1, 'Give Lively sync') r`, [JSON.stringify(toImport)]))[0].r
ok(res.created === 3 && res.needs_review === 0, 'fake purchases import cleanly: ' + JSON.stringify(res))
const lotus = (await db.query(`select o.id from orders o join sponsors s on s.id=o.sponsor_id where s.primary_contact_email='hana.kim@lotusbank.example.org' and o.source='givelively'`)).rows[0].id
await db.exec(`update email_log set approved_by='test', approved_at=now() where order_id='${lotus}'`)
await as('service_role', null, `select email_mark_sent(id, hash_token('demo-lotus')) from email_log where order_id=$1`, [lotus])
const lv = (await as('anon', null, `select portal_get_view('demo-lotus') v`))[0].v
ok(lv.organization === 'Lotus Community Bank (synthetic)' && lv.seats.length === 10 && lv.money.status === 'paid', 'Guest Portal shows the fake Gold table')
const sofia = (await db.query(`select (select count(*)::int from seats where order_id=o.id) n, (select covered_fee_amount::float from payments where order_id=o.id) c from orders o join sponsors s on s.id=o.sponsor_id where s.primary_contact_email='sofia.reyes@mail.example.org'`)).rows[0]
ok(sofia.n === 2 && sofia.c > 0, '2 community tickets, donor-covered fee kept')
const live = (await as('service_role', null, `select demo_givelively_purchase('Live Demo Co', 'Ana', 'Lopez', 'ana@live.example.org', 'Platinum — Lead Sponsor', 50000) p`))[0].p
ok(classify(normalize(live), ['AAFE Gala 2027']) === 'import' && normalize(live).fee === 1100.3, 'staged live purchase maps with Stripe fee')

// Supabase advisor cleanup: trigger functions aren't API-callable, helpers pin search_path,
// and admin writes don't overlap staff_read on SELECT.
for (const f of ['seats_void_qr()', 'guests_void_qr()'])
  ok(!(await db.query(`select has_function_privilege('anon', $1, 'execute') e`, [f])).rows[0].e, `anon cannot execute ${f}`)
const unpinned = (await db.query(`select count(*)::int n from pg_proc where pronamespace = 'public'::regnamespace
  and proname in ('hash_token','new_id','new_qr_token','seats_void_qr','money_fmt','purchase_key','name_key')
  and not coalesce(proconfig, '{}') @> array['search_path=public']`)).rows[0].n
ok(unpinned === 0, 'helper functions pin search_path')
const qrs = (await db.query(`select new_qr_token() t from generate_series(1, 400)`)).rows.map((r) => r.t.slice(5))
ok(qrs.every((t) => /^[0-9A-F]{32}$/.test(t)) && new Set(qrs).size === 400, 'new_qr_token: AAFE- plus 32 hex characters, all different')
ok([...Array(32).keys()].every((i) => new Set(qrs.map((t) => t[i])).size > 4), 'new_qr_token: no fixed characters (all 128 bits random, unlike a raw UUID)')
ok((await db.query(`select count(*)::int n from pg_policies where schemaname = 'public' and cmd = 'ALL'`)).rows[0].n === 0, 'no FOR ALL policies overlap staff_read')

// ---- Exports: badge mail merge, printed check-in list, Salesforce attendee file
const cur = `(select id from gala_events where status <> 'closed' order by year desc limit 1)`
for (const f of ['staff_export_badges(boolean)', 'staff_export_checkin()', 'staff_export_salesforce()'])
  ok(!(await db.query(`select has_function_privilege('anon', $1, 'execute') e`, [f])).rows[0].e, `anon cannot execute ${f}`)

await db.query(`update guests set badge_status = 'ready' where id = (select g.id from guests g join orders o on o.id = g.order_id
  where g.table_id is null and o.event_id = ${cur} and o.status <> 'cancelled' order by g.id limit 1)`)   // an admitted guest, no table
const badges = await as('authenticated', RM, `select * from staff_export_badges()`)
const expectBadges = (await db.query(`select count(*)::int n from guests g join orders o on o.id = g.order_id
  where o.event_id = ${cur} and o.status <> 'cancelled' and g.badge_status in ('ready','reprint_needed')`)).rows[0].n
ok(badges.length === expectBadges && badges.length > 0, `badge file has every ready or reprint badge (${badges.length})`)
ok(Object.keys(badges[0]).join() === 'display_name,first_name,last_name,title,organization,table_number,seat_number,sponsor,guest_type,badge_status',
  'badge file carries only badge fields (no email, dietary, payment, notes)')
const tables = badges.map(b => b.table_number).filter(n => n !== null)
const firstUnseated = badges.findIndex(b => b.table_number === null)
ok(tables.every((n, i) => i === 0 || tables[i - 1] <= n) && (firstUnseated === -1 || firstUnseated >= tables.length),
  `badge file sorted by table, unseated guests last (${badges.length - tables.length} unseated)`)
ok(badges.every(b => (b.guest_type === 'sponsor_guest') === (b.sponsor !== null)), 'sponsor line only on sponsor guests')
ok((await as('authenticated', RM, `select count(*)::int n from staff_export_badges(true)`))[0].n >= badges.length, 'including printed badges adds rows')
ok((await err('authenticated', vol, `select * from staff_export_badges()`))?.includes('forbidden'), 'volunteer cannot export badges')

const sheet = await as('authenticated', vol, `select * from staff_export_checkin()`)
const named = (await db.query(`select count(*)::int n from guests g join orders o on o.id = g.order_id
  where o.event_id = ${cur} and o.status <> 'cancelled'`)).rows[0].n
const open = (await db.query(`select count(*)::int n from seats s join orders o on o.id = s.order_id
  where o.event_id = ${cur} and o.status <> 'cancelled' and s.guest_id is null and s.status <> 'cancelled'`)).rows[0].n
ok(sheet.length === named + open && open > 0, `check-in list: ${named} guests plus ${open} unnamed sponsor seats (volunteer may export)`)
ok(!('email' in sheet[0]) && !('dietary_needs' in sheet[0]), 'check-in list has no email or dietary needs')
ok(sheet.findIndex(r => r.guest_type === 'unnamed_seat') === named, 'named guests first, unnamed seats after')
ok(sheet.filter(r => r.arrived).length === (await db.query(`select count(*)::int n from guests g join orders o on o.id = g.order_id
  where o.event_id = ${cur} and o.status <> 'cancelled' and g.attendance_status = 'checked_in'`)).rows[0].n, 'check-in list marks who arrived')

ok((await err('authenticated', RM, `select * from staff_export_salesforce()`))?.includes('forbidden'), 'relationship manager cannot export the Salesforce file')
ok((await err('authenticated', vol, `select * from staff_export_salesforce()`))?.includes('forbidden'), 'volunteer cannot export the Salesforce file')
const sf = await as('authenticated', ADMIN, `select * from staff_export_salesforce()`)
const arrivals = (await db.query(`select count(*)::int n from check_ins where event_id = ${cur}`)).rows[0].n
ok(sf.length === arrivals && sf.length > 0, `Salesforce file has one row per arrival, walk-ins included (${sf.length})`)
ok('email' in sf[0] && sf.every(r => r.checked_in_at), 'Salesforce file carries email and arrival time')

const logged = (await db.query(`select action, count(*)::int n from audit_log where action like 'export.%' group by action`)).rows
ok(['export.badges', 'export.checkin', 'export.salesforce'].every(a => logged.some(l => l.action === a)), 'every export is written to the activity log')

// ---- Sign-in by email domain (Oct 21): anyone at a listed domain joins on first sign-in, until the domain's date;
// Supabase Auth's sign-up hook turns away a new login for anyone else.
const hook = async (email) => (await as('supabase_auth_admin', null, `select hook_staff_signup($1) r`, [{ user: { email } }]))[0].r
const NEW = 'new.person@team.example.org'
ok((await as('authenticated', NEW, `select staff_me() m`))[0].m === null, 'with no domain listed, an unknown email is not staff')
ok((await hook(NEW)).error?.http_code === 403, 'and the sign-up hook refuses its login')
ok(Object.keys(await hook(ADMIN)).length === 0, 'the sign-up hook lets in an email on the staff list')
await db.query(`insert into staff_join_domains values ('team.example.org', 'relationship_manager', now() + interval '30 days'),
  ('client.example.org', 'relationship_manager', now() + interval '30 days')`)
ok(Object.keys(await hook('Someone@Team.Example.org')).length === 0, 'the sign-up hook lets in a listed domain, whatever the case')
for (const e of ['a@evil.team.example.org', 'a@team.example.org.evil.example', 'a@other.example.org', 'team.example.org', ''])
  ok((await hook(e)).error?.http_code === 403, `the sign-up hook refuses "${e}"`)
const joined = (await as('authenticated', NEW, `select staff_me() m`))[0].m
ok(joined?.role === 'relationship_manager' && joined.id.startsWith('st-join-') && joined.name === 'New Person' && joined.access_until,
  'a listed domain joins on first sign-in, with its role and date: ' + JSON.stringify(joined))
await as('authenticated', NEW, `select staff_me() m`)
ok((await db.query(`select count(*)::int n from audit_log where action = 'staff.joined' and entity_id = $1`, [joined.id])).rows[0].n === 1,
  'the join is in the activity log once, however often staff_me runs')
ok((await as('authenticated', NEW, `select count(*)::int n from guests`))[0].n > 0, 'a joined relationship manager reads guests')
ok((await as('authenticated', ADMIN, `select staff_me() m`))[0].m.role === 'gala_admin', 'named staff keep their row and role')
await db.query(`insert into staff_users (id, name, email, role) values ('st-boss', 'Boss', 'boss@client.example.org', 'gala_admin')`)
ok((await as('authenticated', 'boss@client.example.org', `select staff_me() m`))[0].m.role === 'gala_admin', 'a named admin at a listed domain stays admin')
ok((await err('authenticated', ADMIN, `select hook_staff_signup('{}')`)) !== null && (await err('anon', null, `select hook_staff_signup('{}')`)) !== null,
  'only Supabase Auth can call the sign-up hook')
ok((await db.query(`select n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where p.proname = 'hook_staff_signup'`)).rows
  .map((r) => r.nspname).join() === 'public', 'the sign-up hook stays in public, where Auth Hooks finds it')
ok((await as('authenticated', ADMIN, `select count(*)::int n from staff_join_domains`).catch(() => [{ n: 0 }]))[0].n === 0, 'no API role reads the domain list')
// After the date: the joined row stops working at once; a later date lets them back in with the role staff last set.
await db.query(`update staff_join_domains set until = now() - interval '1 minute'`)
await db.query(`update staff_users set access_until = now() - interval '1 minute' where id = $1`, [joined.id])
ok((await as('authenticated', NEW, `select staff_me() m`))[0].m === null, 'after the date, a joined person is no longer staff')
ok((await as('authenticated', NEW, `select count(*)::int n from guests`))[0].n === 0, 'and reads nothing')
ok((await hook('another@team.example.org')).error?.http_code === 403, 'and nobody new from the domain gets a login')
await db.query(`update staff_users set role = 'check_in_volunteer' where id = $1`, [joined.id])
await db.query(`update staff_join_domains set until = now() + interval '7 days'`)
const back = (await as('authenticated', NEW, `select staff_me() m`))[0].m
ok(back?.role === 'check_in_volunteer' && new Date(back.access_until) > new Date(), 'a later date lets them back in, with the role staff last set')
await db.exec(`delete from staff_join_domains; delete from staff_users where id = 'st-boss'`)

// ---- Input checks (#224, Cornell's review of Oct 21): emails, the portal's length caps on staff edits, payment dates.
const nyPlus = async (n) => (await db.query(`select ((now() at time zone 'America/New_York')::date + $1::int)::text d`, [n])).rows[0].d
const NOT_EMAIL = (v) => `invalid_input: "${v}" isn't an email address`
// A payment needs the day it arrived; a few days ahead is fine, a year typed wrong isn't.
ok(await err('authenticated', RM, `select staff_record_payment('ord-acme', 'check', 10, null, '7001')`) === 'invalid_input: enter the day the payment arrived',
  'a payment with no date is refused in plain words, not the database\'s')
ok((await err('authenticated', RM, `select staff_record_payment('ord-acme', 'check', 10, $1::date, '7002')`, [await nyPlus(4)]))?.endsWith('is more than 3 days ahead; enter the day the payment arrived'),
  'a payment dated 4 days ahead is refused')
ok(await err('authenticated', RM, `select staff_record_payment('ord-acme', 'check', 10, '2031-01-01', '7003')`) === 'invalid_input: January 1, 2031 is more than 3 days ahead; enter the day the payment arrived',
  'a year typed wrong is refused, with the date in words')
ok(await err('authenticated', RM, `select staff_record_payment('ord-acme', 'check', 10, $1::date, '7004')`, [await nyPlus(3)]) === null,
  'a payment dated 3 days ahead is recorded (a check deposited after the weekend)')
// Emails: checked when one is given or changed, wherever staff or the portal store one.
const gst = (await db.query(`select g.id from guests g join orders o on o.id = g.order_id where o.event_id = current_event_id() and o.status <> 'cancelled'
  and g.guest_type = 'sponsor_guest' order by g.id limit 1`)).rows[0].id
ok(await err('authenticated', RM, `select staff_update_guest($1, $2)`, [gst, { email: 'nope' }]) === NOT_EMAIL('nope'), 'a staff edit refuses an email that isn\'t one')
ok(await err('authenticated', RM, `select staff_update_guest($1, $2)`, [gst, { email: 'fixed.guest@example.org ' }]) === null
  && (await db.query(`select email from guests where id = $1`, [gst])).rows[0].email === 'fixed.guest@example.org', 'and takes a real one, with a space typed after it trimmed')
await db.query(`update guests set email = 'imported badly' where id = $1`, [gst])
ok(await err('authenticated', RM, `select staff_update_guest($1, $2)`, [gst, { title: 'Director' }]) === null, 'an email an import stored earlier doesn\'t block other edits')
const long = 'x'.repeat(5000)
await as('authenticated', RM, `select staff_update_guest($1, $2)`, [gst, { last_name: long, title: long, organization: long }])
const capped = (await db.query(`select length(last_name) l, length(title) t, length(organization) o from guests where id = $1`, [gst])).rows[0]
ok(capped.l === 100 && capped.t === 200 && capped.o === 200, `a staff edit keeps the portal's length caps (5,000 characters in): ${JSON.stringify(capped)}`)
ok(await err('authenticated', RM, `select staff_add_comp_guest($1)`, [{ first_name: 'Dana', last_name: 'Example', email: 'nope' }]) === NOT_EMAIL('nope'),
  'a comp guest\'s email is checked')
const comp224 = (await as('authenticated', RM, `select staff_add_comp_guest($1) id`, [{ first_name: 'Dana', last_name: long, title: long, email: 'dana.example@example.org' }]))[0].id
const cc = (await db.query(`select length(last_name) l, length(title) t from guests where id = $1`, [comp224])).rows[0]
ok(cc.l === 100 && cc.t === 200, `a comp guest keeps the portal's length caps: ${JSON.stringify(cc)}`)
const lvl = (await db.query(`select id from sponsorship_tiers where event_id = current_event_id() and not retired and tier_category = 'sponsorship' order by id limit 1`)).rows[0].id
ok(await err('authenticated', RM, `select staff_add_pledge('Example Pledge Co', 'Sam Lee', 'sam at example', $1, 'check')`, [lvl]) === NOT_EMAIL('sam at example'),
  'a pledge\'s contact email is checked')
const free = (await as('anon', null, `select portal_get_view('ac-6w9k3p5d') v`))[0].v.seats.find((x) => x.status === 'unnamed')
ok(free && await err('anon', null, `select portal_save_guest('ac-6w9k3p5d', $1, $2)`, [free.slot, { first_name: 'Pat', last_name: 'Example', email: 'nope' }]) === NOT_EMAIL('nope'),
  'the portal\'s save checks the email too, not only its form')

// ---- New pledge's amount (AAFE's Oct 20 walk-through, item 1): left out, the level's price; typed by staff, kept for a
// donation or a different gift, and logged. Stable and nightly had a 5-argument version: backend.sql must replace it,
// not add a second one, or every call without an amount would be refused as ambiguous.
const goldPrice = Number((await db.query(`select contribution_amount from sponsorship_tiers where id = 'gold'`)).rows[0].contribution_amount)
const amountOf = async (id) => Number((await db.query(`select commitment_amount from orders where id = $1`, [id])).rows[0].commitment_amount)
const atLevel = (await as('authenticated', RM, `select staff_add_pledge('Level Price Co', 'Ana Ruiz', 'ana@level.example.org', 'gold', 'check') id`))[0].id
ok(await amountOf(atLevel) === goldPrice, "a pledge without an amount takes the level's price")
const gift = (await as('authenticated', RM, `select staff_add_pledge('Gift Example Fund', 'Bo Han', 'bo@gift.example.org', 'gold', 'wire', 2000.004) id`))[0].id
ok(await amountOf(gift) === 2000, 'an amount typed by staff is kept, to the cent')
ok((await db.query(`select summary from audit_log where entity_id = $1 and action = 'order.created'`, [gift])).rows[0].summary.endsWith(', $2,000.00.'),
  "the change log names the amount when it isn't the level's")
ok((await err('authenticated', RM, `select staff_add_pledge('Zero Example Co', 'Cy Lo', 'cy@zero.example.org', 'gold', 'check', 0)`))?.startsWith('invalid_input'), 'an amount of $0 is refused')
ok((await err('authenticated', RM, `select staff_add_pledge('Huge Example Co', 'Di Wu', 'di@huge.example.org', 'gold', 'check', 10000000.01)`))?.startsWith('invalid_input'),
  'an amount over $10,000,000 is refused')
await db.exec(`create function private.staff_add_pledge(p_org text, p_contact text, p_email text, p_tier_id text, p_source text) returns text language sql as $$ select 'old' $$;
  create function public.staff_add_pledge(p_org text, p_contact text, p_email text, p_tier_id text, p_source text) returns text language sql as $$ select 'old wrapper' $$`)
await db.exec(readFileSync(D + 'backend.sql', 'utf8'))
const versions = (await db.query(`select n.nspname s, count(*)::int c from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'staff_add_pledge' group by 1 order by 1`)).rows.map((r) => `${r.s}:${r.c}`).join(' ')
ok(versions === 'private:1 public:1', `backend.sql replaces the 5-argument version: one of each left (${versions})`)
const fiveArgs = (await as('authenticated', RM, `select staff_add_pledge('Five Args Example Co', 'Eli Ng', 'eli@five.example.org', 'gold', 'check') id`))[0].id
ok(fiveArgs?.startsWith('ord') && await amountOf(fiveArgs) === goldPrice, 'a call without an amount still works after the upgrade')

console.log(`${pass} passed, ${fail} failed`)

if (fail) process.exitCode = 1
