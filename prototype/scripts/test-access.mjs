// Access-rule tests: every table, view, and API function against every kind of caller, plus the
// sponsor link's limits (hard rule 6). The expected access is written out below as the policy, so a
// change to the rules has to change this file too.  Runs with npm run test:backend.
import { counter, openTestDb } from './test-db.mjs'
const { db, as, err } = await openTestDb()
const count = counter(), ok = count.ok

const ADMIN = 'mei.ortiz@aafe-demo.example.org', RM = 'daniel.seo@aafe-demo.example.org'
const VOL = (await db.query(`select email from staff_users where role = 'check_in_volunteer'`)).rows[0].email
const callers = [
  { name: 'anon (sponsor portal, no sign-in)', role: 'anon', email: null, kind: 'anon' },
  { name: 'signed-in non-staff', role: 'authenticated', email: 'stranger@example.org', kind: 'stranger' },
  { name: 'check-in volunteer', role: 'authenticated', email: VOL, kind: 'check_in_volunteer' },
  { name: 'relationship manager', role: 'authenticated', email: RM, kind: 'relationship_manager' },
  { name: 'gala admin', role: 'authenticated', email: ADMIN, kind: 'gala_admin' },
]
const byKind = (kind) => callers.find((c) => c.kind === kind)

// Run one statement as a caller inside a transaction that is always rolled back, so a probe can't
// change what the next one sees. Returns the statement's n (or 'ok'), or the error message.
async function attempt(c, sql, params = []) {
  await db.exec('begin')
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [c.email ? JSON.stringify({ email: c.email }) : ''])
    await db.exec(`set local role ${c.role}`)
    return (await db.query(sql, params)).rows[0]?.n ?? 'ok'
  } catch (e) { return e.message } finally { await db.exec('rollback') }
}
const blocked = (e) => /row-level security|permission denied/.test(e ?? '')

// ---- Tables: who reads, who writes directly
// Policy (Gate 2, decided Oct 15): admins and relationship managers read the tables, managers without Give Lively's raw
// records (and, tested below, only this gala's guests, emails and review items); nobody else reads any. Nobody writes
// directly, gala admins included: every change goes through an audited function. The list of domains whose people may
// join the staff list (Oct 21) is read by no API role: only the sign-in functions read it.
const READERS = ['relationship_manager', 'gala_admin']
const ADMIN_ONLY = ['givelively_raw']
// Read whole by gala admins, in part by relationship managers (the change log: Oct 22, tested below).
const MANAGERS_PART = ['audit_log']
const NO_READERS = ['staff_join_domains']

// One invented row in each table that starts empty, so every table is really probed.
await db.exec(`
insert into givelively_raw (transaction_id, payload, import_status) values ('gl-test-1', '{"note": "synthetic"}', 'skipped');
insert into sync_deleted (table_name, row_id) values ('guests', 'g-test-deleted');
insert into gala_need_totals (event_id, kind, choice, guests) values ('ev-2026', 'dietary', 'Vegan', 3);
insert into staff_join_domains (domain, role, until) values ('join-test.example', 'check_in_volunteer', now() + interval '1 day');
insert into import_runs (id, event_id, source, started_by) values ('run-test-1', current_event_id(), 'csv', 'test');
insert into import_review (id, run_id, event_id, reason) values ('rev-test-1', 'run-test-1', current_event_id(), 'refund');
insert into tier_mappings (id, event_id, givelively_name, name_key, tier_id, created_by)
  values ('tm-test-1', current_event_id(), 'Ticket', name_key('Ticket'), (select id from sponsorship_tiers limit 1), 'test');
`)
const tables = (await db.query(`select tablename t from pg_tables where schemaname = 'public' order by 1`)).rows.map((r) => r.t)
ok(tables.length >= 18, `found ${tables.length} tables`)

