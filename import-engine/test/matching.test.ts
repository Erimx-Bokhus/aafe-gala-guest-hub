import { describe, expect, it } from 'vitest'
import { matchBuyer, matchGuest, nameWordSet, normName, normOrg, type ExistingGuest, type Sponsor } from '../src/index.ts'

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

describe('matchGuest', () => {
  const existing: ExistingGuest[] = [
    { id: 'g-susan', orderId: 'ord-a', displayName: 'Susan Cho', email: null, organization: 'Acme Partners' },
    { id: 'g-wei', orderId: 'ord-a', displayName: 'Wei Chen', email: 'wei@example.org', organization: 'Harbor Health' },
    { id: 'g-jane', orderId: 'ord-a', displayName: 'Jane Doe', email: 'jane@example.org', organization: 'Lotus Bank' },
  ]
  it('case 16: the same name on another order is double-booked', () => {
    expect(matchGuest({ displayName: 'Susan Cho', email: null, organization: null }, 'ord-b', existing))
      .toEqual({ reason: 'double_booked', existingGuestId: 'g-susan', existingOrderId: 'ord-a' })
  })
  it('case 17: the same words in another order, same organization, are double-booked', () => {
    expect(matchGuest({ displayName: 'Chen Wei', email: null, organization: 'Harbor Health Inc' }, 'ord-b', existing))
      .toMatchObject({ reason: 'double_booked', existingGuestId: 'g-wei' })
  })
  it('the same name at a different known organization is only a possible duplicate', () => {
    expect(matchGuest({ displayName: 'Susan Cho', email: null, organization: 'Other Org' }, 'ord-b', existing))
      .toMatchObject({ reason: 'possible_duplicate', existingGuestId: 'g-susan' })
  })
  it('same email and last name is double-booked, whatever the first name', () => {
    expect(matchGuest({ displayName: 'Janet Doe', email: 'JANE@example.org', organization: null }, 'ord-b', existing))
      .toMatchObject({ reason: 'double_booked', existingGuestId: 'g-jane' })
  })
  it('same first initial and last name at the same organization is a possible duplicate', () => {
    expect(matchGuest({ displayName: 'J. Doe', email: null, organization: 'Lotus Bank' }, 'ord-b', existing))
      .toMatchObject({ reason: 'possible_duplicate', existingGuestId: 'g-jane' })
  })
  it('ignores guests on the same order, and unrelated names', () => {
    expect(matchGuest({ displayName: 'Susan Cho', email: null, organization: null }, 'ord-a', existing)).toBeNull()
    expect(matchGuest({ displayName: 'Ana Ruiz', email: null, organization: null }, 'ord-b', existing)).toBeNull()
  })
})
