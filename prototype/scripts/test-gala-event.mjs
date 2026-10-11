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
               update orders set guest_list_deadline = '2027-04-01', portal_token_expires_at = '2027-04-02'::timestamp at time zone 'America/New_York' where id = 'ord-acme';`)
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

// Audit of Oct 8: links on orders with no deadline of their own follow the gala too, and clearing the gala's
// deadline puts links on the day after the gala, as a newly sent link would get (email_mark_sent).
await db.exec(`update orders set guest_list_deadline = null where id = 'ord-meridian'`)
await update({ guest_list_deadline: '2027-05-08' })
const mer = await one(`select portal_token_expires_at t from orders where id = 'ord-meridian'`)
ok(new Date(mer.t).toISOString() === '2027-05-09T04:00:00.000Z', "a link on an order with no deadline of its own follows the gala's new deadline")
await update({ guest_list_deadline: '' })
const cleared = await one(`select count(*) filter (where portal_token_expires_at = '2027-06-04 04:00:00+00')::int n, count(*)::int total
                            from orders where event_id = current_event_id() and id <> 'ord-acme' and portal_token is not null`)
ok(cleared.total > 0 && cleared.n === cleared.total, `clearing the gala's deadline puts links on the day after the gala (${cleared.n} of ${cleared.total})`)
ok((await one(`select count(*)::int n from audit_log where action = 'event.links_moved'`)).n >= 2, 'link moves are logged')

// Audit of Oct 8: a QR e-ticket that stops working leaves a history entry.
const qs = await one(`select s.id, s.guest_id from seats s join orders o on o.id = s.order_id
                      where o.event_id = current_event_id() and s.qr_token_hash is not null and s.status <> 'cancelled' limit 1`)
await as('authenticated', RM.email, `select staff_update_guest($1, $2)`, [qs.guest_id, JSON.stringify({ first_name: 'Renamed' })])
ok((await one(`select qr_token_hash from seats where id = $1`, [qs.id])).qr_token_hash === null
   && (await one(`select count(*)::int n from audit_log where action = 'qr.voided' and entity_id = $1`, [qs.id])).n === 1,
   'a QR e-ticket voided by a name change is logged')

// Audit of Oct 8: check-ins are for this gala only.
await db.query(`insert into guests (id, order_id, first_name, last_name, display_name, guest_type, last_updated_by)
                values ('g-past-gala', $1, 'Past', 'Guest', 'Past Guest', 'sponsor_guest', 'staff')`, [past])
ok((await err('authenticated', ADMIN.email, `select staff_check_in('g-past-gala')`))?.startsWith('not_found'), "another gala's guest can't be checked in")
ok((await err('authenticated', ADMIN.email, `select staff_check_in_exception('Walk In', $1, 'walk_in', '')`, [past]))?.startsWith('not_found'),
   "a walk-in can't be put on another gala's order")
ok((await err('authenticated', ADMIN.email, `select staff_check_in_exception('Walk In', null, 'walk_in', '')`)) === null, 'a walk-in with no sponsor still works')
const synced = (await as('authenticated', ADMIN.email, `select staff_sync_check_ins($1) r`,
  [JSON.stringify([{ client_id: 'past-walkin', kind: 'exception', name: 'Walk In', type: 'walk_in', order_id: past }])]))[0].r
ok(synced[0].status === 'error' && synced[0].error.startsWith('not_found'), "an offline walk-in can't be put on another gala's order")

console.log(`gala event: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
