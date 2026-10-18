// The Give Lively upload (slice C): the import engine prepares an export in the browser, and the demo's database step gives
// the same result as staff_import_givelively() on the same data; roles, the page and tier pickers, the review queue, live calls.
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDB } from '@shared/data'
import type { DB, StaffUser } from '@shared/types'
import { demoApi, liveApi } from './api'
import { GalaPageNotSetError, importProblem, prepareImport, sampleExport } from './importer'
import { addGalaPage, demoImport, setGalaPage, setTierMapping } from './store'
import { GALA_PAGE, exportCsv } from '../../../import-engine/test/helpers.ts'
// @ts-expect-error plain JavaScript helper shared with the backend tests
import { openTestDb } from '../../scripts/test-db.mjs'

const staff = (role: StaffUser['role']): StaffUser => ({ id: `st-${role}`, name: `Test ${role}`, email: `${role}@aafe-demo.example.org`, role })
const ADMIN = staff('gala_admin'), RM = staff('relationship_manager')
const ADMIN_EMAIL = 'mei.ortiz@aafe-demo.example.org'
const GUESTS = 'Please list the name(s) and email address(es) of all guests. To revise, email gala@aafe.org.'

// Invented purchases covering each path: a mapped ticket with two names, a sponsorship by tier name, a refund, an unknown
// ticket type, a shared inbox (an existing sponsor's email, another last name), and a name already on another sponsor's list.
const CSV = exportCsv(
  { 'First Name': 'Ana', 'Last Name': 'Ruiz', Email: 'ana.ruiz@example.org', 'Tickets Purchased': '2', 'Total Seats': '2', 'Amount Spent': '$500.00',
    'Date/Time of Purchase': '2027-02-01 10:00:00 AM EST', [GUESTS]: 'Ana Ruiz\nSam Park sam.park@example.org' },
  { 'First Name': 'Lena', 'Last Name': 'Ortiz', Email: 'lena.ortiz@example.org', 'Tier Purchased': 'Silver Sponsor', 'Tier Category': 'Sponsorship',
    'Total Seats': '8', 'Amount Spent': '$15,000.00', 'Company/Organization Name': 'Harbor Sample Partners', 'Date/Time of Purchase': '2027-02-02 11:00:00 AM EST', [GUESTS]: 'TBD' },
  { 'First Name': 'Owen', 'Last Name': 'Reyes', Email: 'owen.reyes@example.org', 'Amount Spent': '$250.00', 'Amount Refunded': '$250.00', Status: 'refunded',
    'Date/Time of Purchase': '2027-02-03 12:00:00 PM EST' },
  { 'First Name': 'Ivy', 'Last Name': 'Chen', Email: 'ivy.chen@example.org', 'Tier Purchased': 'VIP Table', 'Tier Category': 'Ticket', 'Amount Spent': '$900.00',
    'Date/Time of Purchase': '2027-02-04 01:00:00 PM EST' },
  { 'First Name': 'Jordan', 'Last Name': 'Smith', Email: 'jordan.lee@acmepartners.example.org', 'Amount Spent': '$250.00', 'Date/Time of Purchase': '2027-02-05 02:00:00 PM EST' },
  { 'First Name': 'Kai', 'Last Name': 'Moore', Email: 'kai.moore@example.org', 'Amount Spent': '$250.00', 'Date/Time of Purchase': '2027-02-06 03:00:00 PM EST', [GUESTS]: 'Evelyn Park' },
)

/** The demo data with this gala's page chosen and "Ticket" linked to the community ticket, as staff would set them. */
const ready = (): DB => setTierMapping(setGalaPage(loadDB(), ADMIN, GALA_PAGE), ADMIN, 'Ticket', 'community_ticket')
const summary = (r: { created: number; skipped: number; unknown_tier: number; names_prefilled: number; review_items: number; missing_from_source: number }) =>
  ({ created: r.created, skipped: r.skipped, unknown_tier: r.unknown_tier, names_prefilled: r.names_prefilled, review_items: r.review_items, missing_from_source: r.missing_from_source })

