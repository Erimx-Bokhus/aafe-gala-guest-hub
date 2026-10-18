// Gate 1 (#146): the money rules, checked for every order of every demo data set rather than one example each. An
// order's money is counted in several places: report_paid() (the reports), portal_get_view() (the sponsor portal), the
// order's status (staff_record_payment, the Give Lively import) and each payment's own amounts. The staff app counts it
// in shared/src/data.ts orderMoney; staff-app/src/money.test.ts checks that against the same rules.
// The rules, for every order:
//   paid = each payment less its refund, never below 0 (#170); never negative anywhere
//   balance = 0 for a cancelled or comp order, else commitment less paid, never below 0
//   the status agrees with the money: paid only when paid covers the commitment, part paid only when it doesn't
//   a payment: gross = amount + the fee the donor covered; net = gross - processor fee - refunds; refunds never above gross
//   the reports agree with the payments: each sponsor's paid in the sponsors report = its payments in the payments report
// and they hold before and after the actions that move money, including the ones that broke before (a payment on a
// cancelled order brought it back; Oct 12 audit). Editing a level's price never changes an order's commitment.
import { readFileSync } from 'node:fs'
import { D, counter, openTestDb } from './test-db.mjs'
import { buildLoadSql } from './demo-data.mjs'

const count = counter(), ok = count.ok
const CENT = 0.005
const num = (v) => Number(v ?? 0)

