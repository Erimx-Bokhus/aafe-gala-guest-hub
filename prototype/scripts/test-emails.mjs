// Email tests: payment confirmations, guest-list reminders, and the approval queue in the database,
// plus the wording in supabase/functions/_shared/emails.ts. Every email is a draft until staff approve
// it (hard rule 4).  Runs with npm run test:backend.
import { counter, openTestDb } from './test-db.mjs'
import { guestListReminderEmail, longDay, money, paymentReceiptEmail, portalLinkEmail, qrInvitationEmail }
  from '../supabase/functions/_shared/emails.ts'
const { db, as, err } = await openTestDb()
const count = counter(), ok = count.ok
const q = async (sql, params) => (await db.query(sql, params)).rows

const ADMIN = 'mei.ortiz@aafe-demo.example.org', RM = 'daniel.seo@aafe-demo.example.org'
const VOL = (await q(`select email from staff_users where role = 'check_in_volunteer'`))[0].email
// Deadlines 30 days out, so these tests keep working after the demo gala's real deadline passes.
await db.exec(`update gala_events set guest_list_deadline = (now() + interval '30 days')::date where id = current_event_id();
  update orders set guest_list_deadline = (now() + interval '30 days')::date where event_id = current_event_id();`)
ok((await q(`select count(*)::int n from pg_proc where proname = 'enqueue_email'`))[0].n === 1, 'one enqueue_email after re-running backend.sql')

// ---- Payment confirmation: a draft for every payment staff record
const before = (await q(`select count(*)::int n from email_log where template = 'payment_receipt'`))[0].n
const pay = (await as('authenticated', RM, `select staff_record_payment('ord-meridian', 'check', 5000, '2026-10-02', '4471') id`))[0].id
const receipt = (await q(`select * from email_log where payment_id = $1`, [pay]))[0]
ok(receipt?.template === 'payment_receipt' && receipt.order_id === 'ord-meridian' && receipt.status === 'queued', 'recording a payment queues a payment confirmation')
ok(receipt?.approved_at === null && receipt.approved_by === null, 'the confirmation is a draft until staff approve it')
ok((await q(`select count(*)::int n from email_log where template = 'payment_receipt'`))[0].n === before + 1, 'exactly one confirmation per payment')
await as('service_role', null, `select email_mark_sent($1)`, [receipt.id])
ok((await q(`select status from email_log where id = $1`, [receipt.id]))[0].status === 'queued', 'an unapproved confirmation is never sent')
await as('authenticated', RM, `select staff_approve_email($1)`, [receipt.id])
await as('service_role', null, `select email_mark_sent($1)`, [receipt.id])
ok((await q(`select status from email_log where id = $1`, [receipt.id]))[0].status === 'sent', 'an approved confirmation is sent')
const sentLog = (await q(`select guest_visible, summary from audit_log where entity_id = $1 and action = 'payment_receipt.sent'`, [receipt.id]))[0]
ok(sentLog?.guest_visible === true && sentLog.summary === 'Payment confirmation emailed.', "the sponsor's activity list shows the confirmation was emailed")

// ---- Guest-list reminders: drafts for sponsors with unnamed seats, a link, and time left
await db.query(`update orders set guest_list_deadline = (now() at time zone 'America/New_York')::date - 1 where id = 'ord-pacific'`)  // deadline was yesterday (New York)
ok((await err('authenticated', VOL, `select staff_queue_guest_list_reminders()`)) === 'forbidden', 'volunteers cannot draft reminders')
const drafted = (await as('authenticated', RM, `select staff_queue_guest_list_reminders() n`))[0].n
const reminders = await q(`select order_id, to_email, approved_at from email_log where template = 'guest_list_reminder' and status = 'queued' order by order_id`)
const drafts = reminders.filter((r) => r.order_id !== 'ord-acme').map((r) => r.order_id)
ok(drafted === 4 && JSON.stringify(drafts) === JSON.stringify(['ord-brooks', 'ord-harborline', 'ord-meridian', 'ord-northgate']),
  `reminders only for unnamed seats, a sent link, and a deadline not passed: ${drafts}`)
