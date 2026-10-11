// Offline check-in (decided Oct 6): the list the iPad saves, and syncing the check-ins it made offline.
// First arrival wins; the second is written to the change log. Runs with npm run test:backend.
import { CheckInDesk } from '../shared/src/offlineCheckin.ts'
import { counter, openTestDb } from './test-db.mjs'
const { db, as, err } = await openTestDb()
const count = counter(), ok = count.ok
const q = async (sql, params) => (await db.query(sql, params)).rows

const STAFF = Object.fromEntries((await q(`select role, email, name from staff_users order by email`)).map((s) => [s.role, s]))
const VOL = STAFF.check_in_volunteer, RM = STAFF.relationship_manager
const sync = async (who, items) => (await as('authenticated', who.email, `select staff_sync_check_ins($1) r`, [JSON.stringify(items)]))[0].r
const ago = (min) => new Date(Date.now() - min * 60_000).toISOString()
const nyTime = async (iso) => (await q(`select to_char($1::timestamptz at time zone 'America/New_York', 'FMHH12:MI AM') t`, [iso]))[0].t
const checkIns = async (guest) => q(`select * from check_ins where guest_id = $1`, [guest])
const logCount = async (action, entity) => (await q(`select count(*)::int n from audit_log where action = $1 and entity_id = $2`, [action, entity]))[0].n

// A QR code on one seat and an expired one on another, as send-emails would leave them.
await db.exec(`update seats set qr_token_hash = hash_token('AAFE-0000000000000000000000000000OFF1'), qr_token_expires_at = now() + interval '1 day' where guest_id = 'g-019';
               update seats set qr_token_hash = hash_token('AAFE-0000000000000000000000000000OLD1'), qr_token_expires_at = now() - interval '1 minute' where guest_id = 'g-020';`)

// ---- The list the iPad saves
ok((await err('authenticated', 'stranger@example.org', `select staff_checkin_snapshot()`)) === 'forbidden', 'only staff can save the list')
const snap = (await as('authenticated', VOL.email, `select staff_checkin_snapshot() s`))[0].s
const listed = (await q(`select count(*)::int n from guests g join orders o on o.id = g.order_id where o.event_id = current_event_id() and o.status <> 'cancelled'`))[0].n
ok(snap.guests.length === listed && listed > 0, `volunteers get every guest of this gala (${snap.guests.length})`)
const text = JSON.stringify(snap)
ok(!/@|email|phone|dietary|relationship_note|internal_notes|amount|payment/i.test(text), 'no emails, phones, dietary needs, notes or payments')
const g19 = snap.guests.find((g) => g.id === 'g-019')
ok(g19.qr_hash === (await q(`select hash_token('AAFE-0000000000000000000000000000OFF1') h`))[0].h, "a guest's QR code is there as a hash, to check scans offline")
ok(snap.guests.find((g) => g.id === 'g-020').qr_hash === null, 'an expired code is left out')
ok(!text.includes('OFF1'), 'the code itself is never in the list')
ok(snap.unnamed_seats.some((u) => u.order_id === 'ord-acme' && u.count === 3), 'unnamed sponsor seats are listed, for walk-ins')
ok((await q(`select count(*)::int n from audit_log where actor = $1`, [VOL.name]))[0].n === 0, 'saving the list is a read, not logged')

// ---- Sync: a check-in made offline
const t1 = ago(30)
let r = await sync(VOL, [{ client_id: 'door2-0001', guest_id: 'g-021', method: 'search', at: t1, device: 'Door 2' }])
ok(r[0].status === 'checked_in', 'an offline check-in syncs')
let ci = await checkIns('g-021')
ok(ci.length === 1 && new Date(ci[0].checked_in_at).toISOString() === t1 && ci[0].device === 'Door 2' && ci[0].checked_in_by === VOL.name,
  'it keeps the time it happened on the iPad, the device, and who did it')
ok((await q(`select attendance_status s from guests where id = 'g-021'`))[0].s === 'checked_in', 'the guest is marked arrived')
ok((await q(`select summary from audit_log where action = 'checkin.arrived' and entity_id = 'door2-0001'`))[0]?.summary.includes('offline'), 'the change log says it was offline')

