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
// orders move to their own gala's copies. Such a database has shared levels and no record of the step (schema_upgrades).
const BEFORE_THE_STEP = `delete from schema_upgrades where id = '2026-10-14 levels per gala';`
await db.exec(`update orders set tier_id = 'gold' where id = 'ord-26-meri'; update sponsorship_tiers set event_id = null where id in ('gold', 'silver'); ${BEFORE_THE_STEP}`)
await db.exec(readFileSync(D + 'backend.sql', 'utf8'))
ok((await one(`select tier_id from orders where id = 'ord-26-meri'`)).tier_id === 'gold-2026', 'upgrade: a 2026 order on a shared level moves to 2026\'s copy')
ok((await one(`select count(*)::int n from sponsorship_tiers where event_id is null`)).n === 0, 'upgrade: no level is left without a gala')
// With next year's gala already in planning, the upgrade still gives shared levels to this year's gala, by the same rule
// as current_event_id(), and orders them by amount (review of #133).
await db.exec(`insert into gala_events (id, year, name, event_date, status, is_synthetic) values ('ev-2099', 2099, 'Planning test gala (demo)', '2099-05-21', 'planning', true);
  update sponsorship_tiers set event_id = null, sort_order = 0 where id = 'silver'; ${BEFORE_THE_STEP}`)
await db.exec(readFileSync(D + 'backend.sql', 'utf8'))
const silver = await one(`select event_id, sort_order from sponsorship_tiers where id = 'silver'`)
ok(silver.event_id === cur, `upgrade with a planning gala: shared levels go to this year's gala, not next year's (${silver.event_id})`)
ok(silver.sort_order > 0, 'upgraded levels are ordered by amount, not alphabetically')
await db.exec(`delete from gala_events where id = 'ev-2099'`)

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
ok((await err('authenticated', RM.email, `select staff_save_prospect($1)`, [JSON.stringify({ organization: 'Old Year Prospect Co', contact_name: 'Kim Lee', ask_tier_id: 'gold-2026' })]))
  ?.startsWith('not_found'), "a prospect cannot ask for another gala's level")
// Give Lively purchases land only on this gala's levels still offered: a prepared level from another gala is ignored and
// the name decides; a retired level takes no new orders, by prepared id or by name (CSV, sync and mapping alike).
const glRow = (txn, over) => ({ txn, email: `${txn.toLowerCase()}@levels.example.org`, date: '2026-10-07T15:00:00Z', first: 'Robin', last: 'Levels', company: '',
  campaign: 'AAFE Gala 2027', ticket_level: 'Gold Sponsor', method: 'Credit Card', status: 'succeeded', quantity: 1, original: 100, gross: 100, fee: 0, net: 100, refunded: 0, ...over })
const glImp = (r) => as('service_role', null, `select gl_import($1::jsonb, 'levels test') r`, [JSON.stringify([r])])
const tierOf = async (txn) => (await one(`select o.tier_id from payments p join orders o on o.id = p.order_id where p.givelively_transaction_id = $1`, [txn]))?.tier_id ?? null
await glImp(glRow('GL-LV-OLD', { tier_id: 'gold-2026' }))
const curGold = (await one(`select id from sponsorship_tiers where event_id = $1 and name like 'Gold%' and not retired`, [cur])).id
ok((await tierOf('GL-LV-OLD')) === curGold, `a prepared level from another gala is ignored; the name picks this gala's Gold (${await tierOf('GL-LV-OLD')})`)
await glImp(glRow('GL-LV-RETIRED-ID', { tier_id: id, ticket_level: 'Diamond — Presenting Sponsor' }))
await glImp(glRow('GL-LV-RETIRED-NAME', { ticket_level: 'Diamond Presenting Sponsor' }))
ok((await tierOf('GL-LV-RETIRED-ID')) === null && (await tierOf('GL-LV-RETIRED-NAME')) === null, 'a retired level takes no new Give Lively order, by id or by name')

// A new gala starts from last year's levels, once; comps get the new gala's own complimentary level.
// Next year's levels are set up while this year's gala is still the current one.
await db.exec(`insert into gala_events (id, year, name, event_date, status, is_synthetic) values ('ev-2028', 2028, 'AAFE 54th Annual Gala (demo)', '2028-05-18', 'planning', true)`)
ok((await one(`select current_event_id() id`)).id === cur, "a 2028 gala in planning doesn't take over from this year's")
// The Give Lively sync reads this year's page too, not the planning gala's (it read the newest open year until Oct 15).
await db.exec(`update gala_events set givelively_page_name = 'Page for 2028' where id = 'ev-2028'; update gala_events set givelively_page_name = 'Page for this year' where id = '${cur}'`)
ok((await as('service_role', null, `select sync_gala_pages() p`))[0].p.join() === 'Page for this year', "the sync reads this year's Give Lively page, not next year's")
ok((await err('authenticated', ADMIN.email, `select sync_gala_pages()`))?.includes('permission denied'), 'only the sync (service role) can call it')
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