describe('the demo import matches the database', () => {
  it('same counts, orders, seats, names and review items as staff_import_givelively on the same data, and a re-upload changes nothing', async () => {
    const { db: pg, as } = await openTestDb()
    await as('authenticated', ADMIN_EMAIL, 'select staff_set_gala_page($1)', [GALA_PAGE])
    await as('authenticated', ADMIN_EMAIL, `select staff_set_tier_mapping('Ticket', 'community_ticket')`)
    const before = ready()
    const { rows, run } = await prepareImport(CSV, 'sample.csv', before)
    const server = (await as('authenticated', ADMIN_EMAIL, 'select staff_import_givelively($1, $2) r', [JSON.stringify(rows), JSON.stringify(run)]))[0].r
    const { db: after, result } = demoImport(before, ADMIN, rows, run)
    expect(summary(result)).toEqual(summary(server))
    expect(result).toMatchObject({ created: 5, unknown_tier: 1, names_prefilled: 3 })

    // Each new order: package, status, seats and named seats; and the open review reasons.
    const sqlOrders = (await pg.query(`select o.tier_id, o.status, (select count(*)::int from seats s where s.order_id = o.id) seats,
        (select count(*)::int from seats s where s.order_id = o.id and s.guest_id is not null) named
      from orders o join payments p on p.order_id = o.id where p.purchase_key is not null order by p.purchase_key`)).rows
    const keys = new Set(rows.map((r) => r.purchase_key))
    const demoOrders = after.payments.filter((p) => p.purchase_key && keys.has(p.purchase_key)).sort((a, b) => a.purchase_key!.localeCompare(b.purchase_key!))
      .map((p) => { const o = after.orders.find((x) => x.id === p.order_id)!; const s = after.seats.filter((x) => x.order_id === o.id)
        return { tier_id: o.tier_id, status: o.status, seats: s.length, named: s.filter((x) => x.guest_id).length } })
    expect(demoOrders).toEqual(sqlOrders)
    const sqlReasons = (await pg.query(`select reason from import_review where status = 'open' order by reason`)).rows.map((r: { reason: string }) => r.reason)
    expect(after.import_review!.filter((v) => v.status === 'open').map((v) => v.reason).sort()).toEqual(sqlReasons)
    expect(sqlReasons).toEqual(['email_name_conflict', 'possible_duplicate', 'refund', 'unknown_tier'])

    // Uploading the same file again: every purchase recognized, nothing added (both sides).
    const again = await prepareImport(CSV, 'sample.csv', after)
    const server2 = (await as('authenticated', ADMIN_EMAIL, 'select staff_import_givelively($1, $2) r', [JSON.stringify(again.rows), JSON.stringify(again.run)]))[0].r
    const demo2 = demoImport(after, ADMIN, again.rows, again.run).result
    expect(demo2.created).toBe(0)
    expect(summary(demo2)).toEqual(summary(server2))
  }, 120_000)
})

