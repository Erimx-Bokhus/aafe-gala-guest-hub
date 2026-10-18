// npm run db:drift (scripts/demo-drift.mjs, Gate 1 box 6): loading a set again gives exactly the same data, and the
// check finds what an upgrade or a person changed. Runs with npm run test:backend. Invented data only.
import { readFileSync } from 'node:fs'
import { counter, D, openTestDb } from './test-db.mjs'
import { SETS, buildLoadSql } from './demo-data.mjs'
import { compare, report, snapshotSql } from './demo-drift.mjs'

const { db, as } = await openTestDb()
const count = counter(), ok = count.ok
const backend = readFileSync(D + 'backend.sql', 'utf8')
const load = async (set) => { await db.exec(buildLoadSql(set)); await db.exec(backend) }
const snap = async () => (await db.query(snapshotSql())).rows[0].s

// ---- The same set, loaded again, is the same data: what a load stamps itself (times, the pipeline's new ids,
// transaction numbers) is all that differs, and the check sets exactly that aside.
for (const set of Object.keys(SETS)) {
  await load(set)
  const first = await snap()
  await new Promise((r) => setTimeout(r, 1100))   // so a time a load stamps would differ
  await db.query(`update gala_events set givelively_page_name = 'AAFE Gala 2027' where id = 'ev-2027'`)   // staff set it; a load keeps it
  await load(set)
  const diff = compare(first, await snap())
  ok(Object.keys(diff).length === 0, `${set}: loaded twice, the same data (${JSON.stringify(diff).slice(0, 300)})`)
}

// ---- What it finds, on the full gala as AAFE will see it
await load('full-fixed')
const set = await snap()
const live = async (sql) => { await db.exec(sql); return snap() }
// The two drifts of the old upgrade steps: every sponsorship marked as coming with a table (Friend doesn't), and a
// past gala's level copied at this year's price.
const upgraded = compare(set, await live(`update sponsorship_tiers set guaranteed_seating = true where tier_category = 'sponsorship';
  update sponsorship_tiers set contribution_amount = 30000 where id = 'gold-2025'`))
const tiers = upgraded.sponsorship_tiers?.changed ?? []
ok(tiers.some((c) => c.id === 'friend-2025' && c.fields.guaranteed_seating?.set === false && c.fields.guaranteed_seating?.project === true),
  'a level marked as coming with a table that the set says doesn\'t')
ok(tiers.some((c) => c.id === 'gold-2025' && Number(c.fields.contribution_amount?.set) === 25000 && Number(c.fields.contribution_amount?.project) === 30000),
  "a past gala's level at this year's price")
ok(Object.keys(upgraded).join() === 'sponsorship_tiers' && tiers.every((c) => Object.keys(c.fields).every((k) => k === 'guaranteed_seating' || k === 'contribution_amount')),
  'and nothing else')
await load('full-fixed')

// What a person did since the load: a check-in added, an email row gone, a guest's name edited, a pipeline stage moved.
const g = (await db.query(`select g.id from guests g join orders o on o.id = g.order_id where o.event_id = current_event_id() order by g.id limit 1`)).rows[0].id
await as('authenticated', 'mei.ortiz@aafe-demo.example.org', `select staff_check_in($1, 'search')`, [g])
const used = compare(set, await live(`
  delete from email_log where id = 'em-001';
  update guests set display_name = 'Edited Name' where id = '${g}';
  update audit_log set at = at + interval '1 day' where id = 1;
  select write_audit('staff', 'Mei Ortiz', 'prospect', 'pr-test', null, 'prospect.stage', 'lead', 'asked', false, 'Moved by hand.')`))
ok(used.check_ins?.added.length === 1, 'a check-in since the load')
ok(used.email_log?.missing.join() === 'em-001', 'a row of the set gone')
ok(used.guests?.changed.find((c) => c.id === g)?.fields.display_name?.project === 'Edited Name', "a guest's name edited")
ok((used.audit_log?.added.length ?? 0) > 0, 'a staff change in the pipeline is drift, unlike the pipeline built at load')
ok(used.audit_log?.changed.some((c) => c.id === '1' && c.fields.at), "a change-log line of the set edited: only the load's own lines are set aside")
await load('full-fixed')

// A field only one side has: the project's backend.sql is older than this checkout's.
const older = await snap()
for (const p of older.payments) delete p.check_number
const behind = compare(set, older)
ok(behind.payments?.onlyInSet.join() === 'check_number' && behind.payments.changed.length === 0, "a field the project doesn't have yet")
ok(/fields the project doesn't have: check_number \(run npm run db:backend\)/.test(report(behind, 'full-fixed')), 'and the report says to run db:backend')
ok(/matches "Full gala, fixed" exactly/.test(report(compare(set, await snap()), 'full-fixed')), 'no drift: the report says it matches')
ok(/npm run db:load -- full-fixed/.test(report(upgraded, 'full-fixed')), 'drift: the report says how to make it match')

console.log(`demo drift: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
