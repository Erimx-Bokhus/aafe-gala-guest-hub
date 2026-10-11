// The Give Lively upload (slice C): the import engine prepares an export in the browser, and the demo's database step gives
// the same result as staff_import_givelively() on the same data; roles, the page and tier pickers, the review queue, live calls.
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDB } from '@shared/data'
import type { DB, StaffUser } from '@shared/types'
import { demoApi, liveApi } from './api'
import { GalaPageNotSetError, prepareImport, sampleExport } from './importer'
import { demoImport, setGalaPage, setTierMapping } from './store'
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
    expect(prep.prepared.report.skippedOtherPage).toHaveLength(1)
    expect(prep.prepared.report.unknownTiers.map((t) => t.givelivelyName)).toEqual(['Ticket'])
    await api.setTierMapping('Ticket', 'community_ticket')
    prep = await prepareImport(sample.csv, sample.fileName, db())
    const drafts = db().email_log.filter((m) => m.status === 'queued').length
    const r = await api.importGiveLively(prep.rows, prep.run)
    expect(r.created).toBe(3)
    expect(db().email_log.filter((m) => m.status === 'queued').length).toBe(drafts + 2)   // the refunded order gets no link
    expect(db().email_log.some((m) => m.trigger === 'givelively_sync' && m.status === 'sent' && m.approved_by == null)).toBe(false)
    expect(db().audit_log.at(-1)).toMatchObject({ action: 'import.csv', actor: ADMIN.name })
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
    expect(rpc.mock.calls).toEqual([
      ['staff_import_givelively', { p_rows: [], p_run: run }], ['staff_set_gala_page', { p_page_name: 'Page' }],
      ['staff_set_tier_mapping', { p_givelively_name: 'Ticket', p_tier_id: 'community_ticket' }], ['staff_resolve_import_review', { p_id: 'rev-1', p_resolution: 'Same person' }]])
    expect(reload).toHaveBeenCalledTimes(4)
  })
})
