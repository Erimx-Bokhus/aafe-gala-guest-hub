// Gate 1 (#146), Give Lively fixes, end to end on Natalie's invented 2027 export (import-engine/test/fixtures/gala-2027-demo/,
// shaped like AAFE's own: 28 purchases on the gala page, its Community Tickets page and another campaign's raffle page)
// through the import engine and staff_import_givelively, then what the sync adds:
// - AAFE's ticket export has no processor fee column: the fee is unknown (null), not $0, and net with it;
// - the sync reports the fee for the same purchase later: it's filled in, and net follows;
// - wallets (Apple Pay, Google Pay, PayPal, Venmo, a donor-advised fund) are card with the wallet named, not
//   "payment method not recognized".
// Runs with npm run test:backend.
import { readFileSync } from 'node:fs'
import { counter, openTestDb } from './test-db.mjs'
const { prepareUpload, toGlImport } = await import('../../import-engine/src/index.ts')
const csv = readFileSync(new URL('../../import-engine/test/fixtures/gala-2027-demo/givelively-export.csv', import.meta.url), 'utf8')

const { db, as } = await openTestDb()
const count = counter(), ok = count.ok
const q = async (sql, params) => (await db.query(sql, params)).rows
const ADMIN = 'mei.ortiz@aafe-demo.example.org'
const MAIN = "AAFE's 53rd Annual Gala", COMMUNITY = "AAFE's 53rd Annual Gala (Community Tickets)"

// The gala's two Give Lively pages, and the tiers staff map on purpose: "Ticket" (no level is called just that), and
// each tier on the Community Tickets page (Gate 1b: another page's tiers are linked page by page).
await as('authenticated', ADMIN, `select staff_set_gala_page($1)`, [MAIN])
await as('authenticated', ADMIN, `select staff_add_gala_page($1)`, [COMMUNITY])
await as('authenticated', ADMIN, `select staff_set_tier_mapping('Ticket', 'corporate_ticket')`)
await as('authenticated', ADMIN, `select staff_set_tier_mapping('Community Ticket', 'community_ticket', $1)`, [COMMUNITY])

// What the staff app hands the engine (staff-app/src/importer.ts), read from the database.
const context = async () => ({
  galaPageName: MAIN,
  otherPages: (await q(`select givelively_other_pages p from gala_events where id = current_event_id()`))[0].p ?? [],
  tiers: (await q(`select id, name, tier_category, included_seat_count from sponsorship_tiers where event_id = current_event_id() and not retired`))
    .map((t) => ({ id: t.id, name: t.name, tierCategory: t.tier_category, includedSeatCount: t.included_seat_count })),
  tierMappings: (await q(`select givelively_name, tier_id, page_key from tier_mappings where event_id = current_event_id()`))
    .map((m) => ({ givelivelyName: m.givelively_name, tierId: m.tier_id, pageName: m.page_key || null })),
  sponsors: (await q(`select id, organization_name, primary_contact_name, primary_contact_email from sponsors`))
    .map((x) => ({ id: x.id, organizationName: x.organization_name, primaryContactName: x.primary_contact_name, primaryContactEmail: x.primary_contact_email })),
  existingGuests: [],
  previousPurchases: [],
  orderIdByPurchaseKey: Object.fromEntries((await q(`select purchase_key k, order_id o from payments where purchase_key is not null`)).map((r) => [r.k, r.o])),
})
const upload = async () => {
  const prepared = await prepareUpload(csv, await context())
  const { rows, run } = await toGlImport(prepared, 'AAFE-2027-GiveLively-export-DEMO.csv', csv)
  const res = (await as('authenticated', ADMIN, `select staff_import_givelively($1, $2) r`, [JSON.stringify(rows), JSON.stringify(run)]))[0].r
  return { rows, res }
}

// ---- The upload
const { rows, res } = await upload()
ok(rows.length === 27, `the 27 purchases on the gala's two pages go to the database, not the raffle (${rows.length})`)
const paid = await q(`select p.method, p.method_detail, p.transaction_fee_amount fee, p.net_amount net, p.covered_fee_amount::float covered,
    p.reconciliation_status rec, o.status, o.givelively_page page, sp.primary_contact_email email
  from payments p join orders o on o.id = p.order_id join sponsors sp on sp.id = o.sponsor_id where p.purchase_key is not null`)
ok(paid.length === 27 && res.created === 27, `27 orders, each with its payment (${paid.length}, created ${res.created})`)
ok(paid.every((p) => p.fee === null && p.net === null), 'no processor fee in the export: every fee is unknown, not $0, and net with it')
ok(paid.filter((p) => p.method === 'givelively_ach').length === 7 && paid.filter((p) => p.method === 'card').length === 20,
  `Stripe ACH is a Give Lively bank payment, Stripe Card a card (${paid.filter((p) => p.method === 'givelively_ach').length} and ${paid.filter((p) => p.method === 'card').length})`)