ok(reminders.filter((r) => r.order_id === 'ord-acme').length === 1, 'a sponsor with a reminder already waiting gets no second one')
ok(reminders.every((r) => r.approved_at === null), 'reminders are drafts until staff approve them')
ok((await q(`select to_email from email_log where template = 'guest_list_reminder' and order_id = 'ord-brooks' and status = 'queued'`))[0].to_email
  === (await q(`select s.primary_contact_email e from orders o join sponsors s on s.id = o.sponsor_id where o.id = 'ord-brooks'`))[0].e, 'reminder goes to the sponsor contact')
ok((await as('authenticated', RM, `select staff_queue_guest_list_reminders() n`))[0].n === 0, 'running it again drafts nothing new')
ok((await q(`select count(*)::int n from audit_log where action = 'email.reminders_drafted'`))[0].n === 1, 'drafting reminders is logged once (none drafted the second time)')

// Sending a reminder replaces the sponsor's link: the new one works, the old one stops.
const brooks = (await q(`select id from email_log where template = 'guest_list_reminder' and order_id = 'ord-brooks' and status = 'queued'`))[0].id
await db.query(`update orders set portal_token = hash_token('brooks-old-link') where id = 'ord-brooks'`)
ok((await err('anon', null, `select portal_get_view('brooks-old-link')`)) === null, 'the link before the reminder works')
await as('authenticated', ADMIN, `select staff_approve_email($1)`, [brooks])
await as('service_role', null, `select email_mark_sent($1, hash_token('brooks-reminder-link'))`, [brooks])
ok((await err('anon', null, `select portal_get_view('brooks-reminder-link')`)) === null, "the reminder's new link works")
ok((await err('anon', null, `select portal_get_view('brooks-old-link')`))?.includes('invalid_link'), 'and the old link stops working (Gate 2)')
ok((await q(`select count(*)::int n from orders where id = 'ord-brooks' and portal_token = hash_token('brooks-reminder-link')
  and portal_token_expires_at > now()`))[0].n === 1, 'the new link expires at the deadline like any link')
ok((await as('authenticated', RM, `select staff_queue_guest_list_reminders() n`))[0].n === 0, 'no new reminder within a week of the last one')
ok((await as('authenticated', RM, `select staff_queue_guest_list_reminders(0) n`))[0].n === 1, 'staff can choose a shorter gap')
await db.exec(`update seats set status = 'cancelled' where order_id = 'ord-northgate' and status = 'unnamed'`)
await db.exec(`delete from email_log where template = 'guest_list_reminder' and order_id = 'ord-northgate'`)
ok((await as('authenticated', RM, `select staff_queue_guest_list_reminders(0) n`))[0].n === 0, 'a sponsor with every seat named gets no reminder')

// ---- The approval queue
ok((await err('authenticated', VOL, `select staff_email_queue()`)) === 'forbidden', 'volunteers cannot see the email queue')
const queue = (await as('authenticated', RM, `select staff_email_queue() q`))[0].q
const unsent = (await q(`select count(*)::int n from email_log where status = 'queued'`))[0].n
ok(queue.length === unsent && unsent > 0, `the queue lists every unsent email (${queue.length})`)
const firstApproved = queue.findIndex((e) => e.state !== 'draft')
ok(queue.slice(0, firstApproved === -1 ? queue.length : firstApproved).every((e) => e.state === 'draft')
  && queue.slice(firstApproved === -1 ? queue.length : firstApproved).every((e) => e.state !== 'draft'), 'drafts come first')
