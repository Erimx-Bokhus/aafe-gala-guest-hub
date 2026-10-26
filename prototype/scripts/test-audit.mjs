// Every staff action leaves a change-log entry (hard rule 7): calls each staff function that changes
// data or exports it, as a role allowed to, and checks audit_log gained an entry naming that staff
// member. A new staff function fails the coverage check until it is listed here as an action or a read.
// Runs with npm run test:backend.
import { counter, openTestDb } from './test-db.mjs'
const { db, as } = await openTestDb()
const count = counter(), ok = count.ok
const q = async (sql, params) => (await db.query(sql, params)).rows

const STAFF = Object.fromEntries((await q(`select role, email, name from staff_users order by email`)).map((s) => [s.role, s]))
const ADMIN = STAFF.gala_admin, RM = STAFF.relationship_manager, VOL = STAFF.check_in_volunteer

// Setup the actions need: a QR code on a seat, a review item, and two open seats at one table.
await db.exec(`update seats set qr_token_hash = hash_token('AAFE-00000000000000000000000000TEST'), qr_token_expires_at = now() + interval '1 day'
                where guest_id = 'g-020'`)
await db.exec(`select add_import_review(null, 'test-key', 'ord-acme', 'unknown_tier', '{"tier_purchased":"Mystery"}')`)
const review = (await q(`select id from import_review where purchase_key = 'test-key'`))[0].id
const draft = (await q(`select id from email_log where status = 'queued' and approved_at is null order by id limit 1`))[0].id
const draft2 = (await q(`select id from email_log where status = 'queued' and approved_at is null and id <> $1 order by id limit 1`, [draft]))[0].id
const freeTable = (await q(`select t.id from event_tables t where t.capacity - (select count(*) from guests g where g.table_id = t.id) >= 4
                             order by t.number limit 1`))[0].id

// [function, who calls it, the call, the change-log action it must write]
const ACTIONS = [
  ['staff_update_guest', RM, `select staff_update_guest('g-021', '{"title":"Director"}')`, 'guest.updated'],
  ['staff_set_seat_status', RM, `select staff_set_seat_status('g-021', 'reviewed')`, 'seat.reviewed'],
  ['staff_assign_seat', RM, `select staff_assign_seat('g-021', '${freeTable}', (select min(n) from generate_series(1, 10) n
     where not exists (select 1 from guests where table_id = '${freeTable}' and seat_number = n)))`, 'seat.assigned'],
  ['staff_seat_order_at_table', RM, `select staff_seat_order_at_table('ord-acme', '${freeTable}')`, 'seat.assigned'],
  ['staff_mark_printed', RM, `select staff_mark_printed(array['g-019'])`, 'badge.printed'],
  ['staff_record_payment', RM, `select staff_record_payment('ord-acme', 'check', 500, '2026-10-02', '101')`, 'payment.recorded'],
  ['staff_void_payment', ADMIN, `select staff_void_payment((select id from payments where order_id = 'ord-acme' and check_number = '101' order by created_at desc limit 1), 'Audit test: entered twice')`, 'payment.voided'],
  ['staff_add_pledge', RM, `select staff_add_pledge('Audit Test Org', 'Lee Park', 'lee@audit.example.org', 'bronze', 'check', 1250)`, 'order.created'],
  ['staff_add_comp_guest', RM, `select staff_add_comp_guest('{"first_name":"Comp","last_name":"Guest","relationship_note":"Board invite"}')`, 'comp_guest.added'],
  ['staff_send_qr_invite', RM, `select staff_send_qr_invite('g-019')`, 'email.approved'],
  ['staff_resend_portal_link', RM, `select staff_resend_portal_link('ord-acme')`, 'email.approved'],
  ['staff_approve_email', RM, `select staff_approve_email('${draft}')`, 'email.approved'],
  ['staff_cancel_email', RM, `select staff_cancel_email('${draft2}')`, 'email.cancelled'],
  ['staff_queue_guest_list_reminders', RM, `select staff_queue_guest_list_reminders(0)`, 'email.reminders_drafted'],
  ['staff_resolve_import_review', RM, `select staff_resolve_import_review('${review}', 'Checked with the sponsor')`, 'import_review.resolved'],
  ['staff_import_givelively', ADMIN, `select staff_import_givelively('[]', '{"file_name":"empty.csv"}')`, 'import.csv'],
  ['staff_set_tier_mapping', ADMIN, `select staff_set_tier_mapping('Mystery', 'bronze')`, 'tier_mapping.set'],
  ['staff_set_gala_page', ADMIN, `select staff_set_gala_page('AAFE Gala 2027 (test)')`, 'gala.page_name_set'],
  ['staff_add_gala_page', ADMIN, `select staff_add_gala_page('AAFE Gala 2027 (Community Tickets, test)')`, 'gala.page_added'],
  ['staff_remove_gala_page', ADMIN, `select staff_remove_gala_page('AAFE Gala 2027 (Community Tickets, test)')`, 'gala.page_removed'],
  ['staff_check_in', VOL, `select staff_check_in('g-019')`, 'checkin.arrived'],
  ['staff_check_in_qr', VOL, `select staff_check_in_qr('aafe-00000000000000000000000000test')`, 'checkin.arrived'],
  ['staff_check_in_exception', VOL, `select staff_check_in_exception('Walk-in Guest', 'ord-acme', 'walk_in', 'Took an unnamed seat')`, 'checkin.exception'],
  ['staff_sync_check_ins', VOL, `select staff_sync_check_ins('[{"client_id":"ipad1-0001","guest_id":"g-021","method":"search","device":"Door 2"}]')`, 'checkin.arrived'],
  ['staff_undo_check_in', VOL, `select staff_undo_check_in('ipad1-0001')`, 'checkin.undone'],
  ['staff_save_prospect', RM, `select staff_save_prospect('{"organization":"Audit Prospect Co","contact_name":"Sam Rivera","ask_amount":5000}')`, 'prospect.created'],
  ['staff_set_prospect_stage', RM, `select staff_set_prospect_stage((select p.id from sponsor_prospects p join sponsors s on s.id = p.sponsor_id
     where s.organization_name = 'Audit Prospect Co'), 'reached_out')`, 'prospect.stage'],
  ['staff_set_sponsorship_goal', ADMIN, `select staff_set_sponsorship_goal(250000)`, 'gala.goal_set'],
  ['staff_save_table', ADMIN, `select staff_save_table('tb-10', 'Peony', 12)`, 'table.updated'],
  ['staff_set_sponsor_arrivals', ADMIN, `select staff_set_sponsor_arrivals(true, 'Test approval')`, 'gala.sponsor_arrivals'],
  ['staff_update_gala_event', ADMIN, `select staff_update_gala_event('{"dress_code":"Black tie (audit test)"}')`, 'event.updated'],
  ['staff_set_material_status', RM, `select staff_set_material_status('ord-acme', 'logo', 'received')`, 'materials.updated'],
  ['staff_set_order_deadline', ADMIN, `select staff_set_order_deadline('ord-acme', '2027-04-01')`, 'order.deadline_changed'],
  ['staff_save_level', ADMIN, `select staff_save_level('{"name": "Audit Test Level", "contribution_amount": 1500, "included_seat_count": 2}'::jsonb)`, 'level.created'],
  ['staff_retire_level', ADMIN, `select staff_retire_level('half_page_ad', true)`, 'level.retired'],
  ['staff_start_gala', ADMIN, `select staff_start_gala('{"year": 2100, "name": "Audit start test (demo)", "event_date": "2100-05-21"}'::jsonb)`, 'gala.started'],
  ['staff_copy_levels', ADMIN, `select staff_copy_levels('ev-2027', 'ev-audit-next')`, 'level.copied'],
  ['staff_export_badges', RM, `select * from staff_export_badges(true)`, 'export.badges'],
  ['staff_export_checkin', VOL, `select * from staff_export_checkin()`, 'export.checkin'],
  ['staff_export_salesforce', ADMIN, `select * from staff_export_salesforce()`, 'export.salesforce'],
  ['staff_report_attendance', ADMIN, `select staff_report_attendance()`, 'report.attendance'],
  ['staff_report_sponsors', RM, `select staff_report_sponsors()`, 'report.sponsors'],
  ['staff_report_needs', RM, `select staff_report_needs()`, 'report.needs'],
  ['staff_report_payments', RM, `select staff_report_payments()`, 'report.payments'],
  ['staff_report_guests', ADMIN, `select staff_report_guests()`, 'report.guests'],
  ['staff_clear_needs', ADMIN, `select staff_clear_needs('ev-2026')`, 'gala.needs_cleared'],
  ['staff_delete_guest_contacts', ADMIN, `select staff_delete_guest_contacts('ev-2026')`, 'gala.contacts_deleted'],
]
// Only read, so nothing to log.
const READS = ['staff_me', 'staff_current_event', 'staff_role', 'staff_email_queue', 'checkin_list', 'staff_checkin_snapshot', 'staff_pipeline', 'staff_sync', 'door_sync']

