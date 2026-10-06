// Backend tests: loads schema.sql + seed.sql + backend.sql into in-memory Postgres (PGlite)
// with stand-ins for Supabase roles and auth.jwt(), then runs both apps' flows.  npm run test:backend
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const D = fileURLToPath(new URL('../database/', import.meta.url))
const db = new PGlite()
// Minimal Supabase stand-ins: API roles and auth.jwt() reading the request claims, as Supabase does.
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`)
await db.exec(readFileSync(D + 'schema.sql', 'utf8'))
await db.exec(readFileSync(D + 'seed.sql', 'utf8'))
await db.exec(readFileSync(D + 'backend.sql', 'utf8'))
await db.exec(readFileSync(D + 'backend.sql', 'utf8')) // re-run must be safe
let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m) } }
async function as(role, email, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claims', '${email ? JSON.stringify({ email }) : ''}', false)`)
  await db.exec(`set role ${role}`)
  try { return (await db.query(sql, params)).rows } finally { await db.exec('reset role') }
}
async function err(role, email, sql, params = []) {
  try { await as(role, email, sql, params); return null } catch (e) { return e.message }
}
const ADMIN = 'mei.ortiz@aafe-demo.example.org', RM = 'daniel.seo@aafe-demo.example.org'
const vol = (await db.query(`select email from staff_users where role='check_in_volunteer'`)).rows[0].email

// ---- Guest portal
const v = (await as('anon', null, `select portal_get_view('ac-6w9k3p5d') v`))[0].v
ok(v.organization && v.seats.length > 0, 'portal view loads with seed token')
ok(!JSON.stringify(v).match(/transaction_fee|internal_notes|method|relationship_note|check_number/), 'portal view hides staff-only fields')
ok(await err('anon', null, `select portal_get_view('wrong-token')`) === 'invalid_link', 'bad token rejected')
ok((await err('anon', null, `select * from orders`))?.includes('permission') || (await as('anon', null, `select * from orders`)).length === 0, 'anon cannot read tables')
const slot = v.seats.find((s) => s.status === 'unnamed').slot
const v2 = (await as('anon', null, `select portal_save_guest('ac-6w9k3p5d', $1, $2) v`, [slot, { first_name: 'Test', last_name: 'Person', dietary_needs: 'vegan' }]))[0].v
ok(v2.seats.find((s) => s.slot === slot).status === 'submitted', 'guest saved -> submitted')
ok(v2.activity[0].summary.includes('Test Person added'), 'guest activity logged')
ok((await err('anon', null, `select portal_save_guest('ac-6w9k3p5d', $1, $2)`, [slot, { first_name: '' }]))?.startsWith('invalid_input'), 'empty name rejected')
const v3 = (await as('anon', null, `select portal_release_seat('ac-6w9k3p5d', $1) v`, [slot]))[0].v
ok(v3.seats.find((s) => s.slot === slot).status === 'unnamed', 'seat released')
ok(await err('anon', null, `select staff_add_pledge('a','b','c','gold','check')`) !== null, 'anon cannot call staff functions')
ok(await err('anon', null, `select gl_import('[]', 'x')`) !== null, 'anon cannot call gl_import')

// ---- Staff
ok((await as('authenticated', ADMIN, `select staff_me() m`))[0].m.role === 'gala_admin', 'staff_me resolves role')
ok((await as('authenticated', RM, `select count(*)::int n from guests`))[0].n > 0, 'RM reads guests')
ok((await as('authenticated', vol, `select count(*)::int n from guests`))[0].n === 0, 'volunteer cannot read guests table')
ok((await as('authenticated', 'stranger@x.org', `select count(*)::int n from orders`))[0].n === 0, 'non-staff user reads nothing')
ok((await as('authenticated', vol, `select jsonb_array_length(checkin_list()) n`))[0].n > 0, 'volunteer gets check-in list')
ok((await err('authenticated', vol, `select staff_add_pledge('a','b','c@x.org','gold','check')`)) === 'forbidden', 'volunteer cannot add pledge')
ok((await err('authenticated', RM, `update audit_log set summary='x'`)) !== null || (await as('authenticated', RM, `select count(*)::int n from audit_log where summary='x'`))[0].n === 0, 'audit_log not updatable')
ok((await err('authenticated', RM, `insert into guests (id) values ('x')`)) !== null, 'no direct writes')