const rem = queue.find((e) => e.template === 'guest_list_reminder' && e.order_id === 'ord-harborline')
ok(rem?.organization && rem.seats_unnamed === 8 && rem.seats_total > 0 && rem.deadline, 'a reminder shows the sponsor, unnamed seats, and deadline')
await as('authenticated', RM, `select staff_record_payment('ord-acme', 'ach_direct', 1000, '2026-10-05')`)
const conf = (await as('authenticated', RM, `select staff_email_queue() q`))[0].q.find((e) => e.template === 'payment_receipt')
ok(conf?.payment?.amount === 1000 && conf.payment.method === 'ach_direct' && conf.state === 'draft', 'a confirmation shows the payment it confirms')
await db.exec(`update email_log set approved_at = now(), approved_by = 'test', attempts = 5, last_error = 'Resend HTTP 500' where id = '${conf.id}'`)
const failed = (await as('authenticated', RM, `select staff_email_queue() q`))[0].q.find((e) => e.id === conf.id)
ok(failed?.state === 'failed' && failed.last_error === 'Resend HTTP 500', 'an email that stopped retrying shows as failed, with the error')

// ---- Claiming before sending (send-emails): overlapping runs never send the same email
const claim = async (n = 25) => (await as('service_role', null, `select id from email_claim($1)`, [n])).map((r) => r.id)
ok(/permission denied/.test(await err('authenticated', ADMIN, `select email_claim(25)`) ?? ''), 'only the email worker can claim emails, not signed-in staff')
await db.exec(`update email_log set claimed_at = null, attempts = 0 where status = 'queued'`)
const pending = (await q(`select id from email_log where status = 'queued' and approved_at is not null order by id`)).map((r) => r.id)
const unapproved = (await q(`select id from email_log where status = 'queued' and approved_at is null`)).map((r) => r.id)
ok(pending.length >= 1 && unapproved.length >= 1, `test data has approved emails (${pending.length}) and drafts (${unapproved.length})`)
const run1 = await claim(1000)
ok(JSON.stringify([...run1].sort()) === JSON.stringify(pending), 'a run claims every approved, unsent email')
ok(!run1.some((id) => unapproved.includes(id)), 'a draft waiting for staff approval is never claimed')
ok((await claim(1000)).length === 0, 'an overlapping run gets nothing the first run is already sending')
await as('service_role', null, `select email_mark_failed($1, 'Resend HTTP 500')`, [run1[0]])
ok(JSON.stringify(await claim(1000)) === JSON.stringify([run1[0]]), 'a failed email is released and the next run retries it')
if (run1.length > 1) {
  await as('service_role', null, `select email_mark_sent($1)`, [run1[1]])
  ok(!(await claim(1000)).includes(run1[1]), 'a sent email is never claimed again')
}
await db.exec(`update email_log set claimed_at = now() - interval '11 minutes' where id = '${run1[0]}'`)
ok((await claim(1000)).includes(run1[0]), 'a claim left by a run that died (over 10 minutes old) can be claimed again')
await db.exec(`update email_log set claimed_at = null where status = 'queued'`)
ok((await claim(1)).length === 1, 'a run claims no more than its batch size')
await db.exec(`update email_log set claimed_at = null where status = 'queued'`)

// ---- Wording (supabase/functions/_shared/emails.ts)
const event = { name: 'AAFE Gala 2027', event_date: '2027-05-13', doors_time: '6:00 PM', venue_name: 'Harbor Hall', venue_address: '1 Pier Rd' }
const link = 'https://gala.example.org/#/s/abc_DEF-123'
const r1 = guestListReminderEmail({ toName: 'Dana <Choi>', tierName: 'Gold Sponsor', event, deadline: '2027-04-23', link, unnamed: 3, total: 10 })
ok(r1.subject === 'Reminder: 3 guest names still needed for AAFE Gala 2027', 'reminder subject counts names: ' + r1.subject)
ok(r1.html.includes('3 of your 10 seats still need a guest name') && r1.html.includes('April 23') && r1.html.includes(link), 'reminder says how many seats, the deadline, and the link')
ok(r1.html.includes('Dana &lt;Choi&gt;') && !r1.html.includes('<Choi>'), 'names are HTML-escaped')
ok(guestListReminderEmail({ toName: 'A', tierName: null, event, deadline: null, link, unnamed: 1, total: 1 }).subject.includes('1 guest name still'), 'one name: singular')