r = await sync(VOL, [{ client_id: 'door2-0001', guest_id: 'g-021', method: 'search', at: t1, device: 'Door 2' }])
ok(r[0].status === 'already_synced' && (await checkIns('g-021')).length === 1 && (await logCount('checkin.arrived', 'door2-0001')) === 1,
  'sending it again (the iPad never heard back) records nothing twice')

// ---- First arrival wins: a second door checks the same guest in later
const t2 = ago(28)
r = await sync(RM, [{ client_id: 'door1-0001', guest_id: 'g-021', method: 'qr', at: t2, device: 'Door 1' }])
ok(r[0].status === 'conflict' && r[0].first_by === VOL.name && r[0].first_device === 'Door 2' && new Date(r[0].first_at).toISOString() === t1,
  'the later check-in is a conflict, and says who was first')
ci = await checkIns('g-021')
ok(ci.length === 1 && ci[0].client_id === 'door2-0001', 'the first check-in stands')
const conflict = (await q(`select summary from audit_log where action = 'checkin.conflict' and entity_id = 'door1-0001'`))[0]?.summary ?? ''
ok(conflict.includes(`already checked in at ${await nyTime(t1)} by ${VOL.name} (Door 2)`) && conflict.includes('not counted'),
  `the conflict is in the change log: ${conflict}`)
r = await sync(RM, [{ client_id: 'door1-0001', guest_id: 'g-021', method: 'qr', at: t2, device: 'Door 1' }])
ok(r[0].status === 'conflict' && r[0].first_device === 'Door 2' && (await logCount('checkin.conflict', 'door1-0001')) === 1,
  'resending a conflict answers the same and logs it once')

// ---- The offline check-in came first: it replaces the one recorded online
await as('authenticated', RM.email, `select staff_check_in('g-022')`)
const online = (await checkIns('g-022'))[0]
const early = new Date(new Date(online.checked_in_at).getTime() - 10 * 60_000).toISOString()
r = await sync(VOL, [{ client_id: 'door2-0002', guest_id: 'g-022', method: 'search', at: early, device: 'Door 2' }])
ci = await checkIns('g-022')
ok(r[0].status === 'checked_in' && ci.length === 1 && new Date(ci[0].checked_in_at).toISOString() === early && ci[0].device === 'Door 2',
  'an earlier offline check-in becomes the check-in')
ok((await logCount('checkin.conflict', online.id)) === 1, 'and the online one is logged as the second')

// ---- Times, walk-ins, and bad items
r = await sync(VOL, [{ client_id: 'door2-old', guest_id: 'g-023', method: 'search', at: ago(25 * 60), device: 'Door 2' }])
ok(r[0].status === 'error' && r[0].error.startsWith('invalid_input'), 'a check-in time more than a day old is refused, so it cannot claim to be first')
r = await sync(VOL, [{ client_id: 'door2-0003', guest_id: 'g-023', method: 'search', at: '2099-01-01T00:00:00Z', device: 'Door 2' }])
ok(r[0].status === 'checked_in' && new Date((await checkIns('g-023'))[0].checked_in_at) <= new Date(), "an iPad clock set in the future is capped at now")

const walk = { client_id: 'door2-0004', kind: 'exception', name: 'Riley Walkin', order_id: 'ord-acme', type: 'walk_in', note: 'Took an unnamed seat', at: ago(5), device: 'Door 2' }
r = await sync(VOL, [walk])
const w = await q(`select * from check_ins where client_id = 'door2-0004'`)
ok(r[0].status === 'checked_in' && w.length === 1 && w[0].arrival_name === 'Riley Walkin' && w[0].method === 'exception', 'a walk-in syncs')
ok((await sync(VOL, [walk]))[0].status === 'already_synced' && (await q(`select count(*)::int n from check_ins where arrival_name = 'Riley Walkin'`))[0].n === 1, 'and only once')