const ord = (await as('authenticated', RM, `select staff_add_pledge('Test Org','Pat Lee','pat@test.example.org','gold','check') id`))[0].id
const seats = (await db.query(`select count(*)::int n from seats where order_id=$1`, [ord])).rows[0].n
ok(seats === 10, 'pledge creates 10 gold seats')
ok((await db.query(`select count(*)::int n from email_log where order_id=$1 and status='queued' and template='portal_link'`, [ord])).rows[0].n === 1, 'pledge queues portal link')
await as('authenticated', RM, `select staff_record_payment($1,'check',10000,'2026-10-02','1234')`, [ord])
ok((await db.query(`select status from orders where id=$1`, [ord])).rows[0].status === 'partially_paid', 'partial payment status')

// Email: drafts never send until staff approve (hard rule 4)
const draft = (await db.query(`select id from email_log where order_id=$1 and status='queued'`, [ord])).rows[0].id
await as('service_role', null, `select email_mark_sent($1, hash_token('new-link-abc'))`, [draft])
ok((await db.query(`select status from email_log where id=$1`, [draft])).rows[0].status === 'queued', 'unapproved draft is not sent')
ok((await err('authenticated', vol, `select staff_approve_email($1)`, [draft])) === 'forbidden', 'volunteer cannot approve email')
await as('authenticated', RM, `select staff_approve_email($1)`, [draft])
await as('service_role', null, `select email_mark_sent($1, hash_token('new-link-abc'))`, [draft])
ok((await db.query(`select status from email_log where id=$1`, [draft])).rows[0].status === 'sent', 'approved draft is sent')
ok((await db.query(`select (portal_token_expires_at at time zone 'America/New_York')::text t from orders where id=$1`, [ord])).rows[0].t === '2027-04-24 00:00:00', 'link expires at end of guest-list deadline day')
ok((await as('anon', null, `select portal_get_view('new-link-abc')->>'organization' o`))[0].o === 'Test Org', 'minted link works after send')

// Guest -> staff review -> seat -> badge -> check-in
await as('anon', null, `select portal_save_guest('new-link-abc', 1, $1)`, [{ first_name: 'Ana', last_name: 'Diaz' }])
const gid = (await db.query(`select guest_id from seats where order_id=$1 and slot_number=1`, [ord])).rows[0].guest_id
ok((await err('authenticated', RM, `select staff_set_seat_status($1,'badge_ready')`, [gid]))?.startsWith('invalid_transition'), 'cannot skip review')
await as('authenticated', RM, `select staff_set_seat_status($1,'reviewed')`, [gid])
ok((await err('authenticated', RM, `select staff_set_seat_status($1,'badge_ready')`, [gid]))?.includes('assign a table'), 'badge_ready needs seat')
const taken = (await db.query(`select table_id, seat_number from guests where table_id is not null limit 1`)).rows[0]
ok((await err('authenticated', RM, `select staff_assign_seat($1,$2,$3)`, [gid, taken.table_id, taken.seat_number])) === 'seat_taken', 'occupied seat rejected')
const n = (await as('authenticated', RM, `select staff_seat_order_at_table($1,'tb-11') n`, [ord]))[0].n
ok(n === 1, 'group seating seats the named guest')
await as('authenticated', RM, `select staff_set_seat_status($1,'badge_ready')`, [gid])
await as('authenticated', RM, `select staff_mark_printed(array[$1])`, [gid])
await as('authenticated', RM, `select staff_update_guest($1, $2)`, [gid, { title: 'Director', email: '' }])
ok((await db.query(`select badge_status from guests where id=$1`, [gid])).rows[0].badge_status === 'reprint_needed', 'title edit flags reprint')
ok((await as('authenticated', vol, `select staff_check_in($1) r`, [gid]))[0].r === true, 'volunteer checks guest in')
ok((await as('authenticated', vol, `select staff_check_in($1) r`, [gid]))[0].r === false, 'double check-in is a no-op')
ok((await err('anon', null, `select portal_release_seat('new-link-abc', 1)`))?.startsWith('seat_locked'), 'checked-in seat locked in portal')
const comp = (await as('authenticated', ADMIN, `select staff_add_comp_guest($1) id`, [{ first_name: 'Rep', last_name: 'Chen', email: 'rep@x.example.org', relationship_note: 'Council' }]))[0].id
const qr = (await db.query(`select qr_token from guests where id=$1`, [comp])).rows[0].qr_token
ok(/^AAFE-[0-9A-F]{32}$/.test(qr), 'comp QR is 128-bit random')
ok((await as('authenticated', vol, `select staff_check_in_qr($1) r`, [qr.toLowerCase()]))[0].r.first_name === 'Rep', 'QR check-in')
const inv = (await as('authenticated', RM, `select staff_send_qr_invite($1) id`, [comp]))[0].id
ok((await db.query(`select approved_by from email_log where id=$1`, [inv])).rows[0].approved_by === 'Daniel Seo', 'RM sending own QR invite counts as approval')
await as('authenticated', RM, `select staff_cancel_email($1)`, [inv])
ok((await db.query(`select status from email_log where id=$1`, [inv])).rows[0].status === 'cancelled', 'staff can discard an email')
await as('authenticated', vol, `select staff_check_in_exception('Walk In', null, 'walk_in', 'paid at door')`)

