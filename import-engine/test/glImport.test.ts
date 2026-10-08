import { describe, expect, it } from 'vitest'
import { prepareUpload, purchaseKey, toGlImport } from '../src/index.ts'
import { context, exportCsv } from './helpers.ts'

describe('toGlImport', () => {
  it('maps a prepared row to the shape gl_import() reads', async () => {
    const csv = exportCsv({ 'Total Seats': '2', 'Tickets Purchased': '2', 'Transaction Fee Covered': '$30.00', 'Amount Spent': '$1,030.00', Guests: 'Jane Doe jane@example.org\nme' })
    const { rows, run } = await toGlImport(await prepareUpload(csv, context()), 'export.csv', csv)
    expect(rows).toEqual([{
      purchase_key: await purchaseKey('grace.kim@example.org', '2027-02-05T22:14:46Z'),
      date: '2027-02-05T22:14:46Z', first: 'Grace', last: 'Kim', email: 'grace.kim@example.org', company: null,
      campaign: "AAFE's 52nd Annual Gala", ticket_level: 'Ticket', tier_id: 'supporter', method: 'Stripe Card', status: 'succeeded',
      quantity: 2, seats: 2, original: 1000, covered: 30, gross: 1030, refunded: 0, cancelled: false,
    }])
    // The guest list typed in Give Lively never reaches the database (decided Oct 7).
    expect(JSON.stringify({ rows, run })).not.toMatch(/Jane Doe|jane@example\.org/)
    expect(run).toMatchObject({ file_name: 'export.csv', earliest: '2027-02-05T22:14:46Z', latest: '2027-02-05T22:14:46Z', missing: [] })
    expect(run.file_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('sends rows waiting on a tier mapping without a tier, so the database records the review', async () => {
    const csv = exportCsv({ 'Tier Purchased': 'VIP Table 2027' })
    const { rows } = await toGlImport(await prepareUpload(csv, context()), 'f.csv', csv)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.tier_id).toBeUndefined()
    expect(rows[0]!.ticket_level).toBe('VIP Table 2027')
  })

  it('carries missing purchases', async () => {
    const gone = await purchaseKey('gone@example.org', '2027-02-05T23:00:00Z')
    const csv = exportCsv({ Guests: 'Susan Cho' }, { Email: 'b@example.org', 'Date/Time of Purchase': '2027-02-06 10:00:00 AM EST' })
    const prepared = await prepareUpload(csv, context({
      previousPurchases: [{ purchaseKey: gone, purchasedAt: '2027-02-05T23:00:00Z' }],
    }))
    const { run } = await toGlImport(prepared, 'f.csv', csv)
    expect(run.missing).toEqual([{ purchase_key: gone, purchased_at: '2027-02-05T23:00:00Z' }])
  })
})
