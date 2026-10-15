import { describe, expect, it } from 'vitest'
import { GalaPageNotSetError, prepareUpload, purchaseKey } from '../src/index.ts'
import { context, exportCsv } from './helpers.ts'

describe('prepareUpload', () => {
  it('case 1: a ticket where the buyer attends', async () => {
    const { rows, report } = await prepareUpload(exportCsv({ Guests: 'me' }), context())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      tierId: 'supporter', tierVia: 'mapping', seatCount: 1, cancelled: false, buyerMatch: { kind: 'new', organizationName: 'Grace Kim' },
      guestList: { kind: 'names', guests: [{ displayName: 'Grace Kim', email: 'grace.kim@example.org', isBuyer: true }], unread: [] },
    })
    expect(report).toMatchObject({ rowsRead: 1, namesPrefilled: 1, listsForSponsor: 0, reviewItems: [], rejected: [] })
  })

  it('case 12: a Champion sponsorship with 3 of 6 names', async () => {
    const { rows } = await prepareUpload(exportCsv({
      'Tier Purchased': 'Champion Sponsor', 'Total Seats': '6', 'Amount Spent': '$7,500.00', Guests: 'Jane Doe\nSam Lee\nAna Ruiz',
    }), context())
    expect(rows[0]).toMatchObject({ tierId: 'champion', seatCount: 6, guestList: { kind: 'names' } })
    expect(rows[0]!.guestList.kind === 'names' && rows[0]!.guestList.guests).toHaveLength(3)
  })

  it('case 10: an unclear list is counted for the sponsor, not staff review', async () => {
    const { report } = await prepareUpload(exportCsv({ Guests: 'Jane' }), context())
    expect(report).toMatchObject({ listsForSponsor: 1, namesPrefilled: 0, reviewItems: [] })
  })

  it('case 13 and 35: unmapped tiers create nothing, one review item per row, grouped by name for the mapping screen', async () => {
    const csv = exportCsv(
      { 'Tier Purchased': 'Ticket' },
      { 'Tier Purchased': 'ticket ', Email: 'b@example.org' },
      { 'Tier Purchased': 'Ticket', Email: 'c@example.org' },
      { 'Tier Purchased': 'VIP Table 2027', Email: 'd@example.org' },
    )
    const { rows, report } = await prepareUpload(csv, context({ tierMappings: [] }))
    expect(rows).toEqual([])
    expect(report.unknownTiers).toEqual([
      { givelivelyName: 'Ticket', pageName: null, rowNumbers: [2, 3, 4] },
      { givelivelyName: 'VIP Table 2027', pageName: null, rowNumbers: [5] },
    ])
    expect(report.reviewItems.map((i) => [i.reason, i.rowNumber])).toEqual([['unknown_tier', 2], ['unknown_tier', 3], ['unknown_tier', 4], ['unknown_tier', 5]])

    // Once staff save "Ticket" → Supporter, the same file creates three orders and raises no review.
    const again = await prepareUpload(csv.split('\n').slice(0, 4).join('\n'), context())
    expect(again.rows.map((r) => r.tierId)).toEqual(['supporter', 'supporter', 'supporter'])
    expect(again.report.reviewItems).toEqual([])
  })

  it('case 14: a shared inbox goes to review and still gets an order', async () => {
    const sponsors = [{ id: 'sp-ana', organizationName: 'Ruiz Family', primaryContactName: 'Ana Ruiz', primaryContactEmail: 'events@example.com' }]
    const { rows, report } = await prepareUpload(exportCsv({ 'First Name': 'Mark', 'Last Name': 'Lee', Email: 'events@example.com' }), context({ sponsors }))
    expect(rows).toHaveLength(1)
    expect(report.reviewItems).toMatchObject([{ reason: 'email_name_conflict', rowNumber: 2 }])
  })

  it('case 16: a guest name already on another order is a possible duplicate', async () => {
    const existingGuests = [{ id: 'g-susan', orderId: 'ord-a', displayName: 'Susan Cho', email: null, organization: 'Acme Partners' }]
    const { rows, report } = await prepareUpload(exportCsv({ Guests: 'Susan Cho' }), context({ existingGuests }))
    expect(rows[0]!.guestFindings).toEqual([{ reason: 'possible_duplicate', existingGuestId: 'g-susan', existingOrderId: 'ord-a' }])
    expect(report.reviewItems).toMatchObject([{ reason: 'possible_duplicate', details: { guest: 'Susan Cho' } }])
  })

  it('a guest whose email is already on another order is double-booked', async () => {
    const existingGuests = [{ id: 'g-susan', orderId: 'ord-a', displayName: 'Susan Cho', email: 'susan@example.org', organization: null }]
    const { report } = await prepareUpload(exportCsv({ Guests: 'Susan Cho susan@example.org' }), context({ existingGuests }))
    expect(report.reviewItems).toMatchObject([{ reason: 'double_booked' }])
  })

  it('a partly clear list pre-fills the clear names and counts the list for the sponsor', async () => {
    const { rows, report } = await prepareUpload(exportCsv({ 'Total Seats': '3', Guests: 'Jane Doe\nSam Lee\nBob' }), context())
    expect(rows[0]!.guestList).toMatchObject({ kind: 'names', unread: ['a one-word name: "Bob"'] })
    expect(report).toMatchObject({ namesPrefilled: 2, listsForSponsor: 1 })
  })

  it('the same guest named on two purchases in one file is caught', async () => {
    const { report } = await prepareUpload(exportCsv(
      { Guests: 'Susan Cho' },
      { Email: 'b@example.org', 'First Name': 'Bo', 'Last Name': 'Park', Guests: 'Susan Cho' },
    ), context())
    expect(report.reviewItems).toMatchObject([{ reason: 'possible_duplicate', rowNumber: 3 }])
  })

  it('a re-import is not matched against its own guests', async () => {
    const csv = exportCsv({ Guests: 'Susan Cho' })
    const key = (await prepareUpload(csv, context())).rows[0]!.purchaseKey
    const existingGuests = [{ id: 'g-1', orderId: 'ord-1', displayName: 'Susan Cho', email: null, organization: null }]
    const { report } = await prepareUpload(csv, context({ existingGuests, orderIdByPurchaseKey: { [key]: 'ord-1' } }))
    expect(report.reviewItems).toEqual([])
  })

  it('case 18: a full refund cancels and goes to review', async () => {
    const { rows, report } = await prepareUpload(exportCsv({ 'Amount Refunded': '$1,000.00', Status: 'refunded' }), context())
    expect(rows[0]!.cancelled).toBe(true)
    expect(report.reviewItems).toMatchObject([{ reason: 'refund' }])
  })

  it('case 19, with the status Give Lively may report: "Partially Refunded" keeps the order; "Refunded" alone cancels', async () => {
    const partial = await prepareUpload(exportCsv({ 'Amount Spent': '$500.00', 'Amount Refunded': '$250.00', Status: 'Partially Refunded' }), context())
    expect(partial.rows[0]).toMatchObject({ cancelled: false, refunded: 250 })
    const full = await prepareUpload(exportCsv({ 'Amount Spent': '$500.00', 'Amount Refunded': '$0.00', Status: 'Refunded' }), context())
    expect(full.rows[0]).toMatchObject({ cancelled: true })
  })

  it('case 19: a partial refund keeps the order', async () => {
    const { rows, report } = await prepareUpload(exportCsv({ 'Amount Spent': '$500.00', 'Amount Refunded': '$250.00' }), context())
    expect(rows[0]).toMatchObject({ cancelled: false, gross: 500, refunded: 250 })
    expect(report.reviewItems).toEqual([])
  })

  it('a failed payment cancels too', async () => {
    const { rows } = await prepareUpload(exportCsv({ Status: 'failed' }), context())
    expect(rows[0]!.cancelled).toBe(true)
  })

  it('case 22: a purchase missing from a later export, inside its date range', async () => {
    const gone = await purchaseKey('gone@example.org', '2027-02-10T15:00:00Z')
    const csv = exportCsv({ 'Date/Time of Purchase': '2027-02-01 10:00:00 AM EST' }, { Email: 'b@example.org', 'Date/Time of Purchase': '2027-02-20 10:00:00 AM EST' })
    const { report } = await prepareUpload(csv, context({ previousPurchases: [{ purchaseKey: gone, purchasedAt: '2027-02-10T15:00:00Z' }] }))
    expect(report.reviewItems).toEqual([{ reason: 'missing_from_source', purchaseKey: gone, rowNumber: null, details: { purchasedAt: '2027-02-10T15:00:00Z' } }])
  })

  it('case 31: a filtered export does not flag older purchases', async () => {
    const feb = await purchaseKey('feb@example.org', '2027-02-10T15:00:00Z')
    const csv = exportCsv({ 'Date/Time of Purchase': '2027-03-05 10:00:00 AM EST' })
    const { report } = await prepareUpload(csv, context({ previousPurchases: [{ purchaseKey: feb, purchasedAt: '2027-02-10T15:00:00Z' }] }))
    expect(report.reviewItems).toEqual([])
  })

  it('a purchase waiting on a tier mapping is not also reported missing', async () => {
    const csv = exportCsv({ 'Tier Purchased': 'VIP Table 2027' })
    const first = await prepareUpload(csv, context())
    const key = first.report.reviewItems[0]!.purchaseKey
    const { report } = await prepareUpload(csv, context({ previousPurchases: [{ purchaseKey: key, purchasedAt: '2027-02-05T22:14:46Z' }] }))
    expect(report.reviewItems.map((i) => i.reason)).toEqual(['unknown_tier'])
  })

  it('case 30: a tier renamed mid-campaign keeps the same purchase key', async () => {
    const a = await prepareUpload(exportCsv({ 'Tier Purchased': 'Champion' }), context())
    const b = await prepareUpload(exportCsv({ 'Tier Purchased': 'Champion Sponsor' }), context())
    expect(b.rows[0]!.purchaseKey).toBe(a.rows[0]!.purchaseKey)
  })

  it('case 33: the same purchase from the JSON sync has the same key', async () => {
    const { rows } = await prepareUpload(exportCsv({}), context())
    expect(rows[0]!.purchaseKey).toBe(await purchaseKey('Grace.Kim@example.org', '2027-02-05T22:14:46Z'))
  })

  it('case 37: rows from another Give Lively page are skipped and listed', async () => {
    const { rows, report } = await prepareUpload(exportCsv(
      {},
      { Email: 'b@example.org', 'Page Name': 'Year-End Appeal' },
      { Email: 'c@example.org', 'Page Name': '' },
    ), context())
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 4])
    expect(report.skippedOtherPage).toEqual([{ rowNumber: 3, pageName: 'Year-End Appeal' }])
  })

  it('with no gala page set, stops and lists the pages in the file (Oct 6)', async () => {
    const csv = exportCsv({}, { Email: 'b@example.org' }, { Email: 'c@example.org', 'Page Name': 'Year-End Appeal' }, { Email: 'd@example.org', 'Page Name': '' })
    const err = await prepareUpload(csv, context({ galaPageName: '  ' })).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(GalaPageNotSetError)
    expect((err as GalaPageNotSetError).pages).toEqual([
      { pageName: "AAFE's 52nd Annual Gala", rows: 2 },
      { pageName: 'Year-End Appeal', rows: 1 },
      { pageName: null, rows: 1 },
    ])
    expect((err as Error).message).toBe(
      "Choose this gala's Give Lively page before importing. Pages in this file: AAFE's 52nd Annual Gala (2 rows), Year-End Appeal (1 row), (no page name) (1 row)")
  })

  it('reports rows read, rejected, and the date range', async () => {
    const { report } = await prepareUpload(exportCsv({}, { Email: '' }, { Email: 'b@example.org', 'Date/Time of Purchase': '2027-03-01 09:00:00 AM EST' }), context())
    expect(report).toMatchObject({
      rowsRead: 3, rejected: [{ rowNumber: 3, reason: 'missing Email' }],
      dateRange: { earliest: '2027-02-05T22:14:46Z', latest: '2027-03-01T14:00:00Z' },
    })
  })
})