// ---- Give Lively import
const rows = [
  { txn: 'GL-T1', date: '2026-10-01T14:05:00Z', first: 'Grace', last: 'Yoon', email: 'grace@bp.example.org', company: 'Brightpath', campaign: 'AAFE Gala 2027', ticket_level: 'Bronze — Performance Sponsor', method: 'Credit Card', original: 10000, covered: 0, gross: 10000, fee: 220.3, net: 9779.7 },
  { txn: 'GL-T2', date: '2026-10-01T16:40:00Z', first: 'Luis', last: 'Romero', email: 'luis@x.example.org', company: '', campaign: 'AAFE Gala 2027', ticket_level: 'Community Ticket', method: 'Bank (ACH)', original: 500, covered: 4, gross: 504, fee: 4.03, net: 499.97 },
  { txn: 'GL-T3', date: '2026-10-02', first: 'Ama', last: 'B', email: 'ama@x.example.org', company: 'B & Co', ticket_level: 'Mystery Package', method: 'paypal', original: 300, gross: 300 },
]
let res = (await as('service_role', null, `select gl_import($1, 'Give Lively sync') r`, [JSON.stringify(rows)]))[0].r
ok(res.created === 3 && res.needs_review === 1, 'GL import creates 3, flags 1: ' + JSON.stringify(res))
res = (await as('service_role', null, `select gl_import($1, 'Give Lively sync') r`, [JSON.stringify(rows)]))[0].r
ok(res.created === 0 && res.skipped === 3, 'GL import is idempotent')
const t2 = (await db.query(`select o.commitment_amount::float c, (select count(*)::int from seats where order_id=o.id) s from orders o where givelively_order_ref='GL-T2'`)).rows[0]
ok(t2.s === 2 && t2.c === 500, '2 community tickets -> 2 seats')
ok((await db.query(`select transaction_fee_amount::float f from payments where givelively_transaction_id='GL-T1'`)).rows[0].f === 220.3, 'GL fee stored as reported')
res = (await as('service_role', null, `select gl_import($1, 'x') r`, [JSON.stringify([{ ...rows[0], refunded: 1000 }])]))[0].r
ok(res.updated === 1, 'refund updates existing payment')
ok((await err('authenticated', RM, `select staff_import_givelively('[]')`)) === 'forbidden', 'only admin imports CSV')
ok((await as('authenticated', ADMIN, `select staff_import_givelively('[]') r`))[0].r.created === 0, 'admin CSV import ok')