async function checkAll(db, as, label) {
  const admin = (await db.query(`select email from staff_users where role = 'gala_admin' order by email limit 1`)).rows[0].email
  const orders = (await db.query(`
    select o.id, o.event_id, o.status, o.commitment_amount c, report_paid(o.id) paid, t.tier_category cat,
           (select count(*) from payments p where p.order_id = o.id)::int n
      from orders o join sponsorship_tiers t on t.id = o.tier_id order by o.id`)).rows
  const bad = (what, list) => ok(list.length === 0, `${label}: ${what}${list.length ? ` (${list.length} wrong, e.g. ${list.slice(0, 3).join(', ')})` : ''}`)
  const expected = (o) => (['cancelled', 'comp'].includes(o.status) ? 0 : Math.max(num(o.c) - num(o.paid), 0))

  bad(`paid is never negative, ${orders.length} orders`, orders.filter((o) => num(o.paid) < 0).map((o) => o.id))
  bad('a paid order is paid in full', orders.filter((o) => o.status === 'paid' && num(o.paid) + CENT < num(o.c)).map((o) => `${o.id} ${o.paid}/${o.c}`))
  bad('a part-paid order owes something and has a payment', orders.filter((o) => o.status === 'partially_paid' && (o.n === 0 || num(o.paid) + CENT >= num(o.c))).map((o) => `${o.id} ${o.paid}/${o.c}`))
  bad('a pledged order has nothing paid', orders.filter((o) => o.status === 'pledged' && num(o.paid) > CENT).map((o) => `${o.id} ${o.paid}`))
  bad('nothing is owed on a comp order', orders.filter((o) => o.cat === 'complimentary' && !['comp', 'cancelled'].includes(o.status)).map((o) => `${o.id} ${o.status}`))

  const pays = (await db.query(`select id, original_amount a, covered_fee_amount f, gross_amount g, transaction_fee_amount fee, refunded_amount r, net_amount net from payments`)).rows
  bad(`every payment's amounts are 0 or more, ${pays.length} payments`, pays.filter((p) => [p.a, p.f, p.g, p.fee, p.r].some((v) => num(v) < 0)).map((p) => p.id))
  bad('gross = amount + the fee the donor covered', pays.filter((p) => Math.abs(num(p.a) + num(p.f) - num(p.g)) > CENT).map((p) => `${p.id} ${p.a}+${p.f}≠${p.g}`))
  bad('net = gross - processor fee - refunds, and unknown while the fee is', pays.filter((p) => (p.fee == null ? p.net != null
    : p.net == null || Math.abs(num(p.g) - num(p.fee) - num(p.r) - num(p.net)) > CENT)).map((p) => `${p.id} net ${p.net}`))
  bad('a refund is never more than the payment', pays.filter((p) => num(p.r) > num(p.g) + CENT).map((p) => `${p.id} ${p.r}>${p.g}`))

  // The sponsor portal: every open order's link shows the same paid and balance (links are stored hashed, so each
  // order gets a test link here, in this throwaway database).
  await db.exec(`update orders set portal_token = hash_token('money-' || id), portal_token_expires_at = now() + interval '1 day'`)
  const portal = []
  for (const o of orders.filter((x) => x.status !== 'cancelled')) {
    const v = (await as('anon', null, `select portal_get_view($1) v`, [`money-${o.id}`]))[0].v
    if (Math.abs(num(v.money.paid) - num(o.paid)) > CENT || Math.abs(num(v.money.balance) - expected(o)) > CENT) portal.push(`${o.id} ${v.money.paid}/${v.money.balance}`)
  }
  bad('the sponsor portal shows the same paid and balance', portal)

  // The reports, for the gala being run.
  const sponsors = (await as('authenticated', admin, `select staff_report_sponsors() r`))[0].r
  const byId = new Map(orders.map((o) => [o.id, o]))
  const current = (await db.query(`select current_event_id() e`)).rows[0].e
  const shown = orders.filter((o) => o.event_id === current && o.cat !== 'complimentary')
  ok(sponsors.length === shown.length, `${label}: the sponsors report has one row per order of the gala (${sponsors.length})`)
  const rows = (await db.query(`select o.id, sp.organization_name s from orders o join sponsors sp on sp.id = o.sponsor_id where o.event_id = $1`, [current])).rows
  const perSponsor = new Map()
  for (const r of rows) { const o = byId.get(r.id); if (o.cat !== 'complimentary') perSponsor.set(r.s, (perSponsor.get(r.s) ?? 0) + num(o.paid)) }
  const reportPaid = new Map()
  for (const r of sponsors) reportPaid.set(r.sponsor, (reportPaid.get(r.sponsor) ?? 0) + num(r.paid))
  bad('the sponsors report counts paid the same way', [...perSponsor].filter(([s, p]) => Math.abs((reportPaid.get(s) ?? 0) - p) > CENT).map(([s]) => s))
  bad('the sponsors report owes nothing on cancelled orders and never below 0',
    sponsors.filter((r) => num(r.balance) < 0 || (['cancelled', 'comp'].includes(r.status) && num(r.balance) !== 0)).map((r) => r.sponsor))
  const payments = (await as('authenticated', admin, `select staff_report_payments() r`))[0].r
  const fromPayments = new Map()
  for (const p of payments) fromPayments.set(p.sponsor, (fromPayments.get(p.sponsor) ?? 0) + Math.max(num(p.amount) - num(p.refunded), 0))
  bad('each sponsor\'s paid equals its rows in the payments report', [...reportPaid].filter(([s, p]) => Math.abs((fromPayments.get(s) ?? 0) - p) > CENT).map(([s, p]) => `${s} ${p}≠${fromPayments.get(s) ?? 0}`))
  const all = (await db.query(`select coalesce(sum(p.original_amount), 0) a, coalesce(sum(p.net_amount), 0) n from payments p join orders o on o.id = p.order_id where o.event_id = $1`, [current])).rows[0]
  ok(Math.abs(payments.reduce((s, p) => s + num(p.amount), 0) - num(all.a)) < CENT && Math.abs(payments.reduce((s, p) => s + num(p.net), 0) - num(all.n)) < CENT,
    `${label}: the payments report's totals equal the gala's payments (${payments.length} rows)`)
}

