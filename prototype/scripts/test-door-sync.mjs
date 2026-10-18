// The door list by changes (Gate 3, data use, part 3): door_sync(cursor) gives the iPad what changed since it last
// asked, and an iPad that merges those answers must end with exactly the list staff_checkin_snapshot() gives. Every
// kind of change that alters a door-list line is played here; after each, the merged copy is compared with a fresh
// full list. Runs with npm run test:backend; the race (a save still running while an iPad asks) is in
// scripts/load-checkin.mjs, which keeps door lists by changes during the gala-night load test.
import { counter, openTestDb } from './test-db.mjs'
const { db, as, err } = await openTestDb()
const count = counter(), ok = count.ok
const one = async (sql, params) => (await db.query(sql, params)).rows[0]
const STAFF = Object.fromEntries((await db.query(`select role, email from staff_users order by email`)).rows.map((r) => [r.role, r.email]))
const VOL = STAFF.check_in_volunteer, RM = STAFF.relationship_manager, ADMIN = STAFF.gala_admin
const EVENT = (await one(`select current_event_id() e`)).e
const sync = async (cursor = null, event = EVENT, who = VOL) => (await as('authenticated', who, `select door_sync($1, $2) d`, [cursor, event]))[0].d
const snapshot = async () => (await as('authenticated', VOL, `select staff_checkin_snapshot() s`))[0].s
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

// The iPad's side: merge an answer into the saved list, exactly as the check-in app will.
let list = null, cursor = null
function merge(d) {
  if (d.full) list = { guests: new Map(), unnamed_seats: [], exceptions: [] }
  for (const id of d.removed) list.guests.delete(id)
  for (const g of d.guests) list.guests.set(g.id, g)
  if (d.unnamed_seats !== null) list.unnamed_seats = d.unnamed_seats
  if (d.exceptions !== null) list.exceptions = d.exceptions
  cursor = d.cursor
  return d
}
async function matches(what) {
  const d = merge(await sync(cursor))
  const s = await snapshot()
  const mine = [...list.guests.values()].sort(byId), full = [...s.guests].sort(byId)
  ok(JSON.stringify(mine) === JSON.stringify(full) && JSON.stringify(list.unnamed_seats) === JSON.stringify(s.unnamed_seats)
    && JSON.stringify(list.exceptions) === JSON.stringify(s.exceptions) && d.count === s.guests.length,
    `${what}: the merged list equals a fresh full list (${mine.length} guests)`)
  return d
}

// Everything first: the same list as the snapshot, with no more than the snapshot shows.
const first = merge(await sync())
const snap = await snapshot()
ok(first.full === true && typeof first.cursor === 'string' && first.event_id === EVENT, 'the first call is the whole list, with a cursor')
ok(JSON.stringify([...first.guests].sort(byId)) === JSON.stringify([...snap.guests].sort(byId)), 'its lines are the snapshot\'s lines')
ok(JSON.stringify(first.unnamed_seats) === JSON.stringify(snap.unnamed_seats) && JSON.stringify(first.exceptions) === JSON.stringify(snap.exceptions), 'and so are its unnamed seats and walk-ins')
const keys = new Set(first.guests.flatMap((g) => Object.keys(g)))
ok(!['email', 'phone', 'dietary_needs', 'accessibility_needs', 'notes', 'relationship_note'].some((k) => keys.has(k)), 'a volunteer gets no email, phone, food, access details or notes')

// Nothing changed: almost nothing sent.
const quiet = await matches('nothing changed')
ok(quiet.full === false && quiet.guests.length === 0 && quiet.removed.length === 0 && quiet.unnamed_seats === null && quiet.exceptions === null,
  'nothing changed: no lines, nothing removed, the small lists not resent')
ok(JSON.stringify(quiet).length < 700, `an empty answer is small (${JSON.stringify(quiet).length} bytes)`)

// Another door checks a guest in: that line arrives, marked arrived.
const guest = (await one(`select g.id, g.order_id from guests g join orders o on o.id = g.order_id where o.event_id = $1 and o.status <> 'cancelled'
  and g.attendance_status <> 'checked_in' order by g.id limit 1`, [EVENT]))
await as('authenticated', VOL, `select staff_sync_check_ins($1)`, [JSON.stringify([{ client_id: 'door-test-1', kind: 'guest', guest_id: guest.id, method: 'search', at: new Date().toISOString(), device: 'Door 2' }])])
const arrived = await matches('a check-in at another door')
ok(arrived.guests.length === 1 && arrived.guests[0].id === guest.id && arrived.guests[0].arrived === true, 'only that guest\'s line comes, marked arrived')

// Undo: the line comes back as expected.
await as('authenticated', VOL, `select staff_undo_check_in('door-test-1')`)
const undone = await matches('an undo')
ok(undone.guests.some((g) => g.id === guest.id && g.arrived === false), 'the undone guest is expected again')

