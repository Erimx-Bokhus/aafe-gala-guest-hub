// #223: staff_void_payment undoes a check, ACH or wire entered by mistake. Gala admins only, with a reason; Give
// Lively payments can't be voided. The payment row goes, so every total follows; the order's status is worked out
// again (with no money left, back to what it was the last time money came in to it with none); an unsent receipt is cancelled; the
// pipeline card goes back from payment received; and the change log keeps the reason and the whole payment.
// Runs with npm run test:backend.
import { counter, openTestDb } from './test-db.mjs'
const { db, as, err } = await openTestDb()
const count = counter(), ok = count.ok
const one = async (sql, params) => (await db.query(sql, params)).rows[0]
const who = async (role) => (await one(`select email from staff_users where role = $1 order by email limit 1`, [role])).email
const ADMIN = await who('gala_admin'), RM = await who('relationship_manager'), VOL = await who('check_in_volunteer')
const cur = (await one(`select current_event_id() id`)).id
const pay = async (order, amount, check = null, user = ADMIN) =>
  (await as('authenticated', user, `select staff_record_payment($1, $2, $3, '2026-10-01', $4) id`, [order, check ? 'check' : 'wire', amount, check]))[0].id
const voidIt = async (id, why = 'Entered twice', user = ADMIN) => (await as('authenticated', user, `select staff_void_payment($1, $2) r`, [id, why]))[0].r
const order = async (id) => one(`select status, report_paid(id)::numeric paid, (select count(*) from payments where order_id = $1)::int n from orders where id = $1`, [id])

// A pledged sponsorship with no payments, and its prospect (made by the pipeline trigger when it was pledged).
const o = await one(`select o.id, o.commitment_amount::numeric c from orders o join sponsorship_tiers t on t.id = o.tier_id
  where o.event_id = $1 and o.status = 'pledged' and t.tier_category = 'sponsorship' and o.source <> 'givelively'
    and not exists (select 1 from payments p where p.order_id = o.id) order by o.id limit 1`, [cur])
ok(!!o, `a pledged sponsorship to test with (${o?.id})`)
const c = Number(o.c)

// Who may, and what it refuses.
const p1 = await pay(o.id, c, 'CHK-100')
ok((await err('authenticated', RM, `select staff_void_payment($1, 'x')`, [p1])) === 'forbidden', 'a relationship manager cannot void a payment')
ok((await err('authenticated', VOL, `select staff_void_payment($1, 'x')`, [p1])) === 'forbidden', 'a volunteer cannot void a payment')
ok((await err('authenticated', ADMIN, `select staff_void_payment($1, '  ')`, [p1]))?.startsWith('invalid_input'), 'a reason is required')
ok((await err('authenticated', ADMIN, `select staff_void_payment('pay-nope', 'x')`))?.startsWith('not_found'), 'an unknown payment is not found')
const gl = await one(`select id from payments where processor = 'stripe' limit 1`)
ok((await err('authenticated', ADMIN, `select staff_void_payment($1, 'x')`, [gl.id]))?.includes('Give Lively'), 'a Give Lively payment cannot be voided')
ok((await one(`select count(*)::int n from payments where id = $1`, [gl.id])).n === 1, '... and it is still there')

// The one payment: paid, then voided back to pledged, with every total following.
ok((await order(o.id)).status === 'paid', 'paid in full: the order is paid')
const prospect = await one(`select id, stage from sponsor_prospects where order_id = $1`, [o.id])
ok(prospect?.stage === 'payment_received', `its pipeline card is at payment received (${prospect?.stage ?? 'no card'})`)
const receipt = await one(`select id, status from email_log where payment_id = $1`, [p1])
ok(receipt?.status === 'queued', 'its receipt is queued for staff to approve')
const r1 = await voidIt(p1, 'Entered on the wrong order')
const after = await order(o.id)
ok(after.status === 'pledged' && Number(after.paid) === 0 && after.n === 0, `voided: no payments, paid 0, back to pledged (${JSON.stringify(after)})`)
ok(r1.order_status === 'pledged' && r1.receipt_cancelled === true && r1.in_salesforce === false, `the answer says so (${JSON.stringify(r1)})`)
ok((await one(`select status, payment_id from email_log where id = $1`, [receipt.id])).status === 'cancelled', 'the unsent receipt is cancelled')
ok((await one(`select stage from sponsor_prospects where id = $1`, [prospect.id])).stage === 'closed_won', 'the pipeline card goes back to closed won')
const view = await (async () => { await db.exec(`update orders set portal_token = hash_token('void-test-link'), portal_token_expires_at = now() + interval '30 days' where id = '${o.id}'`)
  return (await one(`select portal_get_view('void-test-link') v`)).v })()
