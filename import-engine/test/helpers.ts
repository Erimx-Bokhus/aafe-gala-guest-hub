// Invented test data only (hard rule 1). Emails use example.org; phones use 555-01xx.
import Papa from 'papaparse'
import type { Tier, UploadContext } from '../src/index.ts'

/** The real export's headers (docs/aafe-materials-2026-10-05.md), in its column order. */
export const HEADERS = [
  'First Name', 'Last Name', 'Email', 'Tier Purchased', 'Tier Category', 'Tickets Purchased', 'Total Seats',
  'Amount Spent', 'Amount Refunded', 'Transaction Fee Covered', 'Date/Time of Purchase', 'Referrer URL',
  'Payment Method', 'Status', 'UTM Source', 'Page Name', 'Internal Name', 'Client Application Name',
  'Double the Donation', 'Company/Organization Name', 'Phone Number',
  'Please list the name(s) and email address(es) of all guests. To revise, email gala@aafe.org.',
  'Address 1', 'City', 'State', 'Zip',
] as const

export const GALA_PAGE = "AAFE's 52nd Annual Gala"

type Row = Partial<Record<(typeof HEADERS)[number] | 'Guests', string>>

const DEFAULTS: Row = {
  'First Name': 'Grace', 'Last Name': 'Kim', Email: 'grace.kim@example.org', 'Tier Purchased': 'Ticket',
  'Tier Category': 'Ticket', 'Tickets Purchased': '1', 'Total Seats': '1', 'Amount Spent': '$1,000.00 ',
  'Amount Refunded': '$0.00', 'Transaction Fee Covered': '$0.00', 'Date/Time of Purchase': '2027-02-05 05:14:46 PM EST',
  'Payment Method': 'Stripe Card', Status: 'succeeded', 'Page Name': GALA_PAGE, 'Phone Number': '(212) 555-0101',
}

/** Build an export: each row starts from DEFAULTS; `Guests` is shorthand for the guest-list column. */
export function exportCsv(...rows: Row[]): string {
  const guestHeader = HEADERS[21]
  return Papa.unparse({
    fields: [...HEADERS],
    data: rows.map((r) => {
      const merged: Row = { ...DEFAULTS, ...r }
      if (r.Guests !== undefined) merged[guestHeader] = r.Guests
      return HEADERS.map((h) => merged[h] ?? '')
    }),
  })
}

/** AAFE's 2026 tiers (docs/decisions.md, Oct 5), in Natalie's naming style. */
export const TIERS: Tier[] = [
  { id: 'platinum', name: 'Platinum — Lead Sponsor', tierCategory: 'sponsorship', includedSeatCount: 12 },
  { id: 'gold', name: 'Gold — Documentary Screening Sponsor', tierCategory: 'sponsorship', includedSeatCount: 10 },
  { id: 'silver', name: 'Silver — Signature Cocktail Sponsor', tierCategory: 'sponsorship', includedSeatCount: 10 },
  { id: 'bronze', name: 'Bronze — Performance Sponsor', tierCategory: 'sponsorship', includedSeatCount: 8 },
  { id: 'champion', name: 'Champion', tierCategory: 'sponsorship', includedSeatCount: 6 },
  { id: 'friend', name: 'Friend', tierCategory: 'ticket', includedSeatCount: 2 },
  { id: 'supporter', name: 'Supporter', tierCategory: 'ticket', includedSeatCount: 1 },
  { id: 'full_page_ad', name: 'Full-Page Ad', tierCategory: 'ad', includedSeatCount: 0 },
  { id: 'comp', name: 'Complimentary Ticket', tierCategory: 'complimentary', includedSeatCount: 1 },
]

export function context(overrides: Partial<UploadContext> = {}): UploadContext {
  return {
    galaPageName: GALA_PAGE,
    tiers: TIERS,
    tierMappings: [{ givelivelyName: 'Ticket', tierId: 'supporter' }],
    sponsors: [],
    existingGuests: [],
    previousPurchases: [],
    ...overrides,
  }
}
