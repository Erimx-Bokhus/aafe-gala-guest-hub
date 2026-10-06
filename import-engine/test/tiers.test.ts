import { describe, expect, it } from 'vitest'
import { isGalaPage, resolveTier, seatCount } from '../src/index.ts'
import { GALA_PAGE, TIERS } from './helpers.ts'

const tier = (id: string) => TIERS.find((t) => t.id === id)!

describe('resolveTier', () => {
  it('case 34: the tier mapping wins, matched case- and space-insensitively', () => {
    expect(resolveTier('  TICKET ', [{ givelivelyName: 'Ticket', tierId: 'supporter' }], TIERS)).toEqual({ tier: tier('supporter'), via: 'mapping' })
  })

  it('case 35: "Ticket" with no mapping matches no tier', () => {
    expect(resolveTier('Ticket', [], TIERS)).toBeNull()
  })

  it("falls back to Natalie's longest-name match on the part before the dash", () => {
    expect(resolveTier('Gold Sponsorship 2027', [], TIERS)).toEqual({ tier: tier('gold'), via: 'name' })
    expect(resolveTier('Champion Sponsor', [], TIERS)).toEqual({ tier: tier('champion'), via: 'name' })
  })

  it('never matches a complimentary tier from Give Lively', () => {
    expect(resolveTier('Complimentary Ticket', [], TIERS)).toBeNull()
  })

  it('case 13: an unknown tier name is null', () => {
    expect(resolveTier('VIP Table 2027', [], TIERS)).toBeNull()
  })

  it('a mapping to a tier that no longer exists falls through', () => {
    expect(resolveTier('Ticket', [{ givelivelyName: 'Ticket', tierId: 'gone' }], TIERS)).toBeNull()
  })
})

describe('seatCount', () => {
  it("prefers the export's Total Seats", () => {
    expect(seatCount(tier('champion'), 6, 1)).toBe(6)
    expect(seatCount(tier('supporter'), 3, 3)).toBe(3)
  })
  it('falls back to seats per tier × tickets', () => {
    expect(seatCount(tier('friend'), null, 2)).toBe(4)
    expect(seatCount(tier('supporter'), null, null)).toBe(1)
  })
  it('gives ad-only tiers no seats', () => {
    expect(seatCount(tier('full_page_ad'), 1, 1)).toBe(0)
  })
})

describe('isGalaPage', () => {
  const csv = { allowBlank: true }
  const sync = { allowBlank: false }
  it("case 37: the CSV upload keeps this gala's page and blank pages, and skips others", () => {
    expect(isGalaPage({ pageName: "aafe's 52nd  annual gala", internalName: null }, GALA_PAGE, csv)).toBe(true)
    expect(isGalaPage({ pageName: null, internalName: null }, GALA_PAGE, csv)).toBe(true)
    expect(isGalaPage({ pageName: 'Year-End Appeal', internalName: null }, GALA_PAGE, csv)).toBe(false)
  })
  it('matches on Internal Name too', () => {
    expect(isGalaPage({ pageName: 'Gala tickets', internalName: GALA_PAGE }, GALA_PAGE, csv)).toBe(true)
  })
  it('case 38: the sync keeps only the gala page, never blank pages', () => {
    expect(isGalaPage({ pageName: GALA_PAGE, internalName: null }, GALA_PAGE, sync)).toBe(true)
    expect(isGalaPage({ pageName: 'Year-End Appeal', internalName: null }, GALA_PAGE, sync)).toBe(false)
    expect(isGalaPage({ pageName: null, internalName: null }, GALA_PAGE, sync)).toBe(false)
  })
  it('is exact, not a substring match like the old campaign setting', () => {
    expect(isGalaPage({ pageName: "AAFE's 52nd Annual Gala Auction", internalName: null }, GALA_PAGE, sync)).toBe(false)
  })
  it('matches nothing when the gala has no page name set', () => {
    expect(isGalaPage({ pageName: GALA_PAGE, internalName: null }, null, sync)).toBe(false)
  })
})
