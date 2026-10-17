// The staff app's sync (Gate 3, data use): staff_sync(cursor) returns only what changed since the cursor, from one
// snapshot, through each role's access rules; deleted rows come as tombstones. Runs with npm run test:backend.
// The race it's built for (a change still being saved while the app reads) needs real connections:
// scripts/load-checkin.mjs runs a staff tab syncing during the gala-night load test.
import { readFileSync } from 'node:fs'
import { counter, D, openTestDb } from './test-db.mjs'
const { db, as, err } = await openTestDb()
const count = counter(), ok = count.ok
const one = async (sql, params) => (await db.query(sql, params)).rows[0]
const STAFF = Object.fromEntries((await db.query(`select role, email from staff_users order by email`)).rows.map((r) => [r.role, r.email]))
const ADMIN = STAFF.gala_admin, RM = STAFF.relationship_manager, VOL = STAFF.check_in_volunteer
const sync = async (who, cursor = null, event) => (await as('authenticated', who, `select staff_sync($1, $2) s`,
  [cursor, event === undefined ? (await one(`select current_event_id() e`)).e : event]))[0].s
const ids = (rows) => rows.map((r) => r.id).sort()

// Everything, once: every table the staff app reads, row counts that match, a cursor and the gala.
const full = await sync(ADMIN)
ok(full.full === true && typeof full.cursor === 'string' && full.event === (await one(`select current_event_id() e`)).e, 'the first sync is everything, with a cursor')
for (const [t, n] of Object.entries(full.counts)) ok(full.rows[t].length === n, `${t}: ${full.rows[t].length} rows sent, ${n} counted`)
ok(full.rows.guests.every((g) => !('sync_txid' in g)), 'rows come without the internal sync column')
ok(full.rows.audit_log.length > 0 && full.rows.audit_log.every((a) => !('changes' in a)), "the change log comes without its hidden details")

// Nothing changed: an empty answer, about half a kilobyte.
const quiet = await sync(ADMIN, full.cursor)
ok(quiet.full === false && Object.values(quiet.rows).every((r) => r.length === 0) && quiet.deleted.length === 0, 'nothing changed: nothing sent')
ok(JSON.stringify(quiet).length < 800, `an empty answer is small (${JSON.stringify(quiet).length} bytes)`)

// One guest edited: that guest and its change-log line, nothing else.
const guest = (await one(`select g.id from guests g join orders o on o.id = g.order_id where o.event_id = current_event_id() order by g.id limit 1`)).id
await as('authenticated', ADMIN, `select staff_update_guest($1, '{"title": "Board chair (sync test)"}')`, [guest])
const edit = await sync(ADMIN, quiet.cursor)
ok(JSON.stringify(ids(edit.rows.guests)) === JSON.stringify([guest]) && edit.rows.guests[0].title === 'Board chair (sync test)', 'an edited guest comes alone, as it is now')
ok(edit.rows.audit_log.length >= 1 && edit.rows.audit_log.every((a) => a.entity_id === guest || a.order_id), 'with its change-log line')
ok(['orders', 'payments', 'sponsors', 'seats', 'email_log'].every((t) => edit.rows[t].length === 0), 'and no other table')
ok((await sync(ADMIN, edit.cursor)).rows.guests.length === 0, 'the next sync no longer sends it')

// A check-in and its undo: the check-in arrives, then leaves as a tombstone.
const before = await sync(ADMIN, edit.cursor)
await as('authenticated', VOL, `select staff_sync_check_ins($1)`, [JSON.stringify([{ client_id: 'sync-test-1', kind: 'guest', guest_id: guest, method: 'search', at: new Date().toISOString(), device: 'Door 1' }])])
const arrived = await sync(ADMIN, before.cursor)
const ci = arrived.rows.check_ins.find((c) => c.guest_id === guest)
ok(!!ci && arrived.rows.guests.some((g) => g.id === guest && g.attendance_status === 'checked_in'), 'a check-in comes with its guest')
await as('authenticated', VOL, `select staff_undo_check_in('sync-test-1')`)
const undone = await sync(ADMIN, arrived.cursor)
ok(undone.deleted.some((d) => d.table === 'check_ins' && d.id === ci.id), 'an undone check-in comes back as deleted')
ok(undone.rows.guests.some((g) => g.id === guest && g.attendance_status !== 'checked_in'), 'and the guest as expected again')

