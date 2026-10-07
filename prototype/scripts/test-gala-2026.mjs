// A full-size gala end to end: the invented, messy 2026-shaped export (import-engine/test/fixtures/gala-2026/)
// through the import engine and staff_import_givelively, plus the 212 guests staff add by hand, into the
// database. 553 guests, as at AAFE's 2026 gala. Import tests only; not loaded into the demo (decided Oct 7).
// Runs with npm run test:backend.
import { readFileSync } from 'node:fs'
import { counter, openTestDb } from './test-db.mjs'
const { prepareUpload, toGlImport } = await import('../../import-engine/src/index.ts')
const FIX = new URL('../../import-engine/test/fixtures/gala-2026/', import.meta.url)
const csv = readFileSync(new URL('givelively-export.csv', FIX), 'utf8')
const expected = JSON.parse(readFileSync(new URL('expected.json', FIX), 'utf8'))
const staffAdded = JSON.parse(readFileSync(new URL('staff-added.json', FIX), 'utf8'))

const { db, as, err } = await openTestDb()
const count = counter(), ok = count.ok
const q = async (sql, params) => (await db.query(sql, params)).rows
const ADMIN = 'mei.ortiz@aafe-demo.example.org'

// This gala's Give Lively page, the "Ticket" mapping, and the sponsor whose shared inbox a buyer uses.
await as('authenticated', ADMIN, `select staff_set_gala_page($1)`, ["AAFE's 52nd Annual Gala"])
await as('authenticated', ADMIN, `select staff_set_tier_mapping('Ticket', 'supporter')`)
for (const s of expected.sponsors) {
  await db.query(`insert into sponsors (id, organization_name, primary_contact_name, primary_contact_email) values ($1, $2, $3, $4)`,
    [s.id, s.organizationName, s.primaryContactName, s.primaryContactEmail])
}

const context = async () => ({
  galaPageName: (await q(`select givelively_page_name p from gala_events where id = current_event_id()`))[0].p,
  tiers: (await q(`select id, name, tier_category, included_seat_count from sponsorship_tiers`))
    .map((t) => ({ id: t.id, name: t.name, tierCategory: t.tier_category, includedSeatCount: t.included_seat_count })),
  tierMappings: (await q(`select givelively_name, tier_id from tier_mappings where event_id = current_event_id()`))
    .map((m) => ({ givelivelyName: m.givelively_name, tierId: m.tier_id })),
  sponsors: (await q(`select id, organization_name, primary_contact_name, primary_contact_email from sponsors`))
    .map((x) => ({ id: x.id, organizationName: x.organization_name, primaryContactName: x.primary_contact_name, primaryContactEmail: x.primary_contact_email })),
  existingGuests: (await q(`select g.id, g.order_id, coalesce(g.display_name, g.first_name || ' ' || g.last_name) n, g.email, g.organization
    from guests g join orders o on o.id = g.order_id where o.event_id = current_event_id()`))
    .map((x) => ({ id: x.id, orderId: x.order_id, displayName: x.n, email: x.email, organization: x.organization })),
  previousPurchases: [],
})
const upload = async () => {
  const prepared = await prepareUpload(csv, await context())
  const { rows, run } = await toGlImport(prepared, 'gala-2026.csv', csv)
  const res = (await as('authenticated', ADMIN, `select staff_import_givelively($1, $2) r`, [JSON.stringify(rows), JSON.stringify(run)]))[0].r
  return { prepared, res }
}
const before = (await q(`select (select count(*) from orders where event_id = current_event_id())::int orders,
  (select count(*) from orders where event_id = current_event_id() and tier_id = 'comp_relationship' and status <> 'cancelled')::int comp_orders,
  (select count(*) from guests g join orders o on o.id = g.order_id where o.event_id = current_event_id())::int guests`))[0]

// ---- The Give Lively export
const t0 = Date.now()
const { prepared, res } = await upload()
const seconds = (Date.now() - t0) / 1000
const sponsorRows = expected.rows.filter((r) => r.category === 'sponsor'), ticketRows = expected.rows.filter((r) => r.category === 'ticket')
ok(res.created === sponsorRows.length + ticketRows.length + 1, `every gala purchase becomes an order, the refunded one too (${res.created})`)
ok(seconds < 60, `a full-size export imports in under a minute (${seconds.toFixed(1)} s)`)

const imported = await q(`select o.id, o.tier_id, o.status, p.purchase_key,
    (select count(*)::int from seats s where s.order_id = o.id and s.status <> 'cancelled') seats,
    (select count(*)::int from seats s where s.order_id = o.id and s.guest_id is not null and s.status <> 'cancelled') named
  from orders o join payments p on p.order_id = o.id join import_runs r on r.id = $1
  where p.purchase_key is not null and o.event_id = current_event_id() and o.source = 'givelively'`, [res.run_id])
