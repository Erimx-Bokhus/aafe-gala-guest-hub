// Sponsorship levels, one list per gala (decided Oct 14): levels change every year, so each belongs to one gala and
// editing this year's never rewrites a past gala. Gala admins add, edit, retire and copy levels (staff_save_level,
// staff_retire_level, staff_copy_levels); pledges, Give Lively matching and the pipeline only take this gala's levels.
// Runs with npm run test:backend.
import { readFileSync } from 'node:fs'
import { counter, D, openTestDb } from './test-db.mjs'
const { db, as, err } = await openTestDb()
const count = counter(), ok = count.ok
const q = async (sql, params) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]
const ADMIN = await one(`select email, name from staff_users where role = 'gala_admin' limit 1`)
const RM = await one(`select email, name from staff_users where role = 'relationship_manager' limit 1`)
const asAdmin = (sql, params) => as('authenticated', ADMIN.email, sql, params)
const save = (p, who = ADMIN.email) => as('authenticated', who, `select staff_save_level($1) id`, [JSON.stringify(p)])
const cur = (await one(`select current_event_id() id`)).id

// Every order's level belongs to the order's own gala.
ok((await one(`select count(*)::int n from orders o join sponsorship_tiers t on t.id = o.tier_id where t.event_id is distinct from o.event_id`)).n === 0,
  "every order's level belongs to its own gala")
ok((await one(`select count(*)::int n from sponsorship_tiers where event_id = 'ev-2026'`)).n > 0, '2026 has its own levels')

// A database loaded before levels were per gala is upgraded: levels with no gala become this gala's, and past
// orders move to their own gala's copies.
await db.exec(`update orders set tier_id = 'gold' where id = 'ord-26-meri'; update sponsorship_tiers set event_id = null where id in ('gold', 'silver')`)
await db.exec(readFileSync(D + 'backend.sql', 'utf8'))
ok((await one(`select tier_id from orders where id = 'ord-26-meri'`)).tier_id === 'gold-2026', 'upgrade: a 2026 order on a shared level moves to 2026\'s copy')
ok((await one(`select count(*)::int n from sponsorship_tiers where event_id is null`)).n === 0, 'upgrade: no level is left without a gala')

// Gala admins add a level; nobody else can.
ok((await err('authenticated', RM.email, `select staff_save_level($1)`, [JSON.stringify({ name: 'X', contribution_amount: 1, included_seat_count: 1 })])) === 'forbidden',
  'a relationship manager cannot add a level')
const id = (await save({ name: 'Diamond — Presenting Sponsor', contribution_amount: 100000, included_seat_count: 20, tier_category: 'sponsorship',
  guaranteed_seating: true, required_materials: ['logo', 'full_page_ad'] }))[0].id
const lv = await one(`select * from sponsorship_tiers where id = $1`, [id])
ok(lv.event_id === cur && +lv.contribution_amount === 100000 && lv.included_seat_count === 20 && lv.guaranteed_seating, 'a gala admin adds a level to this gala')
ok((await one(`select count(*)::int n from audit_log where action = 'level.created' and entity_id = $1`, [id])).n === 1, 'and it is logged')
ok((await err('authenticated', ADMIN.email, `select staff_save_level($1)`, [JSON.stringify({ name: 'diamond — presenting sponsor', contribution_amount: 5, included_seat_count: 1 })]))?.includes('already has a level'),
  'two levels on one gala cannot share a name')
ok((await err('authenticated', ADMIN.email, `select staff_save_level($1)`, [JSON.stringify({ name: 'Bad', contribution_amount: -1, included_seat_count: 1 })]))?.startsWith('invalid_input'),
  'a negative amount is refused')

// Editing a level: new values from now on; orders already on it keep what they were bought at; logged old and new.
const pledge = (await asAdmin(`select staff_add_pledge('Example Diamond Partners', 'Pat Lee', 'pat.lee@example.org', $1, 'wire') id`, [id]))[0].id
await save({ id, name: 'Diamond — Presenting Sponsor', contribution_amount: 120000, included_seat_count: 24, tier_category: 'sponsorship', guaranteed_seating: true, required_materials: ['logo'] })
const order = await one(`select commitment_amount, (select count(*)::int from seats where order_id = o.id) seats from orders o where id = $1`, [pledge])
ok(+order.commitment_amount === 100000 && order.seats === 20, 'an order already on the level keeps its amount and guests')
const edit = await one(`select changes from audit_log where action = 'level.updated' and entity_id = $1`, [id])
ok(edit && edit.changes.contribution_amount?.to === 120000 && edit.changes.included_seat_count?.to === 24, 'the edit is logged with old and new values')