for (const t of tables) {
  const total = (await db.query(`select count(*)::int n from ${t}`)).rows[0].n
  ok(total > 0, `${t} has rows to probe`)
  const rls = (await db.query(`select relrowsecurity r from pg_class where oid = $1::regclass`, [t])).rows[0].r
  ok(rls, `${t}: access rules (RLS) on`)
  const sample = (await db.query(`select to_jsonb(x) j from ${t} x limit 1`)).rows[0].j
  const col = (await db.query(`select column_name c from information_schema.columns where table_schema = 'public' and table_name = $1
    order by ordinal_position limit 1`, [t])).rows[0].c

  for (const c of callers) {
    const read = await attempt(c, `select count(*)::int n from ${t}`)
    if (c.kind === 'relationship_manager' && MANAGERS_PART.includes(t)) ok(read > 0 && read < total, `${c.name} reads part of ${t} (${read}/${total})`)
    else if (READERS.includes(c.kind) && !NO_READERS.includes(t) && !(c.kind === 'relationship_manager' && ADMIN_ONLY.includes(t))) ok(read === total, `${c.name} reads all of ${t} (${read}/${total})`)
    else ok(read === 0 || blocked(read), `${c.name} reads nothing in ${t} (${read})`)

    const ins = await attempt(c, `with x as (insert into ${t} select * from jsonb_populate_record(null::${t}, $1) returning 1) select count(*)::int n from x`, [sample])
    const upd = await attempt(c, `with x as (update ${t} set ${col} = ${col} returning 1) select count(*)::int n from x`)
    const del = await attempt(c, `with x as (delete from ${t} returning 1) select count(*)::int n from x`)
    ok(blocked(ins), `${c.name} cannot insert into ${t} (${ins})`)
    ok(upd === 0 || blocked(upd), `${c.name} cannot update ${t} (${upd})`)
    ok(del === 0 || blocked(del), `${c.name} cannot delete from ${t} (${del})`)
  }
}

// Relationship managers read the gala being run only: a guest, an email and a review item from a past gala stay hidden
// from them; gala admins still read them (Gate 2, decided Oct 15).
await db.exec(`
insert into orders (id, event_id, sponsor_id, tier_id, source, commitment_amount, status)
  select 'ord-past-test', e.id, (select id from sponsors limit 1), (select id from sponsorship_tiers where event_id = e.id limit 1), 'check', 1, 'pledged'
    from gala_events e where e.id <> current_event_id() order by e.event_date limit 1;
insert into guests select (jsonb_populate_record(null::guests, to_jsonb(g) || '{"id": "g-past-test", "order_id": "ord-past-test", "table_id": null, "seat_number": null, "qr_token": null}')).* from guests g limit 1;
insert into email_log select (jsonb_populate_record(null::email_log, to_jsonb(m) || '{"id": "em-past-test", "order_id": "ord-past-test", "guest_id": null}')).* from email_log m limit 1;
insert into import_review (id, run_id, event_id, reason) select 'rev-past-test', 'run-test-1', event_id, 'refund' from orders where id = 'ord-past-test';
`)
for (const [t, id] of [['guests', 'g-past-test'], ['email_log', 'em-past-test'], ['import_review', 'rev-past-test']]) {
  ok(await attempt(byKind('relationship_manager'), `select count(*)::int n from ${t} where id = $1`, [id]) === 0, `a relationship manager doesn't read a past gala's ${t}`)
  ok(await attempt(byKind('gala_admin'), `select count(*)::int n from ${t} where id = $1`, [id]) === 1, `a gala admin reads a past gala's ${t}`)
}
// The change log's details (old and new values: emails, food and access answers) are read by no API role; its summaries are.
for (const k of READERS) {
  ok(blocked(await attempt(byKind(k), `select count(changes)::int n from audit_log`)), `${k} cannot read the change log's details`)
  ok(typeof (await attempt(byKind(k), `select count(summary)::int n from audit_log`)) === 'number', `${k} reads the change log's summaries`)
}
// The change log is gala admins' (Oct 20 and Oct 22): a relationship manager reads only what sponsors changed in their
// portal and what Give Lively recorded (the dashboard's feed), never a staff member's change or another system's, and the
// app's sync sends them no more than that.
await db.exec(`insert into audit_log (at, actor_type, actor, entity, entity_id, order_id, action, guest_visible, summary) values
  (now(), 'staff', 'Mei Lin Ortiz', 'order', 'ord-acme', 'ord-acme', 'payment.recorded', false, 'test: a staff change'),
  (now(), 'guest_portal', 'Jordan Lee', 'guest', 'g-test', 'ord-acme', 'guest.added', true, 'test: a portal change'),
  (now(), 'system', 'Give Lively sync (manual)', 'order', 'ord-acme', 'ord-acme', 'order.created', true, 'test: a Give Lively change'),
  (now(), 'system', 'Email service', 'email', 'em-test', 'ord-acme', 'email.sent', false, 'test: another system change')`)