const keyOf = new Map(prepared.rows.map((r) => [r.rowNumber, r.purchaseKey]))
const order = (rowNumber) => imported.find((o) => o.purchase_key === keyOf.get(rowNumber))
const seatsOf = (rows) => rows.reduce((t, r) => t + (order(r.rowNumber)?.seats ?? 0), 0)
ok(seatsOf(sponsorRows) === 234 && seatsOf(ticketRows) === 107, `234 sponsor seats and 107 ticket seats (${seatsOf(sponsorRows)}, ${seatsOf(ticketRows)})`)
const refunded = order(expected.rows.find((r) => r.category === 'refunded').rowNumber)
ok(refunded?.status === 'cancelled' && refunded.seats === 0, 'the refunded purchase is cancelled, with no open seats')
const onCancelled = prepared.rows.filter((r) => r.cancelled && r.guestList.kind === 'names').reduce((t, r) => t + r.guestList.guests.length, 0)
ok(imported.reduce((t, o) => t + o.named, 0) === prepared.report.namesPrefilled - onCancelled,
  `every clear name is on a seat, except on the refunded purchase (${prepared.report.namesPrefilled} - ${onCancelled})`)
const wrongTier = [...sponsorRows, ...ticketRows].filter((r) => order(r.rowNumber)?.tier_id !== r.tier)
ok(wrongTier.length === 0, `every order has its tier: ${wrongTier.map((r) => r.rowNumber)}`)

const open = async (reason) => (await q(`select count(*)::int n from import_review where run_id = $1 and reason = $2`, [res.run_id, reason]))[0].n
for (const reason of ['unknown_tier', 'refund', 'email_name_conflict', 'double_booked']) {
  ok((await open(reason)) === expected.rows.filter((r) => r.review.includes(reason)).length, `staff review: one ${reason}`)
}
ok((await q(`select count(*)::int n from orders o join sponsors s on s.id = o.sponsor_id where s.primary_contact_email = 'events@sharedinbox.example.org'`))[0].n === 1,
  'the shared-inbox purchase still gets its order while staff check who it is')

// ---- The guests staff add by hand
for (const g of staffAdded) {
  await as('authenticated', ADMIN, `select staff_add_comp_guest($1)`, [JSON.stringify({ ...g, relationship_note: g.relationship_note })])
}
const comps = (await q(`select g.relationship_note note, count(*)::int n from guests g join orders o on o.id = g.order_id
  where o.event_id = current_event_id() and o.tier_id = 'comp_relationship' group by 1`))
const compCount = (note) => comps.find((c) => c.note === note)?.n ?? 0
ok(compCount('Comp: community partner') === 109 && compCount('Government or VIP guest') === 53 && compCount('AAFE staff') === 45
  && compCount('Event volunteer') === 3 && compCount('Event staff') === 2, `staff-added guests by category: ${JSON.stringify(comps)}`)
ok((await q(`select count(*)::int n from guests where first_name <> btrim(first_name)`))[0].n === 0, 'names typed with stray spaces are trimmed')

// ---- 553 in all: every imported seat (named or not) plus every guest staff added
const total = (await q(`select (select count(*) from seats s join orders o on o.id = s.order_id join payments p on p.order_id = o.id
    where p.purchase_key is not null and o.source = 'givelively' and o.event_id = current_event_id() and s.status <> 'cancelled')::int
  + (select count(*) from guests g join orders o on o.id = g.order_id where o.tier_id = 'comp_relationship' and o.event_id = current_event_id()
     and g.relationship_note in ('Comp: community partner', 'Government or VIP guest', 'AAFE staff', 'Event volunteer', 'Event staff'))::int n`))[0].n
ok(total === 553, `553 places at the gala, as in 2026 (${total})`)

// ---- The same file again: nothing doubles
const again = await upload()
ok(again.res.created === 0 && again.res.updated === 0, `uploading the same file again creates and changes nothing: ${JSON.stringify(again.res)}`)
ok((await q(`select count(*)::int n from orders where event_id = current_event_id()`))[0].n === before.orders + res.created + (before.comp_orders ? 0 : 1),
  'no duplicate orders; hand-added guests share the one comp order')
ok((await err('authenticated', 'kenji.volunteer@aafe-demo.example.org', `select staff_import_givelively('[]')`)) === 'forbidden', 'volunteers cannot import')

console.log(`gala 2026 end to end: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
