// After the gala (decided Oct 18, decisions.md): staff_clear_needs() saves the gala's food and access totals, counted
// exactly as the staff app counts them (countNeeds in shared/src/guestNeeds.ts), then deletes every guest's answers
// and their old values in the change log. Gate 2's data-handling box. Runs with npm run test:backend. Invented data only.
import { readFileSync } from 'node:fs'
import { countNeeds } from '../shared/src/guestNeeds.ts'
// @ts-expect-error plain JavaScript helper
import { counter, D, openTestDb } from './test-db.mjs'
// @ts-expect-error plain JavaScript helper
import { SETS, buildLoadSql } from './demo-data.mjs'

const { db, as, err } = await openTestDb()
const count = counter(), ok = count.ok
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as any[]
const backend = readFileSync(D + 'backend.sql', 'utf8')
const ADMIN = 'mei.ortiz@aafe-demo.example.org', RM = 'daniel.seo@aafe-demo.example.org'
const KINDS = ['dietary', 'accessibility'] as const
const answers = (ev: string, kind: string) => q(`select g.${kind}_needs v from guests g join orders o on o.id = g.order_id
  where o.event_id = $1 and o.status <> 'cancelled'`, [ev]).then((rows) => rows.map((r) => r.v as string | null))
/** What the staff app would show for these answers, in the shape the totals are saved in. */
function appTotals(values: (string | null)[], kind: 'dietary' | 'accessibility') {
  const c = countNeeds(values, kind)
  return Object.fromEntries([...c.byChoice.map((x) => [x.choice, x.count]), ['Any need', c.some], ['None', c.none], ['Not answered', c.unanswered]])
}
const sorted = (o: Record<string, unknown>) => JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))))
const clear = (ev: string, who = ADMIN) => as('authenticated', who, `select staff_clear_needs($1) t`, [ev]).then((r: any[]) => r[0].t)
const past = (ev: string) => q(`update gala_events set event_date = '2026-01-15' where id = $1`, [ev])

// ---- Counted as the staff app counts, on every demo set and on answers written every odd way
for (const set of Object.keys(SETS)) {
  await db.exec(buildLoadSql(set)); await db.exec(backend)
  const ev = (await q(`select current_event_id() id`))[0].id
  if (set === 'small') {
    // Odd answers: case, older names, "Yes", stray spaces and separators, free text.
    const odd = ['Vegan, Nut allergy', 'Vegan', 'None', '', null, 'Other: no mushrooms', 'Yes', 'yes', 'NO', ' none ', 'vegan', '  Halal ;  Kosher ',
      'Gluten-free,,Vegan', '\tVegan\n', '\t\n', 'None\n', 'Other', 'Step-free seating', 'Hearing loop; Wheelchair access', 'Wheelchair access, Other: ramp at side door']
    const gs = await q(`select g.id from guests g join orders o on o.id = g.order_id where o.event_id = $1 and o.status <> 'cancelled' order by g.id limit $2`, [ev, odd.length])
    for (const [i, g] of gs.entries()) await q(`update guests set dietary_needs = $2, accessibility_needs = $3 where id = $1`, [g.id, odd[i], odd[odd.length - 1 - i]])
  }
  const expected = { dietary: appTotals(await answers(ev, 'dietary'), 'dietary'), accessibility: appTotals(await answers(ev, 'accessibility'), 'accessibility') }
  await past(ev)
  const saved = await clear(ev)
  ok(KINDS.every((k) => sorted(saved[k]) === sorted(expected[k])),
    `${set}: the totals saved are the staff app's own counts (${JSON.stringify(saved.dietary).slice(0, 120)}…)`)
  ok((await q(`select count(*)::int n from guests g join orders o on o.id = g.order_id where o.event_id = $1
    and (g.dietary_needs is not null or g.accessibility_needs is not null)`, [ev]))[0].n === 0, `${set}: no guest of the gala keeps an answer`)
}