const r2 = paymentReceiptEmail({ toName: 'Pat Lee', event, amount: 10000, method: 'check', receivedAt: '2026-10-02T16:00:00Z', checkNumber: '4471', commitment: 30000, paidToDate: 10000 })
ok(r2.subject === 'Payment received for AAFE Gala 2027', 'confirmation subject')
ok(r2.html.includes('check (check #4471)') && r2.html.includes('$10,000.00') && r2.html.includes('October 2') && r2.html.includes('$20,000.00'),
  'confirmation shows method, check number, amount, date, and balance')
ok(r2.html.includes('not a tax receipt'), 'confirmation says it is not a tax receipt (Give Lively and AAFE handle those)')
const r3 = paymentReceiptEmail({ toName: 'Pat Lee', event, amount: 5000, method: 'ach_direct', receivedAt: '2026-10-03T02:30:00Z', checkNumber: '99', commitment: 5000, paidToDate: 5000 })
ok(r3.html.includes('bank transfer (ACH)') && !r3.html.includes('#99') && r3.html.includes('Paid in full'), 'ACH: no check number; fully paid says so')
ok(r3.html.includes('October 2'), '10:30 PM in New York is still October 2')

const r4 = portalLinkEmail({ toName: 'Pat', tierName: 'Gold Sponsor', event, deadline: '2027-04-23', link })
ok(r4.subject === 'Add your guests for AAFE Gala 2027' && r4.html.includes('by <strong>April 23</strong>') && r4.html.includes(link), 'guest-list link email unchanged')
const r5 = qrInvitationEmail({ firstName: 'Rep', event, code: 'AAFE-0123456789ABCDEF0123456789ABCDEF' })
ok(r5.html.includes('AAFE-0123456789ABCDEF0123456789ABCDEF') && r5.html.includes('Thursday, May 13, 2027, doors 6:00 PM'), 'QR invitation shows the code and the date')
ok(money(1234.5) === '$1,234.50' && longDay('2027-04-23') === 'April 23', 'money and date formats')

// ---- Gate 2 review (Oct 15)
// A QR invitation not sent yet is discarded when the guest's name or email changes: sending it would issue a working
// code to the old address, admitting whoever now holds the seat.
const invite = (await as('authenticated', RM, `select staff_send_qr_invite('g-019') id`))[0].id
await as('authenticated', RM, `select staff_update_guest('g-019', '{"email": "new.guest@example.org"}')`)
ok((await q(`select status from email_log where id = $1`, [invite]))[0].status === 'cancelled', "the queued invitation is discarded when the guest's email changes")
await as('service_role', null, `select email_mark_sent($1, hash_token('OLDINVITE01'))`, [invite])
ok((await err('authenticated', VOL, `select staff_check_in_qr('OLDINVITE01')`))?.startsWith('not_found'), "and its code, if it went out anyway, admits nobody")
ok((await q(`select count(*)::int n from audit_log where entity_id = 'g-019' and action = 'email.cancelled'`))[0].n === 1, 'the discarded invitation is logged')

// A missing expiry date never means "forever".
await db.query(`update orders set portal_token = hash_token('no-expiry-link'), portal_token_expires_at = null where id = 'ord-acme'`)
ok((await err('anon', null, `select portal_get_view('no-expiry-link')`))?.includes('invalid_link'), 'a sponsor link with no expiry date does not work')
await db.query(`update seats set qr_token_hash = hash_token('NOEXPIRY01'), qr_token_expires_at = null where id = 'seat-ord-acme-1'`)
ok((await err('authenticated', VOL, `select staff_check_in_qr('NOEXPIRY01')`))?.startsWith('expired'), 'a QR code with no expiry date checks nobody in')

console.log(`emails: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
