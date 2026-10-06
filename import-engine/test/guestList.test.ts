import { describe, expect, it } from 'vitest'
import { parseGuestList } from '../src/index.ts'

const buyer = { first: 'Grace', last: 'Kim', email: 'grace.kim@example.org' }
const names = (text: string, seats = 4) => {
  const r = parseGuestList(text, seats, buyer)
  return r.kind === 'names' ? r.guests : r
}

describe('parseGuestList', () => {
  it('case 1: "me" seats the buyer with their email', () => {
    expect(names('me', 1)).toEqual([{ displayName: 'Grace Kim', email: 'grace.kim@example.org', isBuyer: true }])
    expect(names('Myself', 1)).toEqual([{ displayName: 'Grace Kim', email: 'grace.kim@example.org', isBuyer: true }])
  })

  it("the buyer's own name, in any order, is the buyer", () => {
    expect(names('Kim Grace', 1)).toEqual([{ displayName: 'Kim Grace', email: 'grace.kim@example.org', isBuyer: true }])
  })

  it("case 2: a coordinator's inbox isn't stored on the colleagues they list", () => {
    expect(names('Jane Doe grace.kim@example.org\nSam Lee grace.kim@example.org', 2)).toEqual([
      { displayName: 'Jane Doe', email: null, isBuyer: false },
      { displayName: 'Sam Lee', email: null, isBuyer: false },
    ])
  })

  it('case 6: names on separate lines, with emails', () => {
    expect(names('Jane Doe jane@example.org\nSam Lee sam@example.org')).toEqual([
      { displayName: 'Jane Doe', email: 'jane@example.org', isBuyer: false },
      { displayName: 'Sam Lee', email: 'sam@example.org', isBuyer: false },
    ])
  })

  it('case 7: a numbered list on one line', () => {
    expect(names('1. Jane Doe 2. Sam Lee')).toEqual([
      { displayName: 'Jane Doe', email: null, isBuyer: false },
      { displayName: 'Sam Lee', email: null, isBuyer: false },
    ])
  })

  it('case 8: two emails on one line', () => {
    expect(names('Jane Doe jane@example.org, Sam Lee sam@example.org')).toEqual([
      { displayName: 'Jane Doe', email: 'jane@example.org', isBuyer: false },
      { displayName: 'Sam Lee', email: 'sam@example.org', isBuyer: false },
    ])
  })

  it('reads common separators around the address, and bullets and semicolons', () => {
    expect(names('• Jane Doe <Jane@Example.org>\n- Sam Lee: sam@example.org; Ana Ruiz (ana@example.org)')).toEqual([
      { displayName: 'Jane Doe', email: 'jane@example.org', isBuyer: false },
      { displayName: 'Sam Lee', email: 'sam@example.org', isBuyer: false },
      { displayName: 'Ana Ruiz', email: 'ana@example.org', isBuyer: false },
    ])
  })

  it('case 9: nothing to name yet', () => {
    for (const t of ['TBD', 'tba', 'To follow', 'N/A', 'none', '', '  ']) expect(parseGuestList(t, 2, buyer)).toEqual({ kind: 'none' })
    expect(parseGuestList(null, 2, buyer)).toEqual({ kind: 'none' })
  })

  it('case 10: a one-word name is left for the sponsor', () => {
    expect(parseGuestList('Jane', 1, buyer)).toMatchObject({ kind: 'unclear', reasons: ['a one-word name: "Jane"'] })
  })

  it('case 11: more names than seats creates no guests', () => {
    expect(parseGuestList('Jane Doe\nSam Lee\nAna Ruiz', 2, buyer)).toEqual({ kind: 'unclear', reasons: ['3 names for 2 seats'] })
  })

  it('case 12: fewer names than seats pre-fills those names', () => {
    expect(names('Jane Doe\nSam Lee\nAna Ruiz', 6)).toHaveLength(3)
  })

  it('case 26: commas between full names split when they fit the seats', () => {
    expect(names('Jane Doe, Sam Lee', 2)).toEqual([
      { displayName: 'Jane Doe', email: null, isBuyer: false },
      { displayName: 'Sam Lee', email: null, isBuyer: false },
    ])
  })

  it("case 27: commas that don't fit the seats are left for the sponsor", () => {
    expect(parseGuestList('Jane Doe, Sam Lee, Ana Ruiz', 2, buyer).kind).toBe('unclear')
  })

  it('"Last, First" is not split into two guests', () => {
    expect(parseGuestList('Doe, Jane', 2, buyer).kind).toBe('unclear')
  })

  it('case 28: couples are left for the sponsor', () => {
    for (const t of ['John and Mary Smith', 'J & M Smith', 'John + Mary Smith']) expect(parseGuestList(t, 2, buyer).kind).toBe('unclear')
  })

  it('names containing "and" are not couples', () => {
    expect(names('Andrea Sandoval', 1)).toEqual([{ displayName: 'Andrea Sandoval', email: null, isBuyer: false }])
  })

  it('case 29: names keep their order, hyphens, and accents exactly as typed', () => {
    expect(names('Chen Wei\nMary-Jane O’Neil\nJosé Núñez')).toEqual([
      { displayName: 'Chen Wei', email: null, isBuyer: false },
      { displayName: 'Mary-Jane O’Neil', email: null, isBuyer: false },
      { displayName: 'José Núñez', email: null, isBuyer: false },
    ])
  })

  it('an email with no name, or an unreadable entry, is left for the sponsor', () => {
    expect(parseGuestList('jane@example.org', 2, buyer).kind).toBe('unclear')
    expect(parseGuestList('Table 4 guests', 2, buyer).kind).toBe('unclear')
  })

  it("the buyer's own email alone is the buyer", () => {
    expect(names('grace.kim@example.org', 1)).toEqual([{ displayName: 'Grace Kim', email: 'grace.kim@example.org', isBuyer: true }])
  })

  it('pre-fills the clear names and lists the unclear entries for the sponsor (Oct 6)', () => {
    expect(parseGuestList('Jane Doe\nSam\nJohn and Mary Smith', 4, buyer)).toEqual({
      kind: 'names',
      guests: [{ displayName: 'Jane Doe', email: null, isBuyer: false }],
      unread: ['a one-word name: "Sam"', 'a couple or pair on one line: "John and Mary Smith"'],
    })
  })

  it('a clean list has nothing unread', () => {
    expect(parseGuestList('Jane Doe', 1, buyer)).toEqual({ kind: 'names', guests: [{ displayName: 'Jane Doe', email: null, isBuyer: false }], unread: [] })
  })

  it('more names than seats pre-fills nothing, even with unclear entries mixed in', () => {
    expect(parseGuestList('Jane Doe\nSam Lee\nBob', 1, buyer)).toEqual({ kind: 'unclear', reasons: ['2 names for 1 seat', 'a one-word name: "Bob"'] })
  })
})
