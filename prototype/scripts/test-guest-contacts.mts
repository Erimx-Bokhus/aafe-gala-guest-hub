// After the gala (data-handling.md, "Retention"; Gate 2's last box): guests' contact details deleted, every copy, once,
// by a gala admin (staff_delete_guest_contacts) or by the daily retention_sweep() retention_days() after the gala. Names
// and sponsors' own contact details stay. Runs with npm run test:backend. Invented data only.
import { readFileSync } from 'node:fs'
// @ts-expect-error plain JavaScript helper
import { counter, D, openTestDb } from './test-db.mjs'
// @ts-expect-error plain JavaScript helper
import { buildLoadSql } from './demo-data.mjs'

const { db, as, err } = await openTestDb()
const count = counter(), ok = count.ok
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as any[]
const one = async (sql: string, params: unknown[] = []) => (await q(sql, params))[0]
const backend = readFileSync(D + 'backend.sql', 'utf8')
const ADMIN = 'mei.ortiz@aafe-demo.example.org', RM = 'daniel.seo@aafe-demo.example.org'
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const ev = (await one(`select current_event_id() id`)).id
const other = 'ev-2026'
const ofGala = (gala: string) => `(select g.id from guests g join orders o on o.id = g.order_id where o.event_id = '${gala}')`
const dateBack = (gala: string, days: number) => q(`update gala_events set event_date = (now() at time zone 'America/New_York')::date - $2::int where id = $1`, [gala, days])

// ---- Copies of contact details around one gala, plus another gala's, to show only the one is touched
const g1 = (await one(`select g.id from guests g join orders o on o.id = g.order_id where o.event_id = $1 order by g.id limit 1`, [ev])).id
await as('authenticated', ADMIN, `select staff_update_guest($1, $2::jsonb)`, [g1, JSON.stringify({ email: 'moved.guest@example.org', title: 'Director of Testing' })])
const order = (await one(`select order_id from guests where id = $1`, [g1])).order_id
await q(`update orders set imported_guest_text = 'Ana Ruiz (ana.ruiz@example.org), Bo Li' where id = $1`, [order])
await q(`insert into import_review (id, event_id, reason, details) values ('rev-contact-1', $1, 'email_name_conflict', $2)`,
  [ev, JSON.stringify({ email: 'buyer.conflict@example.org', names: ['Ana Ruiz', 'Ana R. Ruiz'] })])
const txn = (await one(`select p.givelively_transaction_id t from payments p join orders o on o.id = p.order_id where o.event_id = $1 and p.givelively_transaction_id is not null limit 1`, [ev]))?.t
if (txn) await q(`insert into givelively_raw (transaction_id, payload, import_status) values ($1, $2, 'imported') on conflict do nothing`, [txn, JSON.stringify({ email: 'raw.buyer@example.org' })])
const otherOrder = (await one(`select id from orders where event_id = $1 order by id limit 1`, [other])).id
await q(`insert into guests (id, order_id, first_name, last_name, display_name, guest_type, last_updated_by, email) values ('g-other-gala', $1, 'Other', 'Gala', 'Other Gala', 'sponsor_guest', 'staff', 'other.gala@example.org')`, [otherOrder])
// An email to a guest still waiting for approval: it can't go once the address is gone.
await q(`select enqueue_email('qr_invitation', 'waiting.guest@example.org', 'Waiting Guest', $1, $2, 'test')`, [order, g1])
const sponsorsBefore = JSON.stringify(await q(`select id, primary_contact_email, phone from sponsors order by id`))
const sponsorMailBefore = (await one(`select count(*)::int n from email_log where guest_id is null and to_email <> '' and order_id in (select id from orders where event_id = $1)`, [ev])).n
const guestMail = (await one(`select count(*)::int n, count(*) filter (where status = 'queued')::int queued from email_log where guest_id in ${ofGala(ev)} and to_email <> ''`)).n
ok(guestMail > 0 && txn && (await one(`select count(*)::int n from email_log where guest_id in ${ofGala(ev)} and status = 'queued'`)).n > 0, `before: guests' emails, ${guestMail} email(s) to guests, a review item, a guest list and a Give Lively record with addresses`)