// Retired levels leave the pickers: a new pledge can't use one; its orders keep it.
await asAdmin(`select staff_retire_level($1, true)`, [id])
ok((await err('authenticated', ADMIN.email, `select staff_add_pledge('Another Example Co', 'Sam Wu', 'sam.wu@example.org', $1, 'check')`, [id]))?.startsWith('not_found'),
  'a retired level cannot take a new pledge')
ok((await one(`select tier_id from orders where id = $1`, [pledge])).tier_id === id, 'orders already on a retired level keep it')

// Pledges, Give Lively matching and the pipeline take only this gala's levels.
ok((await err('authenticated', ADMIN.email, `select staff_add_pledge('Old Year Co', 'Lee Park', 'lee.park@example.org', 'gold-2026', 'check')`))?.startsWith('not_found'),
  "a pledge cannot use another gala's level")
ok((await err('authenticated', ADMIN.email, `select staff_set_tier_mapping('Gold Sponsor', 'gold-2026')`))?.startsWith('not_found'),
  "a Give Lively tier cannot be matched to another gala's level")

// A new gala starts from last year's levels, once; comps get the new gala's own complimentary level.
// Next year's levels are set up while this year's gala is still the current one.
await db.exec(`insert into gala_events (id, year, name, event_date, status, is_synthetic) values ('ev-2028', 2028, 'AAFE 54th Annual Gala (demo)', '2028-05-18', 'planning', true)`)
ok((await one(`select current_event_id() id`)).id === cur, "a 2028 gala in planning doesn't take over from this year's")
const offered = (await one(`select count(*)::int n from sponsorship_tiers where event_id = $1 and not retired and tier_category <> 'complimentary'`, [cur])).n
const copied = (await asAdmin(`select staff_copy_levels($1, 'ev-2028') n`, [cur]))[0].n
ok(copied === offered && copied > 0, `"start from last year's levels" copies every level still offered (${copied})`)
ok((await one(`select count(*)::int n from sponsorship_tiers where event_id = 'ev-2028' and name like 'Diamond%'`)).n === 0, 'a retired level is not copied')
ok((await err('authenticated', ADMIN.email, `select staff_copy_levels($1, 'ev-2028')`, [cur]))?.includes('already has levels'), 'copying twice is refused, so nothing doubles')
const before = (await one(`select count(*)::int n from sponsorship_tiers where event_id = $1`, [cur])).n
await save({ event_id: 'ev-2028', id: (await one(`select id from sponsorship_tiers where event_id = 'ev-2028' order by sort_order limit 1`)).id, name: 'Platinum — Lead Sponsor', contribution_amount: 60000, included_seat_count: 14, tier_category: 'sponsorship', guaranteed_seating: true, required_materials: [] })
ok(+(await one(`select contribution_amount from sponsorship_tiers where event_id = $1 and name like 'Platinum%'`, [cur])).contribution_amount !== 60000,
  "editing 2028's levels leaves 2027's as they were")
ok((await one(`select count(*)::int n from sponsorship_tiers where event_id = $1`, [cur])).n === before, "and 2027's list is unchanged")
// Once 2027 is closed, 2028 is the current gala; its first comp guest gets 2028's own complimentary level.
await db.exec(`update gala_events set status = 'closed' where id = '${cur}'`)
ok((await one(`select current_event_id() id`)).id === 'ev-2028', 'with 2027 closed, 2028 is the current gala')
ok((await err('authenticated', ADMIN.email, `select staff_save_level($1)`, [JSON.stringify({ event_id: cur, name: 'Late', contribution_amount: 1, included_seat_count: 1 })]))?.startsWith('not_found'),
  "a closed gala's levels can't be changed")
await asAdmin(`select staff_add_comp_guest($1)`, [JSON.stringify({ first_name: 'Robin', last_name: 'Example', relationship_note: 'Board referral' })])
ok((await one(`select t.event_id from orders o join sponsorship_tiers t on t.id = o.tier_id where o.event_id = 'ev-2028' and t.tier_category = 'complimentary'`))?.event_id === 'ev-2028',
  "a comp guest on the new gala gets that gala's own complimentary level")

console.log(`sponsorship levels: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