// "Start next year's gala" (staff_start_gala): a gala admin starts a gala in planning, with last year's levels.
{
  const start = (p, who = ADMIN.email) => as('authenticated', who, `select staff_start_gala($1) id`, [JSON.stringify(p)])
  const g = { year: 2029, name: 'AAFE 55th Annual Gala (demo)', event_date: '2029-05-24', doors_time: '6:00 PM', venue_name: 'Example Hall', guest_list_deadline: '2029-05-04' }
  ok((await err('authenticated', RM.email, `select staff_start_gala($1)`, [JSON.stringify(g)])) === 'forbidden', 'a relationship manager cannot start a gala')
  ok((await err('authenticated', ADMIN.email, `select staff_start_gala($1)`, [JSON.stringify({ ...g, event_date: '2030-05-24' })]))?.includes("isn't in 2029"), 'the date must be in the gala year')
  ok((await err('authenticated', ADMIN.email, `select staff_start_gala($1)`, [JSON.stringify({ ...g, guest_list_deadline: '2029-06-01' })]))?.includes('after the gala'), 'the guest-list deadline must come before the gala')
  const id = (await start({ ...g, copy_levels_from: 'ev-2028' }))[0].id
  const row = await one(`select status, is_synthetic, event_date::text d, doors_time, venue_name from gala_events where id = $1`, [id])
  ok(id === 'ev-2029' && row.status === 'planning' && row.d === '2029-05-24' && row.doors_time === '6:00 PM' && row.venue_name === 'Example Hall', 'a gala admin starts the 2029 gala, in planning')
  ok(row.is_synthetic === true, 'a demo project gets a demo gala (demo and real never mix)')
  ok((await one(`select current_event_id() id`)).id === 'ev-2028', "the gala in planning doesn't take over from the current one")
  const levels = (await one(`select count(*)::int n from sponsorship_tiers where event_id = 'ev-2029'`)).n
  ok(levels === (await one(`select count(*)::int n from sponsorship_tiers where event_id = 'ev-2028' and not retired and tier_category <> 'complimentary'`)).n && levels > 0, `it starts with last year's levels (${levels})`)
  ok((await one(`select count(*)::int n from audit_log where action = 'gala.started' and entity_id = 'ev-2029'`)).n === 1, 'starting a gala is logged')
  ok((await err('authenticated', ADMIN.email, `select staff_start_gala($1)`, [JSON.stringify(g)]))?.includes('already a 2029 gala'), 'one gala per year')
  ok((await err('authenticated', ADMIN.email, `select staff_start_gala($1)`, [JSON.stringify({ ...g, year: 2023, event_date: '2023-05-01', guest_list_deadline: '' })]))?.includes('before the newest gala'),
    'a past year is refused')
  ok((await err('authenticated', ADMIN.email, `select staff_start_gala($1)`, [JSON.stringify({ ...g, year: 2031, event_date: '2031-05-01', program_ad_deadline: '2031-09-01' })]))
    ?.includes('program-ad deadline is after'), 'a program-ad deadline after the gala is refused')
}

// AAFE's real project starts with 2026's flyer levels (database/start-levels-2026.sql) and no demo data; a gala
// admin's first job is "Start from 2026's levels" for 2027.
{
  const { PGlite } = await import('@electric-sql/pglite')
  const real = new PGlite()
  await real.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema auth;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;`)
  for (const f of ['schema.sql', 'backend.sql', 'start-levels-2026.sql']) await real.exec(readFileSync(D + f, 'utf8'))
  const lv = (await real.query(`select name, contribution_amount::int a, included_seat_count n, guaranteed_seating t from sponsorship_tiers where event_id = 'ev-2026' order by sort_order`)).rows
  ok(lv.length === 9 && lv[0].name === 'Platinum' && lv[0].a === 50000 && lv[0].n === 12 && lv[0].t && !lv[5].t, "the real project starts with 2026's flyer levels")
  ok((await real.query(`select current_event_id() id`)).rows[0].id === 'ev-2027', 'it opens on 2027, so the staff app loads on day one')
  await real.exec(`insert into staff_users (id, name, email, role) values ('st-admin', 'Real Admin', 'admin@example.org', 'gala_admin')`)
  await real.exec(`set role authenticated; select set_config('request.jwt.claims', '{"email":"admin@example.org"}', false)`)
  const n = (await real.query(`select staff_copy_levels('ev-2026', 'ev-2027') n`)).rows[0].n
  await real.exec('reset role')
  ok(n === 9, `"Start from 2026's levels" gives 2027 the flyer's ${n} levels`)
  let refused = false
  try { await real.exec(readFileSync(D + 'seed.sql', 'utf8')) } catch { refused = true }
  ok(refused, 'demo data is refused in the real project')
}

console.log(`sponsorship levels: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