describe("Community Tickets: another of the gala's pages (Gate 1b, #147)", () => {
  it('the demo and the database agree: a review named with its page, its own link, paid at what was paid', async () => {
    const COMMUNITY = `${GALA_PAGE} (Community Tickets)`
    const { db: pg, as } = await openTestDb()
    const admin = (sql: string, params?: unknown[]) => as('authenticated', ADMIN_EMAIL, sql, params)
    await admin('select staff_set_gala_page($1)', [GALA_PAGE])
    await admin(`select staff_set_tier_mapping('Ticket', 'corporate_ticket')`)
    await admin('select staff_add_gala_page($1)', [COMMUNITY])
    let demo = addGalaPage(setTierMapping(setGalaPage(loadDB(), ADMIN, GALA_PAGE), ADMIN, 'Ticket', 'corporate_ticket'), ADMIN, COMMUNITY)
    // Two community tickets for $500, and a $250 main-page ticket on the $500 level (a discount code).
    const csv = exportCsv(
      { Email: 'ana.ruiz@example.org', 'Page Name': COMMUNITY, 'Tickets Purchased': '2', 'Total Seats': '2', 'Amount Spent': '$500.00' },
      { Email: 'ben.ito@example.org', 'Amount Spent': '$250.00', 'Date/Time of Purchase': '2027-02-06 03:00:00 PM EST' },
    )
    const both = async () => {
      const { rows, run } = await prepareImport(csv, 'community.csv', demo)
      const server = (await admin('select staff_import_givelively($1, $2) r', [JSON.stringify(rows), JSON.stringify(run)]))[0].r
      const local = demoImport(demo, ADMIN, rows, run)
      demo = local.db
      expect(summary(local.result)).toEqual(summary(server))
    }
    const openTiers = async () => ({
      sql: (await pg.query(`select details from import_review where reason = 'unknown_tier' and status = 'open'`)).rows.map((r: { details: unknown }) => r.details),
      demo: demo.import_review!.filter((v) => v.reason === 'unknown_tier' && v.status === 'open').map((v) => v.details),
    })

    await both()
    expect(await openTiers()).toEqual({ sql: [{ tier_purchased: 'Ticket', page: COMMUNITY }], demo: [{ tier_purchased: 'Ticket', page: COMMUNITY }] })
    await admin(`select staff_set_tier_mapping('Ticket', 'community_ticket', $1)`, [COMMUNITY])
    demo = setTierMapping(demo, ADMIN, 'Ticket', 'community_ticket', COMMUNITY)
    expect(await openTiers()).toEqual({ sql: [], demo: [] })
    await both()

    type Row = { tier_id: string; status: string; commitment_amount: number; givelively_page: string | null; internal_notes: string }
    const sqlOrders: Row[] = (await pg.query(`select o.tier_id, o.status, o.commitment_amount::float commitment_amount, o.givelively_page, o.internal_notes
      from orders o join payments p on p.order_id = o.id where p.purchase_key is not null order by p.purchase_key`)).rows
    const demoOrders = demo.payments.filter((p) => p.purchase_key).sort((a, b) => a.purchase_key!.localeCompare(b.purchase_key!))
      .map((p) => { const o = demo.orders.find((x) => x.id === p.order_id)!
        return { tier_id: o.tier_id, status: o.status, commitment_amount: o.commitment_amount, givelively_page: o.givelively_page, internal_notes: o.internal_notes } })
    expect(demoOrders).toEqual(sqlOrders)
    expect(sqlOrders.map((o) => [o.tier_id, o.status, o.commitment_amount]).sort()).toEqual([['community_ticket', 'paid', 500], ['corporate_ticket', 'paid', 250]])
    expect(sqlOrders.find((o) => o.tier_id === 'corporate_ticket')!.internal_notes).toContain("Discounted: paid $250.00, $500.00 at the level's price.")
  }, 120_000)
})

describe('the upload screen, in demo mode', () => {
  function demo(user: StaffUser) {
    let data = loadDB()
    return { api: demoApi(user, (fn) => { data = fn(data) }, () => data), db: () => data }
  }

  it('asks for the gala page first, then the ticket type, then imports, and links go out only as drafts', async () => {
    const { api, db } = demo(ADMIN)
    const sample = sampleExport(db())
    await expect(prepareImport(sample.csv, sample.fileName, db())).rejects.toBeInstanceOf(GalaPageNotSetError)
    await api.setGalaPage("AAFE's 53rd Annual Gala")
    let prep = await prepareImport(sample.csv, sample.fileName, db())
    expect(prep.prepared.report.skippedOtherPage).toHaveLength(2)
    expect(prep.prepared.report.unknownTiers.map((t) => t.givelivelyName)).toEqual(['Ticket'])
    await api.setTierMapping('Ticket', 'community_ticket')
    prep = await prepareImport(sample.csv, sample.fileName, db())
    const drafts = db().email_log.filter((m) => m.status === 'queued').length
    const r = await api.importGiveLively(prep.rows, prep.run)
    expect(r.created).toBe(3)
    expect(db().email_log.filter((m) => m.status === 'queued').length).toBe(drafts + 2)   // the refunded order gets no link
    expect(db().email_log.some((m) => m.trigger === 'givelively_sync' && m.status === 'sent' && m.approved_by == null)).toBe(false)
    expect(db().audit_log.at(-1)).toMatchObject({ action: 'import.csv', actor: ADMIN.name })

    // The same file offers its Community Tickets page; once added, its "Ticket" waits for a link of its own (Gate 1b).
    const community = "AAFE's 53rd Annual Gala (Community Tickets)"
    await api.addGalaPage(community)
    prep = await prepareImport(sample.csv, sample.fileName, db())
    expect(prep.prepared.report.skippedOtherPage.map((s) => s.pageName)).toEqual(['AAFE Spring Benefit Raffle'])
    expect(prep.prepared.report.unknownTiers).toEqual([{ givelivelyName: 'Ticket', pageName: community, rowNumbers: [5] }])
    await expect(api.addGalaPage(community.toUpperCase())).rejects.toThrow('invalid_input')
    await api.setTierMapping('Ticket', 'community_ticket', community)
    prep = await prepareImport(sample.csv, sample.fileName, db())
    expect((await api.importGiveLively(prep.rows, prep.run)).created).toBe(1)
    expect(db().orders.at(-1)).toMatchObject({ tier_id: 'community_ticket', status: 'paid', commitment_amount: 500, givelively_page: community })
    await api.removeGalaPage(community)
    expect(db().gala_events.find((e) => e.id === db().meta.current_event_id)!.givelively_other_pages).toEqual([])
    await expect(api.removeGalaPage(community)).rejects.toThrow('not_found')
  })

  it('a relationship manager decides close calls but cannot import, pick the page or link tiers', async () => {
    const admin = demo(ADMIN)
    const sample = sampleExport(admin.db())
    await admin.api.setGalaPage("AAFE's 53rd Annual Gala")
    await admin.api.setTierMapping('Ticket', 'community_ticket')
    const prep = await prepareImport(sample.csv, sample.fileName, admin.db())
    const rm = demo(RM)
    await expect(rm.api.importGiveLively(prep.rows, prep.run)).rejects.toThrow('forbidden')
    await expect(rm.api.setGalaPage('x')).rejects.toThrow('forbidden')
    await expect(rm.api.setTierMapping('Ticket', 'community_ticket')).rejects.toThrow('forbidden')
    await expect(rm.api.addGalaPage('x')).rejects.toThrow('forbidden')
    await expect(rm.api.removeGalaPage('x')).rejects.toThrow('forbidden')
    await admin.api.importGiveLively(prep.rows, prep.run)
    const refund = admin.db().import_review!.find((v) => v.reason === 'refund' && v.status === 'open')!
    await admin.api.resolveImportReview(refund.id, 'Keep seats cancelled')
    expect(admin.db().import_review!.find((v) => v.id === refund.id)).toMatchObject({ status: 'resolved', resolution: 'Keep seats cancelled' })
    await expect(admin.api.resolveImportReview(refund.id, 'again')).rejects.toThrow('not_found')
  })
})

