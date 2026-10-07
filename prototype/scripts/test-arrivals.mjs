// Gala-night arrivals in the sponsor portal (decided Oct 6): off until AAFE's privacy review approves it;
// when on, a sponsor sees which of their own guests arrived (yes or no, never a time). npm run test:backend.
import { counter, openTestDb } from './test-db.mjs'
const { db, as, err } = await openTestDb()
const count = counter(), ok = count.ok
const q = async (sql, params) => (await db.query(sql, params)).rows

const STAFF = Object.fromEntries((await q(`select role, email, name from staff_users order by email`)).map((s) => [s.role, s]))
const ADMIN = STAFF.gala_admin, RM = STAFF.relationship_manager, VOL = STAFF.check_in_volunteer
const LINK = 'ac-6w9k3p5d'
const view = async () => (await as('anon', null, `select portal_get_view($1) v`, [LINK]))[0].v
const order = (await q(`select id from orders where portal_token = hash_token($1)`, [LINK]))[0].id
const seated = await q(`select s.slot_number slot, g.id from seats s join guests g on g.id = s.guest_id where s.order_id = $1 order by s.slot_number`, [order])

// Guests arrive: one of this sponsor's, a walk-in on their seats, and another sponsor's guest.
await as('authenticated', VOL.email, `select staff_check_in($1)`, [seated[0].id])
await as('authenticated', VOL.email, `select staff_check_in_exception('Walk-in Example', $1, 'walk_in', 'Took an unnamed seat')`, [order])
const other = (await q(`select g.id from guests g join orders o on o.id = g.order_id where o.id <> $1 and o.event_id = current_event_id()
  and g.attendance_status <> 'checked_in' limit 1`, [order]))[0].id
await as('authenticated', VOL.email, `select staff_check_in($1)`, [other])
const arrivedAt = (await q(`select checked_in_at from check_ins where guest_id = $1`, [seated[0].id]))[0].checked_in_at.toISOString()

// ---- Off (the default)
ok((await q(`select sponsor_arrivals_visible v from gala_events where id = current_event_id()`))[0].v === false, 'arrivals start switched off')
let v = await view()
const seat = (vv) => vv.seats.find((s) => s.slot === seated[0].slot)
ok(seat(v).status === 'badge_ready' && !('arrived' in seat(v)) && v.arrivals === null, 'off: a checked-in guest reads as badge ready, with no arrival shown')
ok(!JSON.stringify(v).includes('checked_in') && !JSON.stringify(v).includes(arrivedAt.slice(0, 16)), 'off: nothing in the portal says who arrived or when')
const locked = await err('anon', null, `select portal_release_seat($1, $2)`, [LINK, seated[0].slot])
ok(locked?.startsWith('seat_locked') && !/check/i.test(locked), `off: a locked seat doesn't say why: ${locked}`)

// ---- Switching it on: gala admins only, with AAFE's approval recorded
ok((await err('authenticated', RM.email, `select staff_set_sponsor_arrivals(true, 'x')`)) === 'forbidden', 'relationship managers cannot switch it on')
ok((await err('authenticated', VOL.email, `select staff_set_sponsor_arrivals(true, 'x')`)) === 'forbidden', 'volunteers cannot switch it on')
ok((await err('authenticated', ADMIN.email, `select staff_set_sponsor_arrivals(true)`))?.includes('privacy approval'), "switching on needs AAFE's approval noted")
ok((await err('authenticated', ADMIN.email, `select staff_set_sponsor_arrivals(true, '   ')`))?.startsWith('invalid_input'), 'a blank note is not an approval')
await as('authenticated', ADMIN.email, `select staff_set_sponsor_arrivals(true, 'Approved by AAFE (demo), Oct 20')`)
const onLog = (await q(`select * from audit_log where action = 'gala.sponsor_arrivals' order by id desc limit 1`))[0]
ok(onLog?.actor === ADMIN.name && onLog.to_state === 'true' && onLog.summary.includes('Approved by AAFE (demo), Oct 20'), 'switching on is logged with the approval')

// ---- On
v = await view()
ok(seat(v).status === 'checked_in' && seat(v).arrived === true, 'on: the sponsor sees their guest arrived')
ok(v.seats.filter((s) => s.guest && s.slot !== seated[0].slot).every((s) => s.arrived === false), 'on: guests not yet here show as not arrived')
ok(v.seats.filter((s) => !s.guest).every((s) => !('arrived' in s)), 'on: unnamed seats show no arrival')
ok(v.arrivals.arrived === 1 && v.arrivals.expected === seated.length && v.arrivals.walkIns === 1,
  `on: counts for this sponsor only, with walk-ins on their seats: ${JSON.stringify(v.arrivals)}`)
ok(!JSON.stringify(v).includes(arrivedAt.slice(0, 16)) && !/checked_in_at|checked_in_by|device|Walk-in Example/.test(JSON.stringify(v)),
  'on: still no times, no staff names, and no walk-in names')
ok(!JSON.stringify(v).includes((await q(`select first_name from guests where id = $1`, [other]))[0].first_name + '"'), "on: never another sponsor's guests")
ok((await q(`select count(*)::int n from audit_log where order_id = $1 and guest_visible and action like 'checkin%'`, [order]))[0].n === 0,
  "check-ins never appear in the sponsor's activity list")

// ---- Off again
await as('authenticated', ADMIN.email, `select staff_set_sponsor_arrivals(false)`)
v = await view()
ok(seat(v).status === 'badge_ready' && v.arrivals === null && !('arrived' in seat(v)), 'switched off again: hidden again')
ok((await q(`select summary from audit_log where action = 'gala.sponsor_arrivals' order by id desc limit 1`))[0].summary.includes('no longer'), 'switching off is logged')
const before = (await q(`select count(*)::int n from audit_log where action = 'gala.sponsor_arrivals'`))[0].n
await as('authenticated', ADMIN.email, `select staff_set_sponsor_arrivals(false)`)
ok((await q(`select count(*)::int n from audit_log where action = 'gala.sponsor_arrivals'`))[0].n === before, 'switching to the same setting logs nothing')

console.log(`sponsor arrivals: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
