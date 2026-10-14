// The three labeled demo data sets (decided Oct 7): each loads through the same SQL that npm run db:load
// sends to Supabase, one at a time, with the previous set cleared. Checks counts, the match with the iPad
// app's door list, hashing, sponsor links, the as-sent vs fixed differences, and that the staff list survives.
import { readFileSync } from 'node:fs'
import { D, openTestDb } from './test-db.mjs'
import { SETS, buildLoadSql } from './demo-data.mjs'

const { db, as, err } = await openTestDb()
let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m) } }
const one = async (sql, params) => (await db.query(sql, params)).rows[0]
const json = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))
const door = json('checkin-app/src/doorlist.json')
const backend = readFileSync(D + 'backend.sql', 'utf8')

// A real person's test sign-in email, set the way Aisling sets one up for a live test.
await db.query(`update staff_users set email = 'tester@example.org' where id = 'st-daniel'`)
await db.query(`insert into staff_users (id, name, email, role) values ('st-extra', 'Extra Tester', 'extra@example.org', 'relationship_manager')`)
// The gala's Give Lively page name, set in the staff app (or by demo_givelively.sql). Pull now needs it.
await db.query(`update gala_events set givelively_page_name = 'AAFE Gala 2027' where id = 'ev-2027'`)

for (const [set, meta] of Object.entries(SETS)) {
  const data = json(meta.json)
  await db.exec(buildLoadSql(set))
  await db.exec(backend)
  const n = await one(`select (select count(*)::int from guests) g, (select count(*)::int from seats) s, (select count(*)::int from orders) o,
    (select count(*)::int from email_log) e, (select count(*)::int from event_tables) t`)
  ok(n.g === data.guests.length && n.s === data.seats.length && n.o === data.orders.length && n.e === data.email_log.length && n.t === data.event_tables.length,
    `${set}: the database holds exactly the set (${n.g} guests, ${n.s} seats, ${n.o} orders, ${n.t} tables)`)
  ok((await one(`select count(*)::int n from orders where portal_token is not null and portal_token !~ '^[0-9a-f]{64}$'`)).n === 0, `${set}: sponsor links stored only as hashes`)
  ok((await one(`select count(*)::int n from guests where qr_token is not null`)).n === 0, `${set}: QR codes moved off guests`)
  const qr = data.guests.filter((g) => g.qr_token).length
  ok((await one(`select count(*)::int n from seats where qr_token_hash is not null`)).n === qr, `${set}: every QR code hashed onto its seat (${qr})`)
  const link = data.orders.find((o) => o.id === 'ord-acme').portal_token
  const view = (await as('anon', null, `select portal_get_view($1) v`, [link]))[0].v
  ok(view.organization === 'Acme Community Partners', `${set}: Acme's sponsor link from the set's data opens its portal`)
  ok((await one(`select email from staff_users where id = 'st-daniel'`)).email === 'tester@example.org', `${set}: a test sign-in email survives the reload`)
  ok((await one(`select count(*)::int n from staff_users where id = 'st-extra'`)).n === 1, `${set}: a staff member added by hand survives the reload`)
  ok((await one(`select givelively_page_name p from gala_events where id = 'ev-2027'`)).p === 'AAFE Gala 2027',
    `${set}: the gala's Give Lively page name survives the reload, so Pull now keeps working`)
  ok((await one(`select count(*)::int n from gala_events where not is_synthetic`)).n === 0, `${set}: every gala is marked synthetic`)
  if (set !== 'small') {
    const ids = (await db.query(`select id, guest_type, table_id from guests order by id`)).rows
    const doorIds = door.guests.map((g) => g.id).sort()
    ok(JSON.stringify(ids.map((r) => r.id)) === JSON.stringify(doorIds), `${set}: same 553 guest ids as the iPad door list`)
    const byId = Object.fromEntries(door.guests.map((g) => [g.id, g]))
    ok(ids.every((r) => r.guest_type === byId[r.id].category_key && (r.table_id ? Number(r.table_id.slice(3)) : null) === byId[r.id].table),
      `${set}: same categories and tables as the door list`)
    ok(data.guests.every((g) => g.qr_token === byId[g.id].qr_token), `${set}: same QR codes as the door list`)
    const sent = await one(`select count(*)::int n, count(approved_at)::int a from email_log where status <> 'queued'`)
    ok(set === 'full-fixed' ? sent.a === sent.n && sent.n > 0 : sent.a === 0, `${set}: ${set === 'full-fixed' ? 'every sent email has an approval' : 'emails sent with no approval record'} (${sent.a} of ${sent.n})`)
    const plat = await one(`select included_seat_count n, contribution_amount::int p from sponsorship_tiers where id = 'platinum'`)
    ok(set === 'full-fixed' ? plat.n === 12 && plat.p === 50000 : plat.n === 20, `${set}: Platinum has ${plat.n} seats`)
    const silver = await one(`select included_seat_count n, contribution_amount::int p from sponsorship_tiers where id = 'silver'`)
    ok(set === 'full-fixed' ? silver.n === 10 && silver.p === 25000 : silver.n === 8 && silver.p === 15000, `${set}: Silver is ${silver.n} seats at $${silver.p}`)
    ok((await one(`select count(*)::int n from (select order_id from seats group by order_id, slot_number having count(*) > 1) x`)).n === 0, `${set}: no seat slot used twice`)
  }
}
// Demo and real galas never share a project (gala_events_no_mixing in backend.sql).
const mix = (sql) => db.exec(sql).then(() => null, (x) => x.message)
const realGala = `insert into gala_events (id, year, name, event_date, status, is_synthetic) values ('ev-real', 2031, 'AAFE Gala 2031', '2031-05-15', 'planning', false)`
ok((await mix(realGala))?.includes('never share a project') && (await one(`select count(*)::int n from gala_events where id = 'ev-real'`)).n === 0,
  'a real gala can\'t be added to a project holding demo data')
ok((await mix(`update gala_events set is_synthetic = false where id = 'ev-2024'`))?.includes('never share a project'), 'a demo gala can\'t be relabeled as real')
ok((await mix(`update gala_events set name = name where id = 'ev-2024'`)) === null, 'ordinary edits to a demo gala still work')

// The guard: a gala that isn't synthetic stops the load, and nothing changes.
// (Set up with triggers off: the no-mixing guard would otherwise refuse the relabel this needs.)
await db.exec(`set session_replication_role = replica; update gala_events set is_synthetic = false where id = 'ev-2024'; set session_replication_role = origin;`)
const before = (await one(`select count(*)::int n from guests`)).n
const e = await db.exec(buildLoadSql('small')).then(() => null, (x) => x.message)
await db.exec('rollback').catch(() => {})
ok(e?.includes('not marked synthetic') && (await one(`select count(*)::int n from guests`)).n === before, 'a database with real data refuses to load, and keeps its data')
ok(err !== undefined, 'helpers loaded')

console.log(`demo data sets: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