await db.exec(`update orders set status = 'cancelled' where id = 'ord-pacific'`)
const pacificGuest = (await q(`select id from guests where order_id = 'ord-pacific' limit 1`))[0]?.id
r = await sync(VOL, [
  { client_id: 'door2-0005', guest_id: 'g-nobody', at: ago(3) },
  { client_id: '', guest_id: 'g-019', at: ago(3) },
  { client_id: 'door2-0006', guest_id: 'g-019', method: 'qr', at: ago(3), device: 'Door 2' },
  { client_id: 'door2-0007', kind: 'exception', name: '', type: 'walk_in' },
  ...(pacificGuest ? [{ client_id: 'door2-0008', guest_id: pacificGuest, at: ago(3) }] : []),
])
ok(r[0].status === 'error' && r[0].error.startsWith('not_found'), 'an unknown guest is an error for that item')
ok(r[1].status === 'error' && r[1].error.includes('client_id'), 'an item without an id is refused')
ok(r[2].status === 'checked_in', 'the good item in the same batch still syncs')
ok(r[3].status === 'error' && r[3].error.startsWith('invalid_input'), 'a walk-in needs a name and type')
ok(!pacificGuest || r[4].status === 'error', "a guest on a cancelled order isn't checked in")
ok((await err('authenticated', VOL.email, `select staff_sync_check_ins('{}')`))?.startsWith('invalid_input'), 'the batch must be a list')
ok((await err('authenticated', 'stranger@example.org', `select staff_sync_check_ins('[]')`)) === 'forbidden', 'only staff can sync')

// ---- After syncing, the saved list and the exports agree
const after = (await as('authenticated', VOL.email, `select staff_checkin_snapshot() s`))[0].s.guests.find((g) => g.id === 'g-021')
ok(after.arrived && after.device === 'Door 2' && after.checked_in_by === VOL.name, 'a fresh list shows who arrived, when, and at which door')
const sf = await as('authenticated', STAFF.gala_admin.email, `select last_name from staff_export_salesforce()`)
const g21 = (await q(`select last_name from guests where id = 'g-021'`))[0].last_name
ok(sf.filter((x) => x.last_name === g21).length === 1, 'a guest checked in at two doors appears once in the Salesforce file')
ok((await err('authenticated', VOL.email, `insert into check_ins (id, event_id, guest_id, method, type, checked_in_by)
  values ('ci-x', 'ev-2027', 'g-021', 'search', 'standard', 'x')`)) !== null, 'nobody writes check-ins directly')
let dup = null
try { await db.query(`insert into check_ins (id, event_id, guest_id, method, type, checked_in_by) values ('ci-dup', current_event_id(), 'g-021', 'search', 'standard', 'x')`) }
catch (e) { dup = e.message }
ok(dup?.includes('check_ins_one_per_guest'), 'the database itself allows one check-in per guest')

// ---- End to end: two iPads lose the connection and check the same guest in (shared/src/offlineCheckin.ts)
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) } }
const fresh = (await as('authenticated', VOL.email, `select staff_checkin_snapshot() s`))[0].s
const target = fresh.guests.find((g) => !g.arrived && g.qr_hash === null)
const coded = fresh.guests.find((g) => g.id === 'g-019')
let clockNow = Date.now() - 20 * 60_000
const door = (device, who) => {
  const d = new CheckInDesk({ store: memory(), device, staffName: who.name, now: () => new Date(clockNow) })
  d.saveSnapshot(fresh)
  return { d, send: (items) => sync(who, items) }
}
const door1 = door('Door 1', RM), door2 = door('Door 2', VOL)
ok(door2.d.checkIn(target.id).kind === 'checked_in', 'Door 2 checks the guest in offline')
clockNow += 2 * 60_000
ok(door1.d.checkIn(target.id).kind === 'checked_in', 'Door 1, also offline, checks the same guest in two minutes later')
ok((await door2.d.scan('AAFE-0000000000000000000000000000OFF1')).kind === 'already', 'a scanned code works offline (that guest arrived earlier)')
ok(coded.arrived, '(the scanned guest synced earlier in this test)')
ok(door1.d.banner(false) === 'Offline · 1 check-in waiting', 'the banner counts what is waiting')
// Door 1 comes back online first; Door 2 later. Door 2 was first at the door, so Door 2's stands.
ok((await door1.d.sync(door1.send)).synced === 1, 'Door 1 syncs first')
const s2 = await door2.d.sync(door2.send)
ok(s2.synced === 1 && door2.d.pending().length === 0, 'Door 2 syncs later and its earlier check-in becomes the check-in')
const row = (await checkIns(target.id))[0]
ok(row.device === 'Door 2' && (await checkIns(target.id)).length === 1, 'one check-in, from Door 2')
ok((await q(`select count(*)::int n from audit_log where action = 'checkin.conflict' and summary like $1`, [`${target.first_name} ${target.last_name}%`]))[0].n === 1,
  "Door 1's check-in is logged as the second")
