// Gate 1 (#146), box 3: the import end to end on AAFE-shaped data, files saved in Excel included. Staff often open the
// export in Excel, fix something and save before uploading. Excel changes the file (amounts get a trailing space,
// "false" becomes "FALSE", Windows line endings, a byte-order mark on "CSV UTF-8") and, saved the wrong way, damages
// non-English names. For two AAFE-shaped exports, Natalie's invented 2027 one and the invented 553-guest 2026 one,
// each Excel-saved copy (made by Excel 16 with the roundtrip scripts in import-engine/test/fixtures/excel-saved/):
// - imports into a fresh database exactly as the clean file does: the same orders, levels, statuses, money, seats,
//   guest names and review items;
// - uploaded after the clean file, adds nothing: every purchase is recognized by its purchase key;
// and the copy whose names Excel damaged stops the upload before anything is written (#145). Runs with npm run test:backend.
import { readFileSync } from 'node:fs'
import { counter, openTestDb } from './test-db.mjs'
const { prepareUpload, toGlImport } = await import('../../import-engine/src/index.ts')
const count = counter(), ok = count.ok
const FIX = new URL('../../import-engine/test/fixtures/', import.meta.url)
const file = (path) => new TextDecoder().decode(readFileSync(new URL(path, FIX)))   // as the browser reads an upload
const ADMIN = 'mei.ortiz@aafe-demo.example.org'

const EXPORTS = {
  2027: {
    clean: 'gala-2027-demo/givelively-export.csv',
    saved: ['excel-saved/gala-2027-excel-csv.csv', 'excel-saved/gala-2027-excel-csv-utf8.csv'],
    setup: async (as) => {
      await as('authenticated', ADMIN, `select staff_set_gala_page($1)`, ["AAFE's 53rd Annual Gala"])
      await as('authenticated', ADMIN, `select staff_add_gala_page($1)`, ["AAFE's 53rd Annual Gala (Community Tickets)"])
      await as('authenticated', ADMIN, `select staff_set_tier_mapping('Ticket', 'corporate_ticket')`)
      await as('authenticated', ADMIN, `select staff_set_tier_mapping('Community Ticket', 'community_ticket', $1)`, ["AAFE's 53rd Annual Gala (Community Tickets)"])
    },
  },
  2026: {
    clean: 'gala-2026/givelively-export.csv',
    saved: ['excel-saved/bom-saved-csv-utf8.csv'],
    damaged: 'excel-saved/no-bom-saved-csv-utf8.csv',
    setup: async (as, db) => {
      await as('authenticated', ADMIN, `select staff_set_gala_page($1)`, ["AAFE's 52nd Annual Gala"])
      await as('authenticated', ADMIN, `select staff_set_tier_mapping('Ticket', 'supporter')`)
      const expected = JSON.parse(file('gala-2026/expected.json'))
      for (const s of expected.sponsors) await db.query(`insert into sponsors (id, organization_name, primary_contact_name, primary_contact_email) values ($1, $2, $3, $4)`,
        [s.id, s.organizationName, s.primaryContactName, s.primaryContactEmail])
    },
  },
}