const seen = async (k, sql) => attempt(byKind(k), `select count(*)::int n from (${sql}) x where summary like 'test: %'`)
const direct = `select summary from audit_log`
const synced = `select e->>'summary' summary from jsonb_array_elements(staff_sync()->'rows'->'audit_log') e`
for (const [how, sql] of [['reads', direct], ['is sent by staff_sync', synced]]) {
  ok(await seen('gala_admin', sql) === 4, `a gala admin ${how} every change-log entry`)
  ok(await seen('relationship_manager', sql) === 2, `a relationship manager ${how} only the portal's and Give Lively's entries`)
}
ok(await attempt(byKind('relationship_manager'), `select count(*)::int n from audit_log where summary in ('test: a staff change', 'test: another system change')`) === 0,
  'a relationship manager reads no staff change and no other system change')

// The change log is append-only even for admins.
for (const sql of [`update audit_log set summary = 'x'`, `delete from audit_log`, `truncate audit_log`])
  ok(blocked(await attempt(byKind('gala_admin'), sql)), `gala admin cannot run: ${sql}`)

// ---- Views follow the caller's rules, not the view owner's
for (const v of ['v_payment_ledger', 'v_fee_totals']) {
  for (const c of callers) {
    const n = await attempt(c, `select count(*)::int n from ${v}`)
    if (READERS.includes(c.kind)) ok(n > 0, `${c.name} sees ${v} (${n})`)
    else ok(n === 0 || blocked(n), `${c.name} sees nothing in ${v} (${n})`)
  }
}