// ---- What else it deletes, and what it keeps
await db.exec(buildLoadSql('small')); await db.exec(backend)
const ev = (await q(`select current_event_id() id`))[0].id
const g = (await q(`select g.id from guests g join orders o on o.id = g.order_id where o.event_id = $1 order by g.id limit 1`, [ev]))[0].id
// A staff edit leaves the old and new answer in the change log, beside a title change in the same edit.
await as('authenticated', ADMIN, `select staff_update_guest($1, $2::jsonb)`, [g, JSON.stringify({ dietary_needs: 'Kosher, Nut allergy', accessibility_needs: 'Visual support', title: 'Director of Testing' })])
const logged = async () => (await q(`select changes from audit_log where entity_id = $1 and changes is not null order by id desc limit 1`, [g]))[0].changes
ok(JSON.stringify(await logged()).includes('Nut allergy'), 'before: the change log holds the answer, as every field edit does')
// Another gala's guest, to show only this gala is cleared.
const other = (await q(`select o.id from orders o where o.event_id <> $1 order by o.id limit 1`, [ev]))[0].id
await q(`insert into guests (id, order_id, first_name, last_name, display_name, guest_type, last_updated_by, dietary_needs) values ('g-other-gala', $1, 'Other', 'Gala', 'Other Gala', 'sponsor_guest', 'staff', 'Vegan')`, [other])

// A guest on a cancelled order of this gala: the report leaves them out, so the totals do; their answer is still deleted.
const cancelled = (await q(`select o.id from orders o where o.event_id = $1 and exists (select 1 from guests where order_id = o.id) order by o.id desc limit 1`, [ev]))[0].id
await q(`update orders set status = 'cancelled' where id = $1`, [cancelled])
await q(`update guests set dietary_needs = 'Halal, No beef' where order_id = $1`, [cancelled])
const halal = appTotals(await answers(ev, 'dietary'), 'dietary').Halal

ok(/hasn't happened yet/.test((await err('authenticated', ADMIN, `select staff_clear_needs($1)`, [ev])) ?? ''), 'before the gala: refused, nothing cleared')
ok((await q(`select dietary_needs d from guests where id = $1`, [g]))[0].d === 'Kosher, Nut allergy', 'and the answers are still there')
await past(ev)
ok((await err('authenticated', RM, `select staff_clear_needs($1)`, [ev])) === 'forbidden', 'a relationship manager cannot clear them')
const totals = await clear(ev)
ok(totals.dietary.Kosher >= 1 && totals.accessibility['Visual support'] >= 1, 'after the gala, a gala admin clears them: the totals count the edited answers')
ok(totals.dietary.Halal === halal && (await q(`select count(*)::int n from guests where order_id = $1 and dietary_needs is not null`, [cancelled]))[0].n === 0,
  "a cancelled order's guests aren't counted, and their answers are deleted too")
const after = await logged()
ok(after.dietary_needs === 'cleared after the gala' && after.accessibility_needs === 'cleared after the gala' && !JSON.stringify(after).includes('Nut allergy'),
  'the change log keeps that the answer changed, not what it was')
ok(after.title?.to === 'Director of Testing', 'and keeps the rest of the edit')
ok((await q(`select count(*)::int n from audit_log where changes::text ~ 'Nut allergy|Visual support' and (order_id in (select id from orders where event_id = $1) or entity_id = $2)`, [ev, g]))[0].n === 0,
  "no answer of this gala's guests is left anywhere in the change log")
ok((await q(`select dietary_needs d from guests where id = 'g-other-gala'`))[0].d === 'Vegan', "another gala's answers are untouched")
const line = (await q(`select summary, entity_id from audit_log where action = 'gala.needs_cleared' order by id desc limit 1`))[0]
ok(line?.entity_id === ev && /cleared for \d+ guest\(s\).*only the totals are kept/.test(line.summary), `one change-log line for it: "${line?.summary}"`)
ok(/already cleared/.test((await err('authenticated', ADMIN, `select staff_clear_needs($1)`, [ev])) ?? ''), 'once per gala: a second run is refused, so the totals stay as saved')
// Until the staff app has a button: the SQL editor route in BACKEND.md, run as the database owner, as Supabase's editor does.
await db.exec(`begin; select set_config('request.jwt.claims', '{"email": "${ADMIN}"}', true); select staff_clear_needs('ev-2026'); commit;`)
ok((await q(`select count(*)::int n from gala_need_totals where event_id = 'ev-2026'`))[0].n > 0
  && (await q(`select actor from audit_log where action = 'gala.needs_cleared' and entity_id = 'ev-2026'`))[0]?.actor === 'Mei Lin Ortiz',
  "the SQL editor route in BACKEND.md works, and logs the gala admin who ran it")
ok((await q(`select count(*)::int n from information_schema.columns where table_name = 'gala_need_totals' and column_name ~ 'guest_id|name|email'`))[0].n === 0,
  'the totals hold no person: no guest, name or email column')

console.log(`food and access totals: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