// What the staff app hands the engine (staff-app/src/importer.ts importContext), read from the database.
async function context(db) {
  const q = async (sql) => (await db.query(sql)).rows
  const ev = (await q(`select givelively_page_name p, givelively_other_pages o from gala_events where id = current_event_id()`))[0]
  return {
    galaPageName: ev.p, otherPages: ev.o ?? [],
    tiers: (await q(`select id, name, tier_category, included_seat_count from sponsorship_tiers where event_id = current_event_id() and not retired`))
      .map((t) => ({ id: t.id, name: t.name, tierCategory: t.tier_category, includedSeatCount: t.included_seat_count })),
    tierMappings: (await q(`select givelively_name, tier_id, page_key from tier_mappings where event_id = current_event_id()`))
      .map((m) => ({ givelivelyName: m.givelively_name, tierId: m.tier_id, pageName: m.page_key || null })),
    sponsors: (await q(`select id, organization_name, primary_contact_name, primary_contact_email from sponsors`))
      .map((x) => ({ id: x.id, organizationName: x.organization_name, primaryContactName: x.primary_contact_name, primaryContactEmail: x.primary_contact_email })),
    existingGuests: (await q(`select g.id, g.order_id, coalesce(g.display_name, g.first_name || ' ' || g.last_name) n, g.email, g.organization
      from guests g join orders o on o.id = g.order_id where o.event_id = current_event_id()`))
      .map((x) => ({ id: x.id, orderId: x.order_id, displayName: x.n, email: x.email, organization: x.organization })),
    previousPurchases: [],
    orderIdByPurchaseKey: Object.fromEntries((await q(`select purchase_key k, order_id o from payments where purchase_key is not null`)).map((r) => [r.k, r.o])),
  }
}
async function upload(db, as, csv, name) {
  const prepared = await prepareUpload(csv, await context(db))
  const { rows, run } = await toGlImport(prepared, name, csv)
  const res = (await as('authenticated', ADMIN, `select staff_import_givelively($1, $2) r`, [JSON.stringify(rows), JSON.stringify(run)]))[0].r
  return { prepared, res }
}
// Everything an upload writes that staff see: each purchase's order, money, seats and named guests, and the review items.
async function snapshot(db) {
  const purchases = (await db.query(`select p.purchase_key, o.tier_id, o.status, o.commitment_amount::float c, p.original_amount::float a,
      p.gross_amount::float g, p.refunded_amount::float r, p.covered_fee_amount::float cov, p.method, p.transaction_fee_amount fee, o.givelively_page page,
      (select count(*)::int from seats s where s.order_id = o.id and s.status <> 'cancelled') seats,
      (select string_agg(coalesce(gu.display_name, gu.first_name || ' ' || gu.last_name), ' | ' order by s.slot_number)
         from seats s join guests gu on gu.id = s.guest_id where s.order_id = o.id) names
    from payments p join orders o on o.id = p.order_id where p.purchase_key is not null order by p.purchase_key`)).rows
  const reviews = (await db.query(`select reason, purchase_key, details from import_review order by reason, purchase_key, details::text`)).rows
  return { purchases, reviews }
}
const fresh = async (year, csv, name) => {
  const { db, as } = await openTestDb()
  await EXPORTS[year].setup(as, db)
  const { prepared, res } = await upload(db, as, csv, name)
  return { db, as, prepared, res, snap: await snapshot(db) }
}

for (const year of ['2027', '2026']) {
  const e = EXPORTS[year]
  const clean = await fresh(year, file(e.clean), `${year}-clean.csv`)
  const rejected = clean.prepared.report.rejected
  ok(clean.res.created > 0 && (year !== '2027' || rejected.length === 0),
    `${year}: the clean export imports (${clean.res.created} purchases; rows rejected: ${rejected.length}, the 2026 file's messy rows on purpose)`)
  for (const path of e.saved) {
    const csv = file(path), label = `${year}, ${path.split('/').pop()}`
    const saved = await fresh(year, csv, path)
    ok(JSON.stringify(saved.prepared.report.rejected) === JSON.stringify(rejected), `${label}: the same rows rejected, for the same reasons (${rejected.length})`)
    const keys = (p) => p.prepared.rows.map((r) => r.purchaseKey).sort().join()
    ok(keys(saved) === keys(clean), `${label}: the same purchase keys as the clean file (${saved.prepared.rows.length} rows)`)
    const diff = saved.snap.purchases.filter((p, i) => JSON.stringify(p) !== JSON.stringify(clean.snap.purchases[i]))
    ok(saved.snap.purchases.length === clean.snap.purchases.length && diff.length === 0,
      `${label}: imports exactly as the clean file: orders, levels, money, seats and names${diff.length ? ` (${diff.length} differ, e.g. ${JSON.stringify(diff[0]).slice(0, 200)})` : ''}`)
    ok(JSON.stringify(saved.snap.reviews) === JSON.stringify(clean.snap.reviews), `${label}: and the same review items (${saved.snap.reviews.length})`)
    // The Excel copy uploaded after the clean file: nothing added.
    const again = await upload(clean.db, clean.as, csv, path)
    ok(again.res.created === 0 && JSON.stringify(await snapshot(clean.db)) === JSON.stringify(clean.snap),
      `${label}: uploaded after the clean file, adds and changes nothing (created ${again.res.created})`)
  }
  if (e.damaged) {
    const { db, as } = await openTestDb()
    await e.setup(as, db)
    const before = JSON.stringify(await snapshot(db))
    const err = await upload(db, as, file(e.damaged), e.damaged).then(() => null, (x) => x.message)
    ok(/names in this file are damaged/.test(err ?? '') && JSON.stringify(await snapshot(db)) === before,
      `${year}: the copy whose names Excel damaged stops the upload, and nothing is written`)
  }
}

console.log(`import from excel: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