// ---- API functions: who may call each one
// Policy: the sponsor portal (anon) calls only the three portal functions. Signed-in users may call
// the staff functions, and each one checks the caller's role itself.
const PORTAL = ['portal_get_view', 'portal_release_seat', 'portal_save_guest']
const ALL_STAFF = ['gala_admin', 'relationship_manager', 'check_in_volunteer']
const MANAGERS = ['gala_admin', 'relationship_manager']
const STAFF_FUNCTIONS = {
  staff_current_event: ALL_STAFF, checkin_list: ALL_STAFF, staff_check_in: ALL_STAFF, staff_check_in_qr: ALL_STAFF, staff_check_in_exception: ALL_STAFF,
  staff_export_checkin: ALL_STAFF, staff_checkin_snapshot: ALL_STAFF, staff_sync_check_ins: ALL_STAFF, staff_undo_check_in: ALL_STAFF, door_sync: ALL_STAFF,
  staff_update_guest: MANAGERS, staff_set_seat_status: MANAGERS, staff_mark_printed: MANAGERS, staff_assign_seat: MANAGERS,
  staff_seat_order_at_table: MANAGERS, staff_record_payment: MANAGERS, staff_add_pledge: MANAGERS, staff_add_comp_guest: MANAGERS,
  staff_send_qr_invite: MANAGERS, staff_resend_portal_link: MANAGERS, staff_resolve_import_review: MANAGERS,
  staff_approve_email: MANAGERS, staff_cancel_email: MANAGERS, staff_email_queue: MANAGERS,
  staff_queue_guest_list_reminders: MANAGERS, staff_export_badges: MANAGERS,
  staff_pipeline: MANAGERS, staff_save_prospect: MANAGERS, staff_set_prospect_stage: MANAGERS, staff_set_sponsorship_goal: ['gala_admin'],
  staff_set_sponsor_arrivals: ['gala_admin'], staff_update_gala_event: ['gala_admin'], staff_set_material_status: MANAGERS,
  staff_import_givelively: ['gala_admin'], staff_set_tier_mapping: ['gala_admin'], staff_set_gala_page: ['gala_admin'],
  staff_add_gala_page: ['gala_admin'], staff_remove_gala_page: ['gala_admin'],
  staff_export_salesforce: ['gala_admin'], staff_set_order_deadline: ['gala_admin'],
  staff_save_level: ['gala_admin'], staff_copy_levels: ['gala_admin'], staff_retire_level: ['gala_admin'], staff_start_gala: ['gala_admin'],
  staff_report_attendance: ['gala_admin'], staff_report_sponsors: MANAGERS, staff_report_needs: MANAGERS, staff_report_payments: MANAGERS, staff_report_guests: ['gala_admin'],
  staff_clear_needs: ['gala_admin'], staff_delete_guest_contacts: ['gala_admin'],
  staff_sync: MANAGERS,
}
// Return who you are (or nothing), so they need no role check.
const SELF = ['staff_me', 'staff_role']
// The access rules call it as the signed-in person (it returns this gala's id, nothing else).
const RULE_HELPERS = ['current_event_id']

const callable = async (role) => (await db.query(`select proname f from pg_proc where pronamespace = 'public'::regnamespace
  and has_function_privilege($1, oid, 'execute') order by 1`, [role])).rows.map((r) => r.f)
ok(JSON.stringify(await callable('anon')) === JSON.stringify(PORTAL), `anon can call only the portal functions: ${await callable('anon')}`)
const expectAuth = [...PORTAL, ...SELF, ...RULE_HELPERS, ...Object.keys(STAFF_FUNCTIONS)].sort()
ok(JSON.stringify(await callable('authenticated')) === JSON.stringify(expectAuth),
  `signed-in users can call exactly the portal and staff functions: ${(await callable('authenticated')).filter((f) => !expectAuth.includes(f))}`)

for (const [fn, roles] of Object.entries(STAFF_FUNCTIONS)) {
  const nargs = (await db.query(`select pronargs n from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`, [fn])).rows[0].n
  const call = `select ${fn}(${Array(nargs).fill('null').join(', ')})`
  for (const c of callers.filter((x) => x.role === 'authenticated')) {
    // Every argument null: the role check runs first, so a refused caller always sees 'forbidden'.
    const e = await attempt(c, call)
    if (roles.includes(c.kind)) ok(e !== 'forbidden', `${c.name} may call ${fn} (${e})`)
    else ok(e === 'forbidden', `${c.name} is refused ${fn} (${e})`)
  }
}

// ---- Sponsor link limits (hard rule 6): one order, until the deadline, never staff-only data
const LINK = 'ac-6w9k3p5d'
const order = (await db.query(`select id, sponsor_id from orders where portal_token = hash_token($1)`, [LINK])).rows[0]
ok(order, 'demo link belongs to one order')
ok((await db.query(`select count(*)::int n from orders where portal_token = $1`, [LINK])).rows[0].n === 0, 'link stored only as a hash')
const view = (await as('anon', null, `select portal_get_view($1) v`, [LINK]))[0].v
const mySeats = (await db.query(`select count(*)::int n from seats where order_id = $1 and status <> 'cancelled'`, [order.id])).rows[0].n
ok(view.orderId === order.id && view.seats.length === mySeats, 'view shows only this order and its seats')
const others = (await db.query(`select g.first_name || ' ' || g.last_name n from guests g where g.order_id <> $1`, [order.id])).rows.map((r) => r.n)
ok(others.length > 0 && !others.some((n) => JSON.stringify(view).includes(n)), "view never names another order's guests")
const staffOnly = (await db.query(`select internal_notes from orders where id = $1`, [order.id])).rows[0].internal_notes
ok(!staffOnly || !JSON.stringify(view).includes(staffOnly), 'view never includes staff notes')
ok(!/method|processor|transaction_fee|covered_fee|check_number|relationship|internal_notes/.test(JSON.stringify(view)),
  'view has no payment method, fees, relationship owner, or notes')
