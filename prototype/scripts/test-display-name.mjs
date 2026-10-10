// Display names (Oct 10): the name as written is the guest's name, printed on badges, the check-in list and in exports;
// first and last are for sorting. Portal, staff edits, relationship guests, exports and the door list. Invented data only.
import { openTestDb } from './test-db.mjs'
const { db, as, err } = await openTestDb()
let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m) } }
const ADMIN = 'mei.ortiz@aafe-demo.example.org', RM = 'daniel.seo@aafe-demo.example.org'
const TOKEN = 'ac-6w9k3p5d'
const guest = async (id) => (await db.query(`select first_name, last_name, display_name, badge_status from guests where id = $1`, [id])).rows[0]
const seatGuest = async (slot) => (await db.query(`select s.guest_id from seats s join orders o on o.id = s.order_id
  where o.portal_token = encode(sha256(convert_to($2, 'UTF8')), 'hex') and s.slot_number = $1`, [slot, TOKEN])).rows[0]?.guest_id

// Guests saved before display names get "First Last".
ok((await db.query(`select count(*)::int n from guests where coalesce(display_name, '') = ''`)).rows[0].n === 0, 'every existing guest has a display name')
ok((await db.query(`select count(*)::int n from guests where display_name <> btrim(concat_ws(' ', nullif(first_name, ''), nullif(last_name, '')))`)).rows[0].n === 0,
  'backfilled display names are "First Last"')

// Portal: one-word names, a full name alone, first and last alone.
const view = (await as('anon', null, `select portal_get_view($1) v`, [TOKEN]))[0].v
const slot = view.seats.find((s) => s.status === 'unnamed').slot
const save = async (g) => (await as('anon', null, `select portal_save_guest($1, $2, $3) v`, [TOKEN, slot, g]))[0].v
let v = await save({ first_name: 'Cher', last_name: '' })
let id = await seatGuest(slot)
ok(JSON.stringify(await guest(id)) === JSON.stringify({ first_name: 'Cher', last_name: '', display_name: 'Cher', badge_status: 'needs_review' }), 'portal: a one-word name is allowed')
ok(v.seats.find((s) => s.slot === slot).guest.display_name === 'Cher', 'portal view carries the display name')
await save({ display_name: 'Dr. Lena Ortiz', first_name: 'Lena', last_name: 'Ortiz' })
ok((await guest(id)).display_name === 'Dr. Lena Ortiz' && (await guest(id)).first_name === 'Lena', 'portal: the name as written, with the split the app sends')
await save({ display_name: 'Maria de la Cruz' })
const mc = await guest(id)
ok(mc.display_name === 'Maria de la Cruz' && mc.first_name === 'Maria de la' && mc.last_name === 'Cruz', 'portal: a full name sent alone falls back to last word = last name')
ok((await err('anon', null, `select portal_save_guest($1, $2, $3)`, [TOKEN, slot, { first_name: ' ', last_name: '' }])) === 'invalid_input: a name is required', 'portal: no name at all is refused')

// Staff: edit the display name; first and last carry a plain "First Last" display name along, never a corrected one.
await as('authenticated', ADMIN, `select staff_update_guest($1, $2)`, [id, { display_name: 'Dr. Maria de la Cruz', first_name: 'Maria', last_name: 'de la Cruz' }])
await as('authenticated', ADMIN, `select staff_update_guest($1, $2)`, [id, { first_name: 'María' }])
ok((await guest(id)).display_name === 'Dr. Maria de la Cruz', 'staff: a corrected display name stays when first or last changes')
await save({ first_name: 'María', last_name: 'de la Cruz' })
ok((await guest(id)).display_name === 'Dr. Maria de la Cruz', 'portal: first and last sent unchanged keep the corrected display name')
await as('authenticated', RM, `select staff_update_guest($1, $2)`, [id, { display_name: '' }])
ok((await guest(id)).display_name === 'María de la Cruz', 'staff: clearing the display name goes back to "First Last"')
await as('authenticated', RM, `select staff_update_guest($1, $2)`, [id, { last_name: 'Cruz' }])
ok((await guest(id)).display_name === 'María Cruz', 'staff: a plain "First Last" display name follows a new last name')
await db.query(`update guests set badge_status = 'printed' where id = $1`, [id])
await as('authenticated', RM, `select staff_update_guest($1, $2)`, [id, { display_name: 'Dra. María Cruz' }])
ok((await guest(id)).badge_status === 'reprint_needed', 'staff: changing the printed name flags the badge for reprint')
ok((await err('authenticated', RM, `select staff_update_guest($1, $2)`, [id, { display_name: '', first_name: '', last_name: '' }])) === 'invalid_input: a name is required', 'staff: no name at all is refused')

// Relationship guest with one name.
const comp = (await as('authenticated', ADMIN, `select staff_add_comp_guest($1) id`, [{ display_name: 'Prince', relationship_note: 'Board invite' }]))[0].id
ok(JSON.stringify(await guest(comp)) === JSON.stringify({ first_name: 'Prince', last_name: '', display_name: 'Prince', badge_status: 'needs_review' }), 'relationship guest: one name')

// Exports and the door list print the display name; Salesforce always gets a LastName.
await db.query(`update guests set badge_status = 'ready' where id = $1`, [id])
const badge = (await as('authenticated', ADMIN, `select * from staff_export_badges()`)).find((b) => b.first_name === 'María')
ok(badge?.display_name === 'Dra. María Cruz', 'badge file: the name as written')
const row = (await as('authenticated', ADMIN, `select * from staff_export_checkin()`)).find((r) => r.first_name === 'María')
ok(row?.display_name === 'Dra. María Cruz', 'check-in list: the name as written')
ok((await as('authenticated', ADMIN, `select * from staff_export_checkin()`)).filter((r) => r.guest_type === 'unnamed_seat').every((r) => r.display_name === 'Unnamed seat'), 'check-in list: unnamed seats say so')
const snap = (await as('authenticated', ADMIN, `select staff_checkin_snapshot() s`))[0].s
ok(snap.guests.find((g) => g.id === comp)?.display_name === 'Prince', 'door list carries the display name')
await as('authenticated', ADMIN, `select staff_check_in($1, 'search')`, [comp])
const sf = (await as('authenticated', ADMIN, `select * from staff_export_salesforce()`)).find((r) => r.last_name === 'Prince')
ok(sf && sf.first_name === null, 'Salesforce file: a one-word name goes into LastName')

console.log(`display names: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
