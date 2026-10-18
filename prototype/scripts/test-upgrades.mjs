// Database upgrades recorded in schema_upgrades (backend.sql, section 1; Gate 1 box 7): a one-time change to data
// already in a database runs once, is recorded, and is never decided by "does this column exist yet". Covers a fresh
// database, one from before Oct 14 that still needs the steps, one that ran them before the table existed (stable and
// nightly), a reload of demo data, and a new step. Runs with npm run test:backend. Invented data only.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { counter, D, openTestDb, SUPABASE_STAND_INS } from './test-db.mjs'
import { buildLoadSql } from './demo-data.mjs'

const count = counter(), ok = count.ok
const backend = readFileSync(D + 'backend.sql', 'utf8')
const STEPS = ['2026-10-14 guaranteed seating', '2026-10-14 levels per gala']
const steps = async (db) => (await db.query(`select id, ran, applied_at from schema_upgrades order by id`)).rows
const tiers = async (db) => JSON.stringify((await db.query(`select id, event_id, guaranteed_seating, contribution_amount from sponsorship_tiers order by id`)).rows)
const failed = (p) => p.then(() => null, (e) => e.message)

// ---- A fresh database (schema.sql already has both steps' columns, and the seed their values)
const { db, err } = await openTestDb()   // schema, seed, then backend.sql twice
const fresh = await steps(db)
ok(fresh.map((s) => s.id).join() === STEPS.join() && fresh.every((s) => s.ran === false), 'a fresh database records both steps as already done, and runs neither')
ok((await db.query(`select guaranteed_seating g from sponsorship_tiers where id = 'friend'`)).rows[0].g === false,
  "the seed's Friend level keeps its no-table answer (the old step would have marked every sponsorship)")
const before = await tiers(db)
await db.exec(backend)
ok(JSON.stringify(await steps(db)) === JSON.stringify(fresh) && await tiers(db) === before, 'running backend.sql again records and changes nothing')

// ---- Stable and nightly: they ran these steps before the table existed. Meeting it records them; nothing changes.
await db.exec(`drop table schema_upgrades; drop function upgrade_step(text, text)`)
await db.exec(backend)
const met = await steps(db)
ok(met.map((s) => s.id).join() === STEPS.join() && met.every((s) => s.ran === false) && await tiers(db) === before,
  'a database that ran the steps before the table records them as done, and its levels stay as they are')

// The table decides now, not a guess: a level with no gala no longer triggers the per-gala upgrade.
await db.exec(`insert into sponsorship_tiers (id, name, contribution_amount, included_seat_count, tier_category) values ('stray', 'Stray', 1, 0, 'ticket')`)
await db.exec(backend)
ok((await db.query(`select event_id from sponsorship_tiers where id = 'stray'`)).rows[0].event_id === null, 'a recorded step never runs again, whatever the data looks like')
await db.exec(`delete from sponsorship_tiers where id = 'stray'`)

// ---- Reloading demo data keeps the record, and loads the set's levels as they are
await db.exec(buildLoadSql('full-fixed'))
await db.exec(backend)
ok(JSON.stringify((await steps(db)).map((s) => [s.id, s.ran])) === JSON.stringify(met.map((s) => [s.id, s.ran])), 'npm run db:load keeps the record')
const lv = (await db.query(`select id, guaranteed_seating g, contribution_amount::int p from sponsorship_tiers where id in ('friend', 'gold-2025', 'gold')`)).rows
ok(lv.find((r) => r.id === 'friend')?.g === false && lv.find((r) => r.id === 'gold-2025')?.p === 25000 && lv.find((r) => r.id === 'gold')?.p === 30000,
  "and the set's levels load unchanged: Friend without a table, 2025 Gold at 2025's price")

// ---- Only the SQL editor runs it
for (const role of ['anon', 'authenticated']) {
  ok(/permission denied/.test((await err(role, 'mei.ortiz@aafe-demo.example.org', `select upgrade_step('x', 'y')`)) ?? ''), `${role} can't call upgrade_step()`)
}

// ---- A new step runs exactly once; one that fails isn't recorded, so it runs when fixed
const step = (id, body) => `do $$ begin if upgrade_step('${id}', 'test step') then ${body}; end if; end $$`
await db.exec(step('2099-01-01 test', `update gala_events set name = name || ' (renamed)' where id = 'ev-2024'`))
await db.exec(step('2099-01-01 test', `update gala_events set name = name || ' (renamed)' where id = 'ev-2024'`))
ok((await db.query(`select name from gala_events where id = 'ev-2024'`)).rows[0].name.match(/\(renamed\)/g)?.length === 1, 'a new step runs once, however often backend.sql runs')
ok(/division by zero/.test(await failed(db.exec(step('2099-01-02 failing', 'perform 1 / 0'))) ?? '')
  && (await db.query(`select count(*)::int n from schema_upgrades where id = '2099-01-02 failing'`)).rows[0].n === 0, 'a step that fails is not recorded')
await db.exec(step('2099-01-02 failing', 'perform 1'))
ok((await db.query(`select ran from schema_upgrades where id = '2099-01-02 failing'`)).rows[0]?.ran === true, 'and runs once it is fixed')

// ---- A database from before Oct 14: no guaranteed_seating, levels shared by every gala. Both steps run, once.
const old = new PGlite()
await old.exec(SUPABASE_STAND_INS)
await old.exec(readFileSync(D + 'schema.sql', 'utf8'))
await old.exec(readFileSync(D + 'seed.sql', 'utf8'))
// Back to the old shape: past galas' orders on this year's levels, no level belonging to a gala, no table answer.
await old.exec(`update orders o set tier_id = t.base from (select id, regexp_replace(id, '-20[0-9][0-9]$', '') base from sponsorship_tiers where id ~ '-20[0-9][0-9]$') t where o.tier_id = t.id;
delete from sponsorship_tiers where id ~ '-20[0-9][0-9]$';
update sponsorship_tiers set event_id = null, sort_order = 0;
alter table sponsorship_tiers drop column guaranteed_seating;`)
const pastOrders = (await old.query(`select count(*)::int n from orders o join gala_events e on e.id = o.event_id where e.year < 2027`)).rows[0].n
await old.exec(backend)
const ran = await steps(old)
ok(ran.map((s) => s.id).join() === STEPS.join() && ran.every((s) => s.ran === true), 'an old database runs both steps, and records them')
ok((await old.query(`select count(*)::int n from sponsorship_tiers where event_id is null`)).rows[0].n === 0
  && (await old.query(`select count(*)::int n from orders o join sponsorship_tiers t on t.id = o.tier_id where t.event_id = o.event_id`)).rows[0].n === (await old.query(`select count(*)::int n from orders`)).rows[0].n,
  `every level belongs to a gala, and each order to its own gala's level (${pastOrders} past orders)`)
ok((await old.query(`select bool_and(guaranteed_seating = (tier_category = 'sponsorship')) ok from sponsorship_tiers`)).rows[0].ok === true, 'sponsorships come with a table, tickets don\'t')
const once = await tiers(old)
await old.exec(backend)
ok(JSON.stringify(await steps(old)) === JSON.stringify(ran) && await tiers(old) === once, 'and running backend.sql again does neither again')

console.log(`upgrades: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