const otherSlot = (await db.query(`select max(slot_number)::int n from seats where order_id = $1`, [order.id])).rows[0].n + 1
ok((await err('anon', null, `select portal_save_guest($1, $2, $3)`, [LINK, otherSlot, { first_name: 'Not', last_name: 'Mine' }]))?.startsWith('invalid_input'),
  'a seat number past this order is refused, never another order\'s seat')

for (const bad of ['', 'AC-6W9K3P5D', LINK + ' ', 'acme-community-partners'])
  ok((await err('anon', null, `select portal_get_view($1)`, [bad])) === 'invalid_link', `refused: ${JSON.stringify(bad)}`)
ok((await err('anon', null, `select portal_get_view(null)`)) === 'invalid_link', 'refused: no token')

// After the deadline the link stops working for reading, saving and releasing; before it, it works.
const freeSlot = view.seats.find((s) => s.status === 'unnamed')?.slot
ok(freeSlot, 'demo order has an unnamed seat')
const saved = (await db.query(`select portal_token_expires_at e, status from orders where id = $1`, [order.id])).rows[0]
const portal = (sql, params) => attempt(byKind('anon'), sql, params)
await db.query(`update orders set portal_token_expires_at = now() - interval '1 minute' where id = $1`, [order.id])
ok((await portal(`select portal_get_view($1)`, [LINK])) === 'invalid_link', 'expired link cannot read')
ok((await portal(`select portal_save_guest($1, $2, $3)`, [LINK, freeSlot, { first_name: 'Late', last_name: 'Guest' }])) === 'invalid_link',
  'expired link cannot add a guest')
ok((await portal(`select portal_release_seat($1, 1)`, [LINK])) === 'invalid_link', 'expired link cannot remove a guest')
await db.query(`update orders set portal_token_expires_at = now() + interval '1 day' where id = $1`, [order.id])
ok((await portal(`select portal_get_view($1)`, [LINK])) === 'ok', 'link works before the deadline')
await db.query(`update orders set status = 'cancelled' where id = $1`, [order.id])
ok((await portal(`select portal_get_view($1)`, [LINK])) === 'invalid_link', 'cancelled order: link stops working')
await db.query(`update orders set portal_token_expires_at = $2, status = $3 where id = $1`, [order.id, saved.e, saved.status])

// Supabase advisor (lints 0028, 0029): no owner-rights function the API can call sits in public; the apps call
// SECURITY INVOKER wrappers, and the real functions live in the unexposed "private" schema (backend.sql, section 10).
const exposed = (await db.query(`select p.proname f from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
  and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`)).rows.map((r) => r.f)
ok(exposed.length === 1 && exposed[0] === 'staff_role', `only staff_role() is an owner-rights function the API can call: ${exposed}`)
const moved = (await db.query(`select count(*)::int n from pg_proc where pronamespace = 'private'::regnamespace and prosecdef`)).rows[0].n
// staff_sync runs with the caller's rights (its access rules decide what it returns), so it has no private copy.
const INVOKER = ['staff_sync']
ok(moved === PORTAL.length + Object.keys(STAFF_FUNCTIONS).length - INVOKER.length + 1, `every portal and staff function with elevated rights, and staff_me, runs from the private schema (${moved})`)

console.log(`access: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