// A row deleted and created again under the same id (seat ids are fixed, Give Lively's order ids too): it comes as a row,
// and its tombstone never comes again to delete it.
const seat = (await one(`select id from seats where status = 'unnamed' order by id limit 1`)).id
const pre = await sync(ADMIN, undone.cursor)
await db.exec(`create temp table seat_copy as select * from seats where id = '${seat}';
  delete from seats where id = '${seat}'; insert into seats select * from seat_copy; drop table seat_copy;`)
const again = await sync(ADMIN, pre.cursor)
ok(again.rows.seats.some((s) => s.id === seat) && !again.deleted.some((d) => d.id === seat), 'a row created again under the same id comes as a row, not as deleted')

// A relationship manager gets this gala's guests only, in a full sync and in a change.
await db.exec(`
insert into orders (id, event_id, sponsor_id, tier_id, source, commitment_amount, status)
  select 'ord-sync-past', e.id, (select id from sponsors limit 1), (select id from sponsorship_tiers where event_id = e.id limit 1), 'check', 1, 'pledged'
    from gala_events e where e.id <> current_event_id() order by e.event_date limit 1;
insert into guests select (jsonb_populate_record(null::guests, to_jsonb(g) || '{"id": "g-sync-past", "order_id": "ord-sync-past", "table_id": null, "seat_number": null, "qr_token": null}')).* from guests g limit 1;`)
const rm = await sync(RM)
ok(!rm.rows.guests.some((g) => g.id === 'g-sync-past') && rm.rows.guests.length === rm.counts.guests, "a relationship manager's full sync has no past gala's guests")
ok((await sync(ADMIN, before.cursor)).rows.guests.some((g) => g.id === 'g-sync-past'), "a gala admin's has them")
ok(!(await sync(RM, before.cursor)).rows.guests.some((g) => g.id === 'g-sync-past'), "and a relationship manager's change doesn't")
ok((await err('authenticated', VOL, `select staff_sync(null, null)`)) === 'forbidden', 'a check-in volunteer gets nothing (the door has its own list)')
ok((await err('anon', null, `select staff_sync(null, null)`))?.includes('permission denied'), 'and neither does the sponsor portal')

// Everything again when the gala being run changed, or when the tombstones the cursor needs were pruned.
ok((await sync(ADMIN, undone.cursor, 'ev-some-other-gala')).full === true, 'a different gala: everything')
await db.exec(`insert into sync_deleted (table_name, row_id, deleted_at) values ('guests', 'g-long-gone', now() - interval '8 days')`)
const pruned = (await as('service_role', null, `select sync_prune() n`))[0].n
ok(pruned >= 1 && (await sync(ADMIN, undone.cursor)).full === true, `a cursor older than the pruned tombstones gets everything (${pruned} pruned)`)
ok((await err('authenticated', ADMIN, `select sync_prune()`))?.includes('permission denied'), 'only the schedule prunes')
const fresh = await sync(ADMIN)
ok((await sync(ADMIN, fresh.cursor)).full === false, 'a cursor taken after the prune syncs changes again')

// A restored backup brings another database's transaction ids: one from "the future" is brought to now.
await db.exec(`set session_replication_role = replica; update guests set sync_txid = '999999999' where id = '${guest}'; set session_replication_role = origin`)
await db.exec(readFileSync(D + 'backend.sql', 'utf8'))
ok((await one(`select sync_txid <= pg_current_xact_id() ok from guests where id = $1`, [guest])).ok, 're-running backend.sql brings a restored row to this database')

console.log(`sync: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
