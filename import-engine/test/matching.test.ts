import { describe, expect, it } from 'vitest'
import { matchBuyer, nameWordSet, normName, normOrg, type Sponsor } from '../src/index.ts'

const sponsors: Sponsor[] = [
  { id: 'sp-ana', organizationName: 'Ruiz Family', primaryContactName: 'Ana Ruiz', primaryContactEmail: 'events@example.com' },
  { id: 'sp-grace', organizationName: 'Harbor Health', primaryContactName: 'Dr. Grace Kim', primaryContactEmail: 'grace.kim@example.org' },
]

describe('normalization', () => {
  it('drops honorifics and punctuation from names', () => {
    expect(normName('Dr. Grace  Kim, Jr.')).toBe('grace kim')
    expect(normName("O'Brien")).toBe('obrien')
    expect(nameWordSet('Wei Chen')).toBe(nameWordSet('Chen Wei'))
  })
  it('drops legal suffixes and a leading "The" from organizations', () => {
    expect(normOrg('The Harbor Health Co., Inc.')).toBe('harbor health')
    expect(normOrg('Lee & Sons LLC')).toBe(normOrg('Lee and Sons'))
  })
})

describe('matchBuyer', () => {
  it('case 15: same email (any case and spacing) and last name is the same sponsor', () => {
    expect(matchBuyer({ first: 'Grace', last: 'Kim', email: ' Grace.Kim@Example.org ' }, null, sponsors))
      .toEqual({ kind: 'existing', sponsorId: 'sp-grace' })
  })
  it('case 14: a shared inbox with a different last name goes to review', () => {
    expect(matchBuyer({ first: 'Mark', last: 'Lee', email: 'events@example.com' }, null, sponsors))
      .toEqual({ kind: 'email_name_conflict', candidateSponsorIds: ['sp-ana'], organizationName: 'Mark Lee' })
  })
  it("a new buyer's organization is the company, else their name", () => {
    expect(matchBuyer({ first: 'Sam', last: 'Lee', email: 'sam@example.org' }, 'Lotus Bank', sponsors)).toEqual({ kind: 'new', organizationName: 'Lotus Bank' })
    expect(matchBuyer({ first: 'Sam', last: 'Lee', email: 'sam@example.org' }, ' ', sponsors)).toEqual({ kind: 'new', organizationName: 'Sam Lee' })
  })
})
