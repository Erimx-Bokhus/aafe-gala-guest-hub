// More than one Give Lively page per gala (Gate 1b, #147): AAFE sells discounted tickets on a second, private page
// ("Community Tickets", seen on the Oct 14 call). Invented data only (hard rule 1).
import { describe, expect, it } from 'vitest'
import { isGalaPage, prepareUpload, resolveTier, type Tier, type TierMapping } from '../src/index.ts'
import { context, exportCsv, GALA_PAGE, TIERS } from './helpers.ts'

const COMMUNITY = "AAFE's 52nd Annual Gala (Community Tickets)"
const WITH_COMMUNITY_LEVEL: Tier[] = [...TIERS, { id: 'community_ticket', name: 'Community Ticket', tierCategory: 'ticket', includedSeatCount: 1 }]

describe('Community Tickets: more than one Give Lively page per gala', () => {
  it("imports purchases from any of the gala's pages, and still skips other pages", async () => {
    const csv = exportCsv(
      {},
      { Email: 'b@example.org', 'Page Name': COMMUNITY, 'Amount Spent': '$250.00' },
      { Email: 'c@example.org', 'Page Name': 'Spring Appeal' },
    )
    const mainOnly = await prepareUpload(csv, context())
    expect(mainOnly.rows.map((r) => r.pageName)).toEqual([GALA_PAGE])
    expect(mainOnly.report.skippedOtherPage.map((s) => s.pageName)).toEqual([COMMUNITY, 'Spring Appeal'])

    const tierMappings = [{ givelivelyName: 'Ticket', tierId: 'supporter' }, { givelivelyName: 'Ticket', tierId: 'supporter', pageName: COMMUNITY }]
    const both = await prepareUpload(csv, context({ otherPages: [COMMUNITY], tierMappings }))
    expect(both.rows.map((r) => r.pageName)).toEqual([GALA_PAGE, COMMUNITY])
    expect(both.report.skippedOtherPage.map((s) => s.pageName)).toEqual(['Spring Appeal'])
  })

  it("another page's purchases get a level only from a mapping made for that page, never the main page's or by name", async () => {
    const main: TierMapping = { givelivelyName: 'Ticket', tierId: 'supporter' }
    const community: TierMapping = { givelivelyName: 'Ticket', tierId: 'community_ticket', pageName: COMMUNITY }
    expect(resolveTier('Ticket', [main], WITH_COMMUNITY_LEVEL, COMMUNITY)).toBeNull()
    expect(resolveTier('Supporter', [], WITH_COMMUNITY_LEVEL, COMMUNITY)).toBeNull()   // the main page would match it by name
    expect(resolveTier('Supporter', [], WITH_COMMUNITY_LEVEL, null)?.tier.id).toBe('supporter')
    expect(resolveTier('Ticket', [main, community], WITH_COMMUNITY_LEVEL, COMMUNITY)?.tier.id).toBe('community_ticket')
    expect(resolveTier('Ticket', [community], WITH_COMMUNITY_LEVEL, null)).toBeNull()   // nor the other way round

    // Uploaded before the community page has its own mapping: its row waits, named with its page; the main page's imports.
    const csv = exportCsv({}, { Email: 'b@example.org', 'Page Name': COMMUNITY, 'Amount Spent': '$250.00' })
    const before = await prepareUpload(csv, context({ otherPages: [COMMUNITY], tiers: WITH_COMMUNITY_LEVEL, tierMappings: [main] }))
    expect(before.rows.map((x) => [x.pageName, x.tierId])).toEqual([[GALA_PAGE, 'supporter']])
    expect(before.report.unknownTiers).toEqual([{ givelivelyName: 'Ticket', pageName: COMMUNITY, rowNumbers: [3] }])
    expect(before.report.reviewItems.find((i) => i.reason === 'unknown_tier')?.details).toEqual({ tierPurchased: 'Ticket', page: COMMUNITY })

    const after = await prepareUpload(csv, context({ otherPages: [COMMUNITY], tiers: WITH_COMMUNITY_LEVEL, tierMappings: [main, community] }))
    expect(after.rows.map((x) => [x.pageName, x.tierId])).toEqual([[GALA_PAGE, 'supporter'], [COMMUNITY, 'community_ticket']])
  })

  it("uploading the Community Tickets export doesn't report the main page's purchases as missing", async () => {
    const at = '2027-02-05T22:14:46Z'   // the export's purchase time, inside its date range
    const previous = [
      { purchaseKey: 'k-old', purchasedAt: at },          // no page: imported before pages were recorded, the main page's
      { purchaseKey: 'k-main', purchasedAt: at, pageName: GALA_PAGE },
      { purchaseKey: 'k-comm', purchasedAt: at, pageName: COMMUNITY },
    ]
    const csv = exportCsv({ Email: 'b@example.org', 'Page Name': COMMUNITY })
    const mapped = [{ givelivelyName: 'Ticket', tierId: 'supporter', pageName: COMMUNITY }]
    const r = await prepareUpload(csv, context({ otherPages: [COMMUNITY], previousPurchases: previous, tierMappings: mapped }))
    expect(r.report.reviewItems.filter((i) => i.reason === 'missing_from_source').map((i) => i.purchaseKey)).toEqual(['k-comm'])
  })

  it('a page matches on Page Name or Internal Name, normalized, against one page or several', () => {
    const row = (pageName: string | null, internalName: string | null = null) => ({ pageName, internalName })
    expect(isGalaPage(row(GALA_PAGE), GALA_PAGE, { allowBlank: false })).toBe(true)
    expect(isGalaPage(row(`  ${COMMUNITY.toUpperCase()} `), [GALA_PAGE, COMMUNITY], { allowBlank: false })).toBe(true)
    expect(isGalaPage(row(null, COMMUNITY), [GALA_PAGE, COMMUNITY], { allowBlank: false })).toBe(true)
    expect(isGalaPage(row('Spring Appeal'), [GALA_PAGE, COMMUNITY], { allowBlank: true })).toBe(false)
    expect(isGalaPage(row(null), [GALA_PAGE], { allowBlank: true })).toBe(true)
    expect(isGalaPage(row(null), [GALA_PAGE], { allowBlank: false })).toBe(false)
  })
})