// ---- Refused before the gala, and for anyone but a gala admin
ok(/hasn't happened yet/.test((await err('authenticated', ADMIN, `select staff_delete_guest_contacts($1)`, [ev])) ?? ''), 'before the gala: refused')
ok((await err('authenticated', RM, `select staff_delete_guest_contacts($1)`, [ev])) === 'forbidden', 'a relationship manager cannot do it')
for (const fn of ['retention_sweep()', `retention_days()`]) {
  ok(/permission denied/.test((await err('authenticated', ADMIN, `select ${fn}`)) ?? ''), `the apps cannot call ${fn}`)
}
ok((await one(`select retention_days() d`)).d === 60, 'the window is 60 days, the proposed default (one place to change it)')

// ---- A gala admin deletes them after the gala
await dateBack(ev, 1)
const r = (await as('authenticated', ADMIN, `select staff_delete_guest_contacts($1) r`, [ev]))[0].r
ok(r.guests > 0 && r.emails === guestMail && r.review_items === 1 && r.guest_lists === 1 && r.givelively_records === 1 && r.needs_cleared === true,
  `after the gala: ${JSON.stringify(r)}`)
ok((await one(`select count(*)::int n from guests where id in ${ofGala(ev)} and email is not null`)).n === 0, "no guest of the gala keeps an email")
const changes = (await one(`select changes from audit_log where entity_id = $1 and changes ? 'email' order by id desc limit 1`, [g1])).changes
ok(changes.email === 'deleted after the gala' && changes.title?.to === 'Director of Testing', 'the change log keeps that the email changed, not what it was, and the rest of the edit')
ok((await one(`select count(*)::int n from audit_log where entity = 'guest' and changes::text ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}' and (entity_id in ${ofGala(ev)} or order_id in (select id from orders where event_id = $1))`, [ev])).n === 0,
  "no guest's address is left in the gala's change log")
const mail = await one(`select count(*) filter (where to_email <> '')::int left_, count(*) filter (where status = 'queued')::int queued from email_log where guest_id in ${ofGala(ev)}`)
ok(mail.left_ === 0 && mail.queued === 0, "emails to the gala's guests keep no address, and one still waiting is cancelled")
ok((await one(`select count(*)::int n from email_log where guest_id is null and to_email <> '' and order_id in (select id from orders where event_id = $1)`, [ev])).n === sponsorMailBefore,
  "emails to sponsors keep theirs: sponsors' contact details are AAFE's relationship records")
const review = (await one(`select details from import_review where id = 'rev-contact-1'`)).details
ok(!EMAIL.test(JSON.stringify(review)) && review.names?.length === 2, 'review items keep the names, not the address')
ok((await one(`select imported_guest_text t from orders where id = $1`, [order])).t === 'Ana Ruiz (deleted after the gala), Bo Li', "Give Lively's guest list keeps the names, not the address")
ok((await one(`select count(*)::int n from givelively_raw where transaction_id = $1`, [txn])).n === 0, "Give Lively's raw record of the purchase is deleted")
ok((await one(`select count(*)::int n from gala_need_totals where event_id = $1`, [ev])).n > 0
  && (await one(`select count(*)::int n from guests where id in ${ofGala(ev)} and (dietary_needs is not null or accessibility_needs is not null)`)).n === 0,
  'food and access answers go too, their totals saved first')
ok((await one(`select email from guests where id = 'g-other-gala'`)).email === 'other.gala@example.org' && JSON.stringify(await q(`select id, primary_contact_email, phone from sponsors order by id`)) === sponsorsBefore,
  "another gala's guests and every sponsor's contact details are untouched")
ok((await one(`select count(*)::int n from guests where id in ${ofGala(ev)} and coalesce(display_name, '') = ''`)).n === 0, 'guests keep their names')
const line = await one(`select actor, summary from audit_log where action = 'gala.contacts_deleted' order by id desc limit 1`)
ok(line?.actor === 'Mei Lin Ortiz' && /contact details of .* deleted: \d+ guest email/.test(line.summary), `one change-log line, in the admin's name: "${line?.summary}"`)
ok((await one(`select contacts_deleted_at is not null d from gala_events where id = $1`, [ev])).d
  && /already deleted/.test((await err('authenticated', ADMIN, `select staff_delete_guest_contacts($1)`, [ev])) ?? ''), 'once per gala: recorded, and a second run is refused')

// ---- The daily job: nothing before the window, everything at it, once
await db.exec(buildLoadSql('small')); await db.exec(backend)
const sweep = async () => (await q(`select retention_sweep() r`))[0].r as any[]
await dateBack(ev, 59)
ok((await sweep()).length === 0 && (await one(`select count(*)::int n from guests where id in ${ofGala(ev)} and email is not null`)).n > 0, 'day 59: nothing is deleted')
await dateBack(ev, 60)
const swept = await sweep()
ok(swept.length === 1 && swept[0].gala === ev && swept[0].guests > 0 && swept[0].needs_cleared === true, `day 60: the gala's contact details are deleted (${JSON.stringify(swept[0])})`)
ok((await one(`select actor_type, actor from audit_log where action = 'gala.contacts_deleted' order by id desc limit 1`)).actor === 'Retention, 60 days after the gala',
  'by the system, logged like a staff run')
ok((await sweep()).length === 0, 'the next day: nothing to do')
await q(`update guests set email = 'late.edit@example.org' where id = (select g.id from guests g join orders o on o.id = g.order_id where o.event_id = $1 order by g.id limit 1)`, [ev])
const late = await sweep()
ok(late.length === 1 && late[0].guests === 1 && (await one(`select count(*)::int n from guests where id in ${ofGala(ev)} and email is not null`)).n === 0,
  'an email added to that gala later, by a late edit, goes the next day too')
ok((await one(`select count(*)::int n from gala_events where id <> $1 and contacts_deleted_at is not null`, [ev])).n === 0,
  'past galas with nothing to delete are left alone (the demo sets have no past guests, so the job changes nothing there)')

console.log(`guest contacts: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