describe('live mode', () => {
  it('one staff_* call each, then reload', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { created: 1 }, error: null })
    const reload = vi.fn().mockResolvedValue(undefined)
    const api = liveApi({ rpc } as unknown as SupabaseClient, reload)
    const run = { file_name: 'f.csv', file_hash: 'h', earliest: null, latest: null, missing: [], report: {} as never }
    expect(await api.importGiveLively([], run)).toEqual({ created: 1 })
    await api.setGalaPage('Page'); await api.setTierMapping('Ticket', 'community_ticket'); await api.resolveImportReview('rev-1', 'Same person')
    await api.addGalaPage('Other'); await api.setTierMapping('Ticket', 'community_ticket', 'Other'); await api.removeGalaPage('Other')
    expect(rpc.mock.calls).toEqual([
      ['staff_import_givelively', { p_rows: [], p_run: run }], ['staff_set_gala_page', { p_page_name: 'Page' }],
      ['staff_set_tier_mapping', { p_givelively_name: 'Ticket', p_tier_id: 'community_ticket', p_page: null }], ['staff_resolve_import_review', { p_id: 'rev-1', p_resolution: 'Same person' }],
      ['staff_add_gala_page', { p_page_name: 'Other' }], ['staff_set_tier_mapping', { p_givelively_name: 'Ticket', p_tier_id: 'community_ticket', p_page: 'Other' }],
      ['staff_remove_gala_page', { p_page_name: 'Other' }]])
    expect(reload).toHaveBeenCalledTimes(7)
  })
})