// portal_get_view puts the money under `money`: read it there, so a missing field fails instead of reading as 0.
ok(view.money && Number(view.money.paid) === 0 && Number(view.money.balance) === c, `the sponsor portal shows nothing paid and the whole commitment due (${JSON.stringify(view.money)})`)
const logs = (await db.query(`select action, guest_visible, summary, changes from audit_log where entity_id = $1 and action in ('payment.voided', 'payment.corrected') order by id`, [p1])).rows
ok(logs.length === 2 && logs[0].action === 'payment.voided' && !logs[0].guest_visible && logs[0].summary.includes('Entered on the wrong order')
  && logs[0].changes?.id === p1 && Number(logs[0].changes?.original_amount) === c, 'staff log: the reason and the whole payment as it was')
ok(logs[1]?.guest_visible && !logs[1].summary.includes('wrong order'), "the sponsor's activity says it was corrected, without staff's reason")
ok((await err('authenticated', ADMIN, `select staff_void_payment($1, 'again')`, [p1]))?.startsWith('not_found'), 'voiding it again: not found')

// #222's case: the same check entered twice. Voiding one keeps the order paid by the other.
const a = await pay(o.id, c, 'CHK-200'), b = await pay(o.id, c, 'CHK-200')
ok(Number((await order(o.id)).paid) === 2 * c, 'the check entered twice counts twice')
await voidIt(b, 'Same check entered twice')
const once = await order(o.id)
ok(once.status === 'paid' && Number(once.paid) === c && once.n === 1, `void the copy: paid once, still paid (${JSON.stringify(once)})`)

// Part paid: two payments, void one, it's partly paid.
await voidIt(a, 'Reset for the next case')
const h1 = await pay(o.id, Math.round(c / 2)), h2 = await pay(o.id, c - Math.round(c / 2))
ok((await order(o.id)).status === 'paid', 'two halves: paid')
await voidIt(h2, 'Second half bounced')
ok((await order(o.id)).status === 'partially_paid', 'void one half: partly paid')
await voidIt(h1, 'Reset')

// Invoice sent before the first payment: voiding the only payment goes back to invoice sent, not pledged.
await db.exec(`update orders set status = 'invoice_sent' where id = '${o.id}'`)
const inv = await pay(o.id, c, 'CHK-300')
await voidIt(inv, 'Wrong amount')
ok((await order(o.id)).status === 'invoice_sent', 'with the only payment voided, an invoiced order is invoice sent again')

// A receipt already sent stays in the email log; it just no longer points at the payment.
const s1 = await pay(o.id, c, 'CHK-400')
await db.exec(`update email_log set status = 'sent', sent_at = now() where payment_id = '${s1}' and template = 'payment_receipt'`)
const sent = await one(`select id from email_log where payment_id = $1`, [s1])
const r2 = await voidIt(s1, 'Wrong order')
const kept = await one(`select status, payment_id from email_log where id = $1`, [sent.id])
ok(kept.status === 'sent' && kept.payment_id === null && r2.receipt_cancelled === false, 'a sent receipt stays sent, no longer linked')

// Already in Salesforce: voided here, and the answer and the log say to remove it there too.
const s2 = await pay(o.id, c, 'CHK-500')
await db.exec(`insert into salesforce_sync (entity, entity_id, sf_object, sf_id, status, last_synced_at) values ('payment', '${s2}', 'npe01__OppPayment__c', 'a01TEST', 'synced', now())`)
const r3 = await voidIt(s2, 'Wrong order')
ok(r3.in_salesforce === true, 'already sent to Salesforce: the answer says so')
ok((await one(`select summary from audit_log where entity_id = $1 and action = 'payment.voided'`, [s2])).summary.includes('Salesforce'), '... and the log says to remove it there too')

// A cancelled order stays cancelled.
const s3 = await pay(o.id, c, 'CHK-600')
await db.exec(`update orders set status = 'cancelled' where id = '${o.id}'`)
await voidIt(s3, 'Wrong order')
ok((await order(o.id)).status === 'cancelled', 'a cancelled order stays cancelled')

console.log(`void payment: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
