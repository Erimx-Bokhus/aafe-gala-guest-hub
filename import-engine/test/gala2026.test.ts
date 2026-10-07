// A full-size, messy, invented gala shaped like AAFE's 2026 one (test/fixtures/gala-2026/): every Give
// Lively row is checked against what the import should make of it.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { prepareUpload, toGlImport, type PreparedRow } from '../src/index.ts'
import { DIR, FILES, render } from './fixtures/gala-2026/generate.mts'
import { context } from './helpers.ts'

const csv = readFileSync(DIR + FILES.csv, 'utf8')
const expected = JSON.parse(readFileSync(DIR + FILES.expected, 'utf8'))
const staffAdded = JSON.parse(readFileSync(DIR + FILES.staff, 'utf8'))
type Row = (typeof expected.rows)[number]
const rowsOf = (category: string): Row[] => expected.rows.filter((r: Row) => r.category === category)

describe('a full-size messy gala (AAFE 2026 shape, invented)', async () => {
  const prepared = await prepareUpload(csv, context({ sponsors: expected.sponsors }))
  const byRow = new Map<number, PreparedRow>(prepared.rows.map((r) => [r.rowNumber, r]))
  const reviews = (reason: string) => prepared.report.reviewItems.filter((i) => i.reason === reason)

  it('the fixture files are what the generator writes (rerun it after changing it)', () => {
    for (const [name, text] of Object.entries(render())) expect(readFileSync(DIR + name, 'utf8'), name).toBe(text)
  })

  it("matches AAFE's 2026 mix: 553 guests", () => {
    expect(expected.totals).toMatchObject({ sponsorSeats: 234, ticketSeats: 107, staffAdded: 212 })
    expect(expected.totals.byStaffCategory).toEqual({ comped: 109, government_or_vip: 53, aafe_staff: 45, event_volunteer: 3, event_staff: 2 })
    expect(expected.totals.sponsorSeats + expected.totals.ticketSeats + staffAdded.length).toBe(553)
  })

  it('reads every row; leaves out the other campaigns; refuses the unreadable email', () => {
    expect(prepared.report.rowsRead).toBe(expected.rows.length)
    expect(prepared.report.rejected.map((r) => r.rowNumber)).toEqual(rowsOf('rejected').map((r) => r.rowNumber))
    expect(prepared.report.skippedOtherPage.map((r) => r.rowNumber)).toEqual(rowsOf('other_campaign').map((r) => r.rowNumber))
  })

  it('gives every sponsorship and ticket its tier and seats: 234 sponsor seats, 107 ticket seats', () => {
    let sponsorSeats = 0, ticketSeats = 0
    for (const e of [...rowsOf('sponsor'), ...rowsOf('ticket')]) {
      const r = byRow.get(e.rowNumber)
      expect(r, `row ${e.rowNumber}`).toBeDefined()
      expect([r!.tierId, r!.seatCount, r!.cancelled], `row ${e.rowNumber}`).toEqual([e.tier, e.seats, false])
      if (e.category === 'sponsor') sponsorSeats += r!.seatCount; else ticketSeats += r!.seatCount
    }
    expect([sponsorSeats, ticketSeats]).toEqual([234, 107])
  })

  it('reads every guest list the way the fixture expects', () => {
    const wrong: string[] = []
    for (const e of expected.rows.filter((x: Row) => x.guests)) {
      const g = byRow.get(e.rowNumber)!.guestList
      const named = g.kind === 'names' ? g.guests.length : 0
      const unread = g.kind === 'names' ? g.unread.length : 0
      const buyer = g.kind === 'names' && g.guests.some((x) => x.isBuyer)
      if (g.kind !== e.guests.kind || named !== e.guests.named || unread !== e.guests.unread || buyer !== Boolean(e.guests.buyerIsGuest)) {
        wrong.push(`row ${e.rowNumber}: expected ${JSON.stringify(e.guests)}, got ${g.kind} ${named} named, ${unread} unread, buyer ${buyer}`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('never pre-fills more names than seats, and keeps names exactly as typed (trimmed)', () => {
    for (const r of prepared.rows) {
      if (r.guestList.kind !== 'names') continue
      expect(r.guestList.guests.length).toBeLessThanOrEqual(r.seatCount)
      for (const g of r.guestList.guests) expect(g.displayName).toBe(g.displayName.trim().replace(/\s+/g, ' '))
    }
  })

  it('raises exactly the review items planted in the file', () => {
    const planted = (reason: string) => expected.rows.filter((r: Row) => r.review.includes(reason)).map((r: Row) => r.rowNumber)
    for (const reason of ['email_name_conflict', 'double_booked', 'refund', 'unknown_tier']) {
      expect(reviews(reason).map((i) => i.rowNumber), reason).toEqual(planted(reason))
    }
    expect(reviews('possible_duplicate')).toEqual([])
    expect(prepared.report.unknownTiers.map((t) => t.givelivelyName)).toEqual(['VIP Table 2026'])
  })

  it('the refunded purchase is cancelled, and nothing else is', () => {
    expect(prepared.rows.filter((r) => r.cancelled).map((r) => r.rowNumber)).toEqual(rowsOf('refunded').map((r) => r.rowNumber))
  })

  it('becomes database rows: every gala purchase, including the one waiting on a tier', async () => {
    const { rows, run } = await toGlImport(prepared, 'gala-2026.csv', csv)
    expect(rows).toHaveLength(rowsOf('sponsor').length + rowsOf('ticket').length + rowsOf('refunded').length + rowsOf('unknown_tier').length)
    expect(rows.filter((r) => !r.tier_id)).toHaveLength(1)
    expect(rows.reduce((t, r) => t + (r.guests?.length ?? 0), 0)).toBe(prepared.report.namesPrefilled)
    expect(new Set(rows.map((r) => r.purchase_key)).size).toBe(rows.length)
    expect(run.earliest! < run.latest!).toBe(true)
  })

  it('staff-added guests: every one has a name and a category', () => {
    expect(staffAdded.every((g: { first_name: string; last_name: string; category: string }) =>
      g.first_name.trim() && g.last_name.trim() && g.category)).toBe(true)
  })
})