describe('what the upload screen says when a file stops it (Gate 3)', () => {
  it("gives the engine's reason for a format problem, with one period; for anything else, what to do", async () => {
    const empty = await prepareImport('', 'empty.csv', loadDB()).catch((e: unknown) => e)
    expect(importProblem(empty)).toBe("This file can't be imported: the file is empty. Download the attendee export from Give Lively again.")
    const unclosed = await prepareImport('Email,Amount Spent,Date/Time of Purchase,Tier Purchased,Last Name,First Name\n' +
      'ana.ruiz@example.org,$500.00,2027-03-02 10:00:00 AM EST,"Ticket,Ruiz,Ana\n', 'quote.csv', loadDB()).catch((e: unknown) => e)
    expect(importProblem(unclosed)).toMatch(/can't be read\. Export the file from Give Lively again and upload it without opening it\.$/)
    expect(importProblem(new Error('internal error: a purchase time always matches PATTERN here')))
      .toBe('Something in this file stopped the import. Download the export from Give Lively again and retry; if it happens again, ask the technical partner.')
  })
})

// Gate 1 (#146): what an upload records for each payment, the same in the demo and the database. AAFE's ticket export has no
// processor fee column, so the fee is unknown (null), not $0, and net with it; a wallet is a card with the wallet named.
describe("payments from an upload: Natalie's 2027 export and the wallets (Gate 1)", () => {
  it('the demo and the database record each payment the same: method, wallet, fee and net unknown', async () => {
    const MAIN = "AAFE's 53rd Annual Gala", COMMUNITY = "AAFE's 53rd Annual Gala (Community Tickets)"
    const natalie = readFileSync(new URL('../../../import-engine/test/fixtures/gala-2027-demo/givelively-export.csv', import.meta.url), 'utf8')
    const wallets = exportCsv(...['Apple Pay', 'Google Pay', 'PayPal', 'Venmo', 'DAF Pay', 'Mystery Wallet'].map((m, i) => ({
      Email: `wallet${i}@example.org`, 'Last Name': `Buyer${i}`, 'Page Name': MAIN, 'Tier Purchased': 'Supporter Sponsor', 'Tier Category': 'Sponsorship',
      'Amount Spent': '$1,000.00', 'Payment Method': m, 'Date/Time of Purchase': `2027-04-0${i + 1} 10:00:00 AM EDT` })))
    const { db: pg, as } = await openTestDb()
    const admin = (sql: string, params?: unknown[]) => as('authenticated', ADMIN_EMAIL, sql, params)
    await admin('select staff_set_gala_page($1)', [MAIN])
    await admin('select staff_add_gala_page($1)', [COMMUNITY])
    await admin(`select staff_set_tier_mapping('Ticket', 'corporate_ticket')`)
    await admin(`select staff_set_tier_mapping('Community Ticket', 'community_ticket', $1)`, [COMMUNITY])
    let demo = setTierMapping(setTierMapping(addGalaPage(setGalaPage(loadDB(), ADMIN, MAIN), ADMIN, COMMUNITY), ADMIN, 'Ticket', 'corporate_ticket'),
      ADMIN, 'Community Ticket', 'community_ticket', COMMUNITY)
    for (const [csv, name] of [[natalie, 'AAFE-2027-GiveLively-export-DEMO.csv'], [wallets, 'wallets.csv']]) {
      const { rows, run } = await prepareImport(csv, name, demo)
      await admin('select staff_import_givelively($1, $2) r', [JSON.stringify(rows), JSON.stringify(run)])
      demo = demoImport(demo, ADMIN, rows, run).db
    }
    const sql = (await pg.query(`select purchase_key, method, method_detail, transaction_fee_amount fee, net_amount net,
        reconciliation_status = 'needs_review' flagged from payments where purchase_key is not null order by purchase_key`)).rows
    const local = demo.payments.filter((p) => p.purchase_key && sql.some((r: { purchase_key: string }) => r.purchase_key === p.purchase_key))
      .sort((a, b) => a.purchase_key!.localeCompare(b.purchase_key!))
      .map((p) => ({ purchase_key: p.purchase_key, method: p.method, method_detail: p.method_detail ?? null, fee: p.transaction_fee_amount, net: p.net_amount,
        flagged: p.reconciliation_status === 'needs_review' }))
    expect(sql).toHaveLength(33)   // 27 from Natalie's file (not the raffle) and 6 wallets
    expect(local).toEqual(sql)
    expect(sql.every((p: { fee: unknown; net: unknown }) => p.fee === null && p.net === null)).toBe(true)
    expect(sql.filter((p: { method_detail: string | null }) => p.method_detail).map((p: { method_detail: string }) => p.method_detail).sort())
      .toEqual(['Apple Pay', 'Donor-advised fund', 'Google Pay', 'PayPal', 'Venmo'])
    expect(sql.filter((p: { flagged: boolean }) => p.flagged)).toHaveLength(1)   // only the method nobody recognizes
  }, 120_000)
})
