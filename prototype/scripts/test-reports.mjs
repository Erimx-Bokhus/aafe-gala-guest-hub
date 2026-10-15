// Reports (decided Oct 14): CSV downloads AAFE charts itself. Each staff_report_* returns rows for the current gala,
// checks the role and logs the download. Who-came carries guests' emails, so gala admins only. Runs with npm run test:backend.
import { counter, openTestDb } from './test-db.mjs'
const { db, as, err } = await openTestDb()
const count = counter(), ok = count.ok
const one = async (sql, params) => (await db.query(sql, params)).rows[0]
const who = async (role) => await one(`select email, name from staff_users where role = $1 limit 1`, [role])
const ADMIN = await who('gala_admin'), RM = await who('relationship_manager'), VOL = await who('check_in_volunteer')
const report = async (fn, user = ADMIN) => (await as('authenticated', user.email, `select ${fn}() r`))[0].r
const cur = (await one(`select current_event_id() id`)).id

// Set up gala night: one guest checked in, one walk-in on a sponsor's order.
const g = await one(`select g.id, g.order_id from guests g join orders o on o.id = g.order_id where o.event_id = $1 and o.status <> 'cancelled' and g.email is not null limit 1`, [cur])
await as('authenticated', VOL.email, `select staff_check_in($1, 'search')`, [g.id])
await as('authenticated', VOL.email, `select staff_check_in_exception('Walk In Example', $1, 'walk_in', 'At the door')`, [g.order_id])

// Who came
ok((await err('authenticated', RM.email, `select staff_report_attendance()`)) === 'forbidden', "who-came has guests' emails: a relationship manager can't download it")
ok((await err('authenticated', VOL.email, `select staff_report_attendance()`)) === 'forbidden', 'a volunteer cannot download it')
const att = await report('staff_report_attendance')
const guests = (await one(`select count(*)::int n from guests g join orders o on o.id = g.order_id where o.event_id = $1 and o.status <> 'cancelled'`, [cur])).n
const walkIns = (await one(`select count(*)::int n from check_ins where event_id = $1 and guest_id is null`, [cur])).n
ok(att.length === guests + walkIns && walkIns >= 1, `one row per guest plus one per walk-in (${att.length})`)
const came = att.find((r) => r.came && r.category !== 'walk_in')
ok(came && came.email && came.checked_in_at && came.checked_in_by && came.sponsor && came.level, 'a guest who came has email, sponsor, level, time and who checked them in')
const arrived = (await one(`select count(*)::int n from check_ins where event_id = $1`, [cur])).n
ok(att.filter((r) => r.came).length === arrived, `everyone checked in shows as came (${arrived})`)
ok(att.find((r) => r.name === 'Walk In Example')?.walk_in_reason === 'walk_in', 'a walk-in is a row, with the reason')
ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(came.checked_in_at), `times are New York time, 24-hour, so they sort (${came.checked_in_at})`)
ok(att.some((r) => r.buyer_type === 'Individual'), 'a ticket bought by a person is marked Individual')

// Sponsors and money
const sp = await report('staff_report_sponsors', RM)
const orders = (await one(`select count(*)::int n from orders o join sponsorship_tiers t on t.id = o.tier_id where o.event_id = $1 and t.tier_category <> 'complimentary'`, [cur])).n
ok(sp.length === orders, `one row per sponsorship or ticket purchase (${sp.length})`)
const paid = (await one(`select coalesce(sum(greatest(p.original_amount - p.refunded_amount, 0)), 0)::numeric n from payments p join orders o on o.id = p.order_id where o.event_id = $1`, [cur])).n
ok(Math.abs(sp.reduce((t, r) => t + Number(r.paid), 0) - Number(paid)) < 0.01, 'paid adds up to every payment on the gala')
ok(sp.every((r) => Number(r.balance) === (['cancelled', 'comp'].includes(r.status) ? 0 : Math.max(Number(r.committed) - Number(r.paid), 0))), 'balance = committed - paid, never below 0; nothing owed on a cancelled order')
// A full Give Lively refund returns the covered fee too, so refunded > original: paid stays 0 and nothing is owed.
{
  const p = await one(`select p.id, p.order_id from payments p join orders o on o.id = p.order_id where o.event_id = $1 and o.status = 'paid' limit 1`, [cur])
  await db.exec(`begin; update payments set refunded_amount = original_amount + 11.30 where id = '${p.id}'; update orders set status = 'cancelled' where id = '${p.order_id}'`)
  const row = (await report('staff_report_sponsors', RM)).find((r) => r.status === 'cancelled' && Number(r.refunded) > 0)
  await db.exec('rollback')
  ok(row && Number(row.paid) === 0 && Number(row.balance) === 0, `a refunded, cancelled purchase: paid 0, balance 0 (${row?.paid}, ${row?.balance})`)
}
// An arrival from a sponsorship or ticket purchase (comps and walk-ins aren't rows of this report). A sponsor can have
// more than one order, one row each, in no set order when the amounts tie: sum their rows.
{
  const name = att.find((a) => a.came && ['sponsor_guest', 'ticket_holder'].includes(a.category)).sponsor
  ok(sp.filter((r) => r.sponsor === name).reduce((t, r) => t + Number(r.guests_came), 0) >= 1, "the guest who came counts for their sponsor")
}

// Food and access, payments, full guest list
const needs = await report('staff_report_needs', RM)
ok(needs.length === guests && needs.some((r) => r.dietary_needs) && !('email' in needs[0]), 'food and access: every guest, the answers as written, no email')
const pays = await report('staff_report_payments', RM)
ok(pays.length === (await one(`select count(*)::int n from payments p join orders o on o.id = p.order_id where o.event_id = $1`, [cur])).n, 'payments: one row per payment')
ok((await err('authenticated', RM.email, `select staff_report_guests()`)) === 'forbidden', "the full guest list has guests' emails: a relationship manager can't download it")
const full = await report('staff_report_guests')
ok(full.length === guests && full.some((r) => r.came), 'full guest list: every guest, with who came')
ok((await err('authenticated', VOL.email, `select staff_report_guests()`)) === 'forbidden', 'volunteers cannot download the guest list')

// Every download is logged.
ok((await one(`select count(*)::int n from audit_log where action like 'report.%'`)).n === 5, 'each download is in the change log')

console.log(`reports: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