// A sponsor renamed: every guest of that sponsor's line changes.
const sp = (await one(`select o.sponsor_id id, count(*)::int n from guests g join orders o on o.id = g.order_id where o.event_id = $1 and o.status <> 'cancelled'
  group by o.sponsor_id order by count(*) desc, o.sponsor_id limit 1`, [EVENT]))
await db.exec(`update sponsors set organization_name = organization_name || ' (renamed)' where id = '${sp.id}'`)
const renamed = await matches('a sponsor renamed')
ok(renamed.guests.length >= sp.n && renamed.guests.filter((g) => g.sponsor.endsWith('(renamed)')).length === sp.n, `all ${sp.n} of that sponsor's guests come with the new name`)

// A table renumbered: its guests' lines change.
const tbl = await one(`select t.id, count(g.id)::int n from event_tables t join guests g on g.table_id = t.id where t.event_id = $1 group by t.id order by count(g.id) desc, t.id limit 1`, [EVENT])
if (tbl) {
  await db.exec(`update event_tables set number = number + 100 where id = '${tbl.id}'`)
  const moved = await matches('a table renumbered')
  ok(moved.guests.filter((g) => g.table_number >= 100).length === tbl.n, `its ${tbl.n} guests come with the new table number`)
}

// A walk-in at the door: the walk-in list comes whole.
await as('authenticated', VOL, `select staff_sync_check_ins($1)`, [JSON.stringify([{ client_id: 'door-walkin-1', kind: 'exception', name: 'Walk-in Door Test', type: 'Walk-in pending confirmation', note: '', at: new Date().toISOString(), device: 'Door 3' }])])
const walkin = await matches('a walk-in')
ok(walkin.exceptions !== null && walkin.exceptions.some((x) => x.name === 'Walk-in Door Test'), 'the walk-in list comes with the new walk-in')

// A sponsor removes a guest on their link: the guest leaves the list, and the unnamed seats change.
const LINK = 'ac-6w9k3p5d'   // a demo sponsor link (links are stored hashed, so a stored value can't be used)
const named = await one(`select s.slot_number n, s.guest_id g from seats s join orders o on o.id = s.order_id
  where o.portal_token = hash_token($1) and s.guest_id is not null and s.status <> 'checked_in' and s.guest_id <> $2
  order by s.slot_number limit 1`, [LINK, guest.id])
ok(!!named, 'the demo sponsor has a named guest to remove')
if (named) {
  await as('anon', null, `select portal_release_seat($1, $2)`, [LINK, named.n])
  const gone = await matches('a guest removed on the sponsor link')
  ok(gone.removed.includes(named.g) && gone.unnamed_seats !== null, 'the guest is listed as removed, and the unnamed seats come again')
}

// An order cancelled: its guests leave every iPad's list.
const ord = await one(`select o.id, count(g.id)::int n from orders o join guests g on g.order_id = o.id where o.event_id = $1 and o.status <> 'cancelled'
  and o.sponsor_id <> $2 group by o.id order by o.id limit 1`, [EVENT, sp.id])
await db.exec(`update orders set status = 'cancelled' where id = '${ord.id}'`)
const cancelled = await matches('an order cancelled')
ok(cancelled.removed.length >= ord.n && cancelled.count === (await snapshot()).guests.length, `its ${ord.n} guests are listed as removed, and the count drops`)

// Who may ask: every staff role (the door list is a volunteer's job); not the sponsor portal.
ok((await sync(null, EVENT, RM))?.full === true && (await sync(null, EVENT, ADMIN))?.full === true, 'relationship managers and gala admins get it too')
ok((await err('anon', null, `select door_sync(null, null)`))?.includes('permission denied'), 'the sponsor portal can\'t call it')
ok((await err('anon', null, `select door_entries('x', null)`))?.includes('permission denied')
  && (await err('authenticated', VOL, `select door_entries('x', null)`))?.includes('permission denied'), 'the line builder is callable by no one directly')

// Everything again: another gala, or tombstones the cursor needs were pruned.
ok((await sync(cursor, 'ev-some-other-gala')).full === true, 'a different gala: the whole list')
await db.exec(`insert into sync_deleted (table_name, row_id, deleted_at) values ('guests', 'g-door-long-gone', now() - interval '8 days')`)
await as('service_role', null, `select sync_prune()`)
ok((await sync(cursor)).full === true, 'a cursor older than the pruned tombstones: the whole list')

// No gala open: null, as the snapshot answers.
await db.exec(`update gala_events set status = 'closed' where id = '${EVENT}'`)
const closed = await sync(null)
ok(closed === null || closed.status === 'closed', `a closed gala: ${closed === null ? 'no list' : 'status closed, so the iPad clears its list'}`)

console.log(`door sync: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