// Door 1 checks a guest in, and the answer is lost: the next sync records it once.
const other = fresh.guests.find((g) => !g.arrived && g.id !== target.id && g.qr_hash === null)
door1.d.checkIn(other.id)
await door1.d.sync(async (items) => { await door1.send(items); throw new Error('connection lost before the answer') })
ok(door1.d.pending().length === 1, 'an unanswered sync keeps the check-in waiting')
ok((await door1.d.sync(door1.send)).synced === 1 && (await checkIns(other.id)).length === 1, 'syncing again records it once')

// ---- What the iPad app needs from the list, and undo (Oct 8): only the person who checked a guest in, or a gala admin
const ADMIN = STAFF.gala_admin
const listNow = async () => (await as('authenticated', VOL.email, `select staff_checkin_snapshot() s`))[0].s
const s3 = await listNow()
ok(s3.status && s3.event_date && Array.isArray(s3.exceptions), "the list says the gala's date and status, and tonight's exceptions")
ok(s3.guests.every((g) => 'package' in g && 'checkin_id' in g), 'each guest has its package, and a check-in id once arrived')
const pick = (await q(`select g.id, s.status from guests g join seats s on s.guest_id = g.id join orders o on o.id = g.order_id
  where o.event_id = current_event_id() and g.attendance_status = 'expected' and s.status not in ('cancelled', 'checked_in') limit 1`))[0]
await as('authenticated', RM.email, `select staff_check_in($1)`, [pick.id])
const made = (await checkIns(pick.id))[0]
ok(made.staff_id && made.seat_status_before === pick.status, 'a check-in records who made it, by account, and the seat status before it')
ok((await err('authenticated', VOL.email, `select staff_undo_check_in($1)`, [made.id]))?.startsWith('forbidden'), 'another volunteer cannot undo it')
const undone = (await as('authenticated', RM.email, `select staff_undo_check_in($1) r`, [made.id]))[0].r
ok(undone.status === 'undone' && (await checkIns(pick.id)).length === 0, 'the person who checked the guest in can undo it')
ok((await q(`select attendance_status a from guests where id = $1`, [pick.id]))[0].a === 'expected'
  && (await q(`select status from seats where guest_id = $1`, [pick.id]))[0].status === pick.status, 'the guest is expected again and the seat is back as it was')
ok((await logCount('checkin.undone', made.id)) === 1, 'the undo is logged')
await as('authenticated', VOL.email, `select staff_check_in_exception('Undo Test', null, 'Walk-in pending confirmation', 'Approved by the lead')`)
const exc = (await listNow()).exceptions.find((e) => e.name === 'Undo Test')
ok(exc && !('note' in exc), 'exceptions are on the list, without their notes')
ok((await as('authenticated', ADMIN.email, `select staff_undo_check_in($1) r`, [exc.id]))[0].r.status === 'undone', "a gala admin can undo anyone's check-in, exceptions too")
ok((await err('authenticated', VOL.email, `select staff_undo_check_in('ci-nope')`))?.startsWith('not_found'), "undoing a check-in that isn't there says so")

console.log(`offline check-in: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