ok(paid.every((p) => p.method_detail === null) && !paid.some((p) => p.rec === 'needs_review'), 'no wallet in this file, and no payment flagged for its method')
ok(paid.filter((p) => p.covered === 31.4).length === 2, 'the two donors who covered the fee: $31.40 each')
ok(paid.filter((p) => p.page === COMMUNITY).length === 3, 'the three Community Tickets purchases are on that page')
ok(paid.find((p) => p.email === 'owen.reyes@sample.example.org')?.status === 'cancelled', 'the refunded ticket is cancelled')
const again = await upload()
ok(again.res.created === 0 && (await q(`select count(*)::int n from payments where purchase_key is not null`))[0].n === 27, 'uploading the same file again adds nothing')

// ---- The sync reports the fee for a purchase the upload brought in: filled in, net follows, logged.
const one = (await q(`select p.id, p.purchase_key, p.gross_amount::float gross, p.refunded_amount::float refunded, sp.primary_contact_email email, p.received_at
  from payments p join orders o on o.id = p.order_id join sponsors sp on sp.id = o.sponsor_id where sp.primary_contact_email = 'kenji.sato@sample.example.org'`))[0]
await db.query(`select gl_import($1::jsonb, 'Give Lively sync')`, [JSON.stringify([{ txn: 'GL-2027-FEE-1', purchase_key: one.purchase_key, email: one.email,
  date: new Date(one.received_at).toISOString(), first: 'Kenji', last: 'Sato', ticket_level: 'Ticket', quantity: 2, original: 1000, covered: 31.4,
  gross: one.gross, fee: 31.4, refunded: one.refunded, method: 'Stripe Card', status: 'succeeded', campaign: MAIN }])])
const filled = (await q(`select transaction_fee_amount::float fee, net_amount::float net from payments where id = $1`, [one.id]))[0]
ok(filled.fee === 31.4 && Math.abs(filled.net - (one.gross - 31.4 - one.refunded)) < 0.005, `the sync's fee fills in, and net follows (${filled.fee}, ${filled.net})`)
ok((await q(`select count(*)::int n from audit_log where entity_id = $1 and action = 'payment.fee_known'`, [one.id]))[0].n === 1, 'the fee arriving is in the change log')
ok((await q(`select count(*)::int n from payments where purchase_key = $1`, [one.purchase_key]))[0].n === 1, 'the same purchase, not a second payment')

// ---- Wallets: card, with the wallet named, and not flagged; an unknown method still is.
const wallets = { 'Apple Pay': 'Apple Pay', 'Google Pay': 'Google Pay', PayPal: 'PayPal', Venmo: 'Venmo', 'DAF Pay': 'Donor-advised fund', 'Stripe Card': null }
let i = 0
for (const method of [...Object.keys(wallets), 'Mystery Wallet']) {
  i++
  await db.query(`select gl_import($1::jsonb, 'Give Lively sync')`, [JSON.stringify([{ txn: `GL-WALLET-${i}`, email: `wallet${i}@sample.example.org`,
    date: `2027-04-0${i}T15:00:00Z`, first: 'Wallet', last: `Buyer${i}`, ticket_level: 'Supporter Sponsor', quantity: 1, original: 1000, gross: 1000, fee: 22.3,
    refunded: 0, method, status: 'succeeded', campaign: MAIN }])])
}
const w = await q(`select p.method, p.method_detail, p.reconciliation_status rec, sp.primary_contact_email email from payments p join orders o on o.id = p.order_id
  join sponsors sp on sp.id = o.sponsor_id where sp.primary_contact_email like 'wallet%' order by sp.primary_contact_email`)
const named = Object.values(wallets)
ok(w.length === 7 && w.every((p) => p.method === 'card'), 'every wallet is recorded as a card payment')
ok(JSON.stringify(w.slice(0, 6).map((p) => p.method_detail)) === JSON.stringify(named), `the wallet is named: ${w.slice(0, 6).map((p) => p.method_detail ?? 'none').join(', ')}`)
ok(w.slice(0, 6).every((p) => p.rec !== 'needs_review'), 'a wallet is recognized, not flagged for review')
ok(w[6].rec === 'needs_review' && w[6].method_detail === null, 'a method nobody recognizes is still recorded as card and flagged')

// ---- The payments report: an unknown fee is a blank cell, and the wallet is named.
const report = (await as('authenticated', ADMIN, `select staff_report_payments() r`))[0].r
ok(report.filter((r) => r.processor_fee === null && r.net === null).length === 26, `the report leaves an unknown fee and its net blank (${report.filter((r) => r.processor_fee === null).length} rows)`)
ok(report.some((r) => r.method_detail === 'Apple Pay'), 'the report names the wallet')

console.log(`give lively 2027: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