// Give Lively table purchase -> what the sponsor sees in the Guest Portal
await as('service_role', null, `select gl_import($1, 'Give Lively sync')`, [JSON.stringify([{ txn: 'GL-TABLE', date: '2026-10-03T15:00:00Z', first: 'Hana', last: 'Kim', email: 'hana@lotus.example.org', company: 'Lotus Bank', campaign: 'AAFE Gala 2027', ticket_level: 'Gold — Documentary Screening Sponsor', method: 'Credit Card', original: 25000, covered: 0, gross: 25000, fee: 550.3 }])])
const tOrd = (await db.query(`select id from orders where givelively_order_ref='GL-TABLE'`)).rows[0].id
await db.exec(`update email_log set approved_by='test', approved_at=now() where order_id='${tOrd}'`)
await as('service_role', null, `select email_mark_sent(id, hash_token('lotus-link')) from email_log where order_id=$1`, [tOrd])
const pv = (await as('anon', null, `select portal_get_view('lotus-link') v`))[0].v
ok(pv.organization === 'Lotus Bank' && pv.contactName === 'Hana Kim', 'portal shows sponsor from Give Lively')
ok(pv.tierName.startsWith('Gold') && pv.seats.length === 10 && pv.seats.every((s) => s.status === 'unnamed'), 'portal shows 10 empty table seats')
ok(pv.money.status === 'paid' && pv.money.paid === 25000 && pv.money.payments.length === 1, 'portal shows Give Lively payment as paid')
ok(pv.activity.some((a) => a.summary.includes('Lotus Bank')), 'portal activity shows the purchase')

// Views respect RLS
ok((await as('authenticated', vol, `select count(*)::int n from v_fee_totals`))[0].n === 0, 'fee view hidden from volunteer')
ok((await as('authenticated', ADMIN, `select count(*)::int n from v_fee_totals`))[0].n > 0, 'fee view visible to admin')
// ---- DEMO: fake Give Lively feed -> same mapping code the sync uses -> import -> Guest Portal
const { normalize, classify } = await import('../supabase/functions/_shared/givelively.ts')
await db.exec(readFileSync(D + 'demo_givelively.sql', 'utf8'))
await db.exec(readFileSync(D + 'demo_givelively.sql', 'utf8')) // re-run must not duplicate
const feed = (await db.query(`select payload from demo_givelively_donations order by modified_at desc`)).rows.map((r) => r.payload)
ok(feed.length === 4, 'fake feed has 4 starting donations')
const verdicts = feed.map((p) => classify(normalize(p), ['AAFE Gala 2027']))
ok(verdicts.filter((x) => x === 'import').length === 3 && verdicts.includes('not_gala'), 'sync imports 3 gala purchases, ignores the appeal: ' + verdicts)
const toImport = feed.map(normalize).filter((r) => classify(r, ['AAFE Gala 2027']) === 'import')
res = (await as('service_role', null, `select gl_import($1, 'Give Lively sync') r`, [JSON.stringify(toImport)]))[0].r
ok(res.created === 3 && res.needs_review === 0, 'fake purchases import cleanly: ' + JSON.stringify(res))
const lotus = (await db.query(`select o.id from orders o join sponsors s on s.id=o.sponsor_id where s.primary_contact_email='hana.kim@lotusbank.example.org' and o.source='givelively'`)).rows[0].id
await db.exec(`update email_log set approved_by='test', approved_at=now() where order_id='${lotus}'`)
await as('service_role', null, `select email_mark_sent(id, hash_token('demo-lotus')) from email_log where order_id=$1`, [lotus])
const lv = (await as('anon', null, `select portal_get_view('demo-lotus') v`))[0].v
ok(lv.organization === 'Lotus Community Bank (synthetic)' && lv.seats.length === 10 && lv.money.status === 'paid', 'Guest Portal shows the fake Gold table')
const sofia = (await db.query(`select (select count(*)::int from seats where order_id=o.id) n, (select covered_fee_amount::float from payments where order_id=o.id) c from orders o join sponsors s on s.id=o.sponsor_id where s.primary_contact_email='sofia.reyes@mail.example.org'`)).rows[0]
ok(sofia.n === 2 && sofia.c > 0, '2 community tickets, donor-covered fee kept')
const live = (await as('service_role', null, `select demo_givelively_purchase('Live Demo Co', 'Ana', 'Lopez', 'ana@live.example.org', 'Platinum — Lead Sponsor', 50000) p`))[0].p
ok(classify(normalize(live), ['AAFE Gala 2027']) === 'import' && normalize(live).fee === 1100.3, 'staged live purchase maps with Stripe fee')

console.log(`${pass} passed, ${fail} failed`)