for (const set of ['small', 'full-fixed', 'full-as-sent']) {
  const { db, as } = await openTestDb()
  // As npm run db:load does: the set, then backend.sql again (it builds the pipeline and moves the id counters past the set's rows).
  if (set !== 'small') { await db.exec(buildLoadSql(set)); await db.exec(readFileSync(D + 'backend.sql', 'utf8')) }
  await checkAll(db, as, `${set}, as loaded`)

  const admin = (await db.query(`select email from staff_users where role = 'gala_admin' order by email limit 1`)).rows[0].email
  const current = (await db.query(`select current_event_id() e`)).rows[0].e
  const pick = async (where) => (await db.query(`select o.id, o.commitment_amount c from orders o join sponsorship_tiers t on t.id = o.tier_id
    where o.event_id = $1 and ${where} order by o.id limit 1`, [current])).rows[0]
  const pay = (id, amount) => as('authenticated', admin, `select staff_record_payment($1, 'check', $2, current_date, '1001')`, [id, amount])
  const status = async (id) => (await db.query(`select status from orders where id = $1`, [id])).rows[0].status

  // A pledge paid in two checks: part paid, then paid.
  const pledge = await pick(`o.status = 'pledged' and o.commitment_amount > 100 and t.tier_category <> 'complimentary'`)
  if (pledge) {
    await pay(pledge.id, num(pledge.c) / 4)
    ok(await status(pledge.id) === 'partially_paid', `${set}: a first check makes a pledge part paid`)
    await pay(pledge.id, num(pledge.c) * 3 / 4)
    ok(await status(pledge.id) === 'paid', `${set}: the rest makes it paid`)
  }
  // A check that arrives after a cancellation: recorded, and the order stays cancelled (it came back as paid before).
  const gone = await pick(`o.status <> 'cancelled' and t.tier_category <> 'complimentary'`)
  await db.exec(`update orders set status = 'cancelled' where id = '${gone.id}'`)
  await pay(gone.id, 500)
  ok(await status(gone.id) === 'cancelled', `${set}: a payment on a cancelled order keeps it cancelled`)
  // A payment on a comp order keeps it comp.
  const comp = await pick(`o.status = 'comp'`)
  if (comp) { await pay(comp.id, 50); ok(await status(comp.id) === 'comp', `${set}: a payment on a comp order keeps it comp`) }
  // A refund larger than the amount toward the commitment (the fee the donor covered comes back too), as the Give Lively
  // import records it: the whole gross refunded, the order cancelled. Paid never drops below 0.
  const refunded = (await db.query(`select p.id, p.order_id from payments p join orders o on o.id = p.order_id
    where o.event_id = $1 and o.status in ('paid', 'partially_paid') and p.covered_fee_amount > 0 order by p.id limit 1`, [current])).rows[0]
  if (refunded) {
    await db.exec(`update payments set refunded_amount = gross_amount, net_amount = - transaction_fee_amount where id = '${refunded.id}';
      update orders set status = 'cancelled' where id = '${refunded.order_id}'`)
    ok(num((await db.query(`select report_paid($1) p`, [refunded.order_id])).rows[0].p) === 0, `${set}: a refund larger than the payment leaves paid at 0, not below`)
  }
  // Every level's price raised: no order's commitment moves.
  const before = (await db.query(`select id, commitment_amount from orders order by id`)).rows
  const levels = (await db.query(`select id, name, contribution_amount, included_seat_count, tier_category, guaranteed_seating, required_materials
    from sponsorship_tiers where event_id = $1 and not retired`, [current])).rows
  for (const l of levels) {
    await as('authenticated', admin, `select staff_save_level($1)`, [JSON.stringify({ ...l, event_id: current, contribution_amount: num(l.contribution_amount) + 1000, required_materials: l.required_materials })])
  }
  const after = (await db.query(`select id, commitment_amount from orders order by id`)).rows
  ok(levels.length > 0 && JSON.stringify(before) === JSON.stringify(after), `${set}: raising all ${levels.length} levels' prices changes no order's commitment`)

  await checkAll(db, as, `${set}, after the payments, a cancellation, a refund and new prices`)
}

console.log(`money rules: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