// Some staff reminders only draft when a sponsor's deadline is ahead; keep them ahead of today.
await db.exec(`update orders set guest_list_deadline = (now() + interval '30 days')::date where event_id = current_event_id()`)
// A later gala with no levels yet, for staff_copy_levels.
await db.exec(`insert into gala_events (id, year, name, event_date, status, is_synthetic) values ('ev-audit-next', 2099, 'Audit test gala (demo)', '2099-05-20', 'planning', true)`)

for (const [fn, who, sql, action] of ACTIONS) {
  const last = (await q(`select coalesce(max(id), 0) n from audit_log`))[0].n
  try { await as('authenticated', who.email, sql) } catch (e) { ok(false, `${fn} failed: ${e.message}`); continue }
  const rows = await q(`select actor_type, actor, action, summary from audit_log where id > $1`, [last])
  const mine = rows.filter((r) => r.action === action && r.actor_type === 'staff' && r.actor === who.name)
  ok(mine.length > 0, `${fn} is logged as ${action} by ${who.name} (got ${JSON.stringify(rows.map((r) => r.action))})`)
  ok(mine.every((r) => r.summary?.trim()), `${fn}: the entry says what happened`)
}

// Staff sending their own email are its approver: it is approved, and the log names them.
const qr = (await q(`select approved_by, approved_at from email_log where template = 'qr_invitation' and guest_id = 'g-019' order by created_at desc limit 1`))[0]
ok(qr?.approved_by === RM.name && qr.approved_at, 'a QR invitation staff send themselves is approved in their name')

// Coverage: every staff function a signed-in user can call is listed above as an action or a read.
const callable = (await q(`select proname f from pg_proc where pronamespace = 'public'::regnamespace
  and has_function_privilege('authenticated', oid, 'execute') and (proname like 'staff_%' or proname = 'checkin_list')`)).map((r) => r.f)
const listed = new Set([...ACTIONS.map((a) => a[0]), ...READS])
const missing = callable.filter((f) => !listed.has(f))
ok(missing.length === 0, `staff functions not covered by this test (add them to ACTIONS or READS): ${missing}`)

console.log(`change log: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
