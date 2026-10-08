// Changing the gala's date or guest-list deadline (staff_update_gala_event, PR #72) moves what was already sent:
// QR e-tickets expire after the new gala date, and sponsors who took the gala's deadline follow the new one, with
// their links (hard rule 6). A deadline set for one order stays. Also: staff_set_material_status refuses missing
// values and other galas' orders. Runs with npm run test:backend.
import { counter, openTestDb } from './test-db.mjs'
const { db, as, err } = await openTestDb()
const count = counter(), ok = count.ok
const q = async (sql, params) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]
const ADMIN = await one(`select email, name from staff_users where role = 'gala_admin' limit 1`)
const RM = await one(`select email, name from staff_users where role = 'relationship_manager' limit 1`)
const ev = await one(`select id, event_date::text d, guest_list_deadline::text dl from gala_events where id = current_event_id()`)
const update = (patch) => as('authenticated', ADMIN.email, `select staff_update_gala_event($1)`, [JSON.stringify(patch)])

// Setup: QR codes on two seats, a link on every order, and one order with a deadline of its own.
await db.exec(`update seats set qr_token_hash = hash_token('AAFE-0000000000000000000000000000GAL' || id), qr_token_expires_at = qr_expiry(current_event_id())
               where id in (select s.id from seats s join orders o on o.id = s.order_id where o.event_id = current_event_id() and s.guest_id is not null and s.status <> 'cancelled' limit 2);
               update orders set guest_list_deadline = (select guest_list_deadline from gala_events where id = current_event_id()),
                      portal_token = coalesce(portal_token, encode(sha256(convert_to(id, 'UTF8')), 'hex')),
                      portal_token_expires_at = ((select guest_list_deadline from gala_events where id = current_event_id()) + 1)::timestamp at time zone 'America/New_York'
                where event_id = current_event_id();
               update orders set guest_list_deadline = '2027-04-01' where id = 'ord-acme';`)
const acmeBefore = await one(`select guest_list_deadline::text dl, portal_token_expires_at t from orders where id = 'ord-acme'`)
const qrSeats = (await one(`select count(*)::int n from seats s join orders o on o.id = s.order_id where o.event_id = current_event_id() and s.qr_token_hash is not null and s.status <> 'cancelled'`)).n

// A later gala date: every live QR code now expires the morning after it.
const newDate = '2027-06-03'
await update({ event_date: newDate })
const exp = await one(`select qr_expiry(current_event_id()) t`)
const qr = await one(`select count(*) filter (where s.qr_token_expires_at = $1)::int moved, count(*)::int n from seats s join orders o on o.id = s.order_id
                      where o.event_id = current_event_id() and s.qr_token_hash is not null and s.status <> 'cancelled'`, [exp.t])
ok(qr.n === qrSeats && qr.moved === qr.n && qr.n >= 2, `a new gala date moves every QR e-ticket's expiry (${qr.moved} of ${qr.n})`)
ok(new Date(exp.t).toISOString() === '2027-06-04T10:00:00.000Z', 'to 6 a.m. New York time the morning after the new date')
ok((await one(`select count(*)::int n from audit_log where action = 'event.qr_expiry_moved' and actor = $1`, [ADMIN.name])).n === 1, 'and the move is logged')

// A new guest-list deadline: orders that took the gala's deadline follow it, links too; Acme's own deadline stays.
await update({ guest_list_deadline: '2027-05-01' })
const moved = await one(`select count(*) filter (where guest_list_deadline = '2027-05-01')::int n,
                                count(*) filter (where guest_list_deadline = '2027-05-01' and portal_token_expires_at = '2027-05-02 04:00:00+00')::int links,
                                count(*)::int total from orders where event_id = current_event_id() and id <> 'ord-acme'`)
ok(moved.n === moved.total && moved.total > 0, `orders on the gala's deadline follow the new one (${moved.n} of ${moved.total})`)
ok(moved.links === moved.n, 'and their sponsor links now expire after the new deadline')
const acme = await one(`select guest_list_deadline::text dl, portal_token_expires_at t from orders where id = 'ord-acme'`)
ok(acme.dl === acmeBefore.dl && +new Date(acme.t) === +new Date(acmeBefore.t), 'a deadline set for one order stays, with its link')
ok((await one(`select count(*)::int n from audit_log where action = 'event.deadline_moved'`)).n === 1, 'the deadline move is logged')
await update({ dress_code: 'Black tie' })
ok((await one(`select count(*)::int n from audit_log where action in ('event.qr_expiry_moved', 'event.deadline_moved')`)).n === 2, 'changing anything else moves nothing')
ok((await err('authenticated', RM.email, `select staff_update_gala_event('{"event_date":"2027-07-01"}')`))?.startsWith('forbidden'), 'only a gala admin can change the gala')

// staff_set_material_status: a missing value or another gala's order is refused.
const setMat = (o, m, s) => err('authenticated', RM.email, `select staff_set_material_status($1, $2, $3)`, [o, m, s])
ok((await setMat('ord-acme', null, 'pending'))?.startsWith('invalid_input'), 'a missing material is refused (it used to update the program ad)')
ok((await setMat('ord-acme', 'logo', null))?.startsWith('invalid_input'), 'a missing status is refused')
const past = (await one(`select id from orders where event_id <> current_event_id() limit 1`)).id
ok((await setMat(past, 'logo', 'received'))?.startsWith('not_found'), "another gala's order is refused")
ok((await setMat('ord-acme', 'logo', 'received')) === null, 'a valid change still works')

console.log(`gala event: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
