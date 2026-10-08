// A full-size, messy, INVENTED gala (hard rule 1: no real people; emails on example.org, phones 555-01xx),
// shaped like AAFE's 2026 gala (docs/aafe-materials-2026-10-05.md): 553 guests.
//   Give Lively export (341 seats):  234 sponsor-guest seats in 29 sponsorships, 107 ticket seats
//   Added by staff (212 guests):     109 comped, 53 government or VIP, 45 AAFE staff, 3 event volunteers, 2 event staff
// Plus rows the import must leave out or flag: another campaign, a full refund, an unmapped tier, an
// unreadable email, a shared inbox.
//
// Guest lists are typed the many ways buyers type them (one per line, "Name <email>", numbered, bullets,
// commas, "me", TBD, couples, too many names, Chinese and Korean names, all caps). The import drops that
// column (decided Oct 7), so the tests check that none of it reaches the database. Each row records what
// the import should make of it, in expected.json.
//
// Deterministic (fixed seed): run `node test/fixtures/gala-2026/generate.mts` to rewrite the files; the
// tests fail if they drift from this script. For import tests; not loaded into the demo (decided Oct 7).
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Papa from 'papaparse'
import { HEADERS, GALA_PAGE } from '../../helpers.ts'

export const DIR = fileURLToPath(new URL('./', import.meta.url))

// ---- Seeded random numbers (mulberry32), so every run writes the same files
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST = ['Mei', 'Wei', 'Jun', 'Hana', 'Min-jun', 'Ji-woo', 'Sofia', 'Mateo', 'Priya', 'Arjun', 'Grace', 'Daniel', 'Ana', 'Luis',
  'Olivia', 'Noah', 'Aisha', 'Omar', 'Linh', 'Minh', 'Yuki', 'Kenji', 'Rosa', 'Carlos', 'Fatima', 'Samuel', 'Chloe', 'Ethan', 'Isabel',
  'Diego', 'Tomás', 'Renée', 'Kwame', 'Leila', 'Haruto', 'Seo-yeon', 'Bao', 'Camila', 'Ravi', 'Nadia']
const LAST = ['Chen', 'Wong', 'Lee', 'Kim', 'Park', 'Nguyen', 'Tran', 'Garcia', 'Rodriguez', 'Patel', 'Singh', 'Liu', 'Zhang', 'Huang',
  'Lin', 'Choi', 'Jung', 'Martinez', 'Lopez', 'Cohen', 'Okafor', 'Haddad', 'Ramos', 'Sato', 'Tanaka', 'Rivera', 'Ortiz', 'Kaur',
  'Mensah', 'Núñez', 'Đặng', 'Yamada', 'Fernández', 'Ahmed', 'Kowalski', 'Moreau']
// Names written in Chinese or Korean script, as a buyer might type them (invented).
const NATIVE = ['陳美玲', '王建國', '林志明', '김민준', '이서연', '박지훈']
const ORG_A = ['Lantern', 'Harbor', 'Canal', 'Bowery', 'Jade', 'Mott', 'Pell', 'Orchard', 'Delancey', 'Eldridge', 'Hester', 'Bayard',
  'Doyers', 'Mulberry', 'Grand', 'Market', 'Catherine', 'Division', 'Henry', 'Madison', 'Monroe', 'Rutgers', 'Pike', 'Allen', 'Forsyth',
  'Chrystie', 'Elizabeth', 'Baxter', 'Centre', 'Worth']
const ORG_B = ['Example Partners', 'Example Bank', 'Example Foundation', 'Example Health', 'Example Realty', 'Example Law Group',
  'Example Builders', 'Example Trust', 'Example Media', 'Example Credit Union']

export interface Purchase {
  row: Record<string, string>
  /** What the import should make of this row. */
  expect: {
    category: 'sponsor' | 'ticket' | 'other_campaign' | 'refunded' | 'unknown_tier' | 'rejected'
    seats: number
    tier: string | null
    review: string[]
  }
}

export function build() {
  const r = rng(20260521)
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!
  const usedPeople = new Set<string>()
  const person = () => {
    for (;;) {
      const p = { first: pick(FIRST), last: pick(LAST) }
      const key = `${p.first} ${p.last}`
      if (!usedPeople.has(key)) { usedPeople.add(key); return p }
    }
  }
  const slug = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '')
  let guestNo = 0
  const guestEmail = (p: { first: string; last: string }) => `${slug(p.first)}.${slug(p.last)}.${++guestNo}@guest.example.org`
  const usedOrgs = new Set<string>()
  const org = () => { for (;;) { const o = `${pick(ORG_A)} ${pick(ORG_B)}`; if (!usedOrgs.has(o)) { usedOrgs.add(o); return o } } }
  let phoneNo = 0
  const phone = () => `(212) 555-01${String(phoneNo++ % 100).padStart(2, '0')}`

  // Sales run January 5 to May 15, 2026. Labels follow New York time: EST until March 8, EDT after.
  const DST_START = Date.UTC(2026, 2, 8, 7)
  const stamp = (utcMs: number) => {
    const edt = utcMs >= DST_START
    const local = new Date(utcMs + (edt ? -4 : -5) * 3600_000)
    const h = local.getUTCHours()
    return `${local.toISOString().slice(0, 10)} ${String(h % 12 || 12).padStart(2, '0')}:${local.toISOString().slice(14, 19)} ${h < 12 ? 'AM' : 'PM'} ${edt ? 'EDT' : 'EST'}`
  }
  const saleTimes = new Map<string, number>()   // label → UTC ms, to sort by the real moment
  const saleTime = () => {
    for (;;) {
      const t = Date.UTC(2026, 0, 5, 14) + Math.floor(r() * 130 * 24 * 3600) * 1000
      const label = stamp(t)
      if (!saleTimes.has(label)) { saleTimes.set(label, t); return label }
    }
  }

  // ---- Guest-list styles: the text a buyer types for `n` named guests in `seats` seats
  type Style = (n: number, seats: number, buyer: { first: string; last: string; email: string }) => string
  const names = (n: number) => Array.from({ length: n }, person)
  const full = (p: { first: string; last: string }) => `${p.first} ${p.last}`
  const STYLES: Record<string, Style> = {
    lines: (n) => names(n).map(full).join('\n'),
    dash_email: (n) => names(n).map((p) => `${full(p)} - ${guestEmail(p)}`).join('\n'),
    angle: (n) => names(n).map((p) => `${full(p)} <${guestEmail(p).toUpperCase()}>`).join('; '),
    numbered: (n) => names(n).map((p, i) => `${i + 1}. ${full(p)}`).join(' '),
    bullets: (n) => names(n).map((p) => `• ${full(p)}`).join('\n'),
    commas: (n) => names(n).map(full).join(', '),
    caps_spaces: (n) => names(n).map((p) => `   ${full(p).toUpperCase()}   `).join('\n\n'),
    me_plus: (n) => ['me', ...names(n - 1).map(full)].join('\n'),
    own_name: (n, _s, b) => [`${b.first} ${b.last}`, ...names(n - 1).map(full)].join('\n'),
    tbd: () => pick(['TBD', 'tbd', 'To follow', 'N/A', 'TBA.']),
    blank: () => '',
    couple: (n) => [`Mr. and Mrs. ${pick(LAST)}`, ...names(n).map(full)].join('\n'),
    one_word: (n) => [pick(FIRST), ...names(n).map(full)].join('\n'),
    native_script: (n) => [pick(NATIVE), ...names(n).map(full)].join('\n'),
    too_many: (_n, seats) => names(seats + 2).map(full).join('\n'),
  }

  const purchases: Purchase[] = []
  const add = (p: Purchase) => purchases.push(p)
  const base = (buyer: { first: string; last: string }, email: string) => ({
    'First Name': buyer.first, 'Last Name': buyer.last, Email: email, 'Date/Time of Purchase': saleTime(),
    'Payment Method': pick(['Stripe Card', 'Stripe Card', 'Stripe Card', 'ACH', 'Apple Pay']), Status: 'succeeded',
    'Page Name': GALA_PAGE, 'Phone Number': phone(), 'Amount Refunded': '$0.00', 'Transaction Fee Covered': '$0.00',
  })
  const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}${r() < 0.3 ? ' ' : ''}`

  // ---- 29 sponsorships, 234 seats
  const SPONSORSHIPS: [string, string, number, number, number][] = [
    // [Give Lively tier name, tier, count, seats, amount]
    ['Platinum Sponsor', 'platinum', 2, 12, 50000], ['Gold Sponsor', 'gold', 5, 10, 25000], ['Silver Sponsor', 'silver', 6, 10, 15000],
    ['Bronze Sponsor', 'bronze', 6, 8, 10000], ['Champion Sponsor', 'champion', 8, 6, 7000], ['Friend Sponsor', 'friend', 2, 2, 2500],
  ]
  const sponsorStyles = ['lines', 'dash_email', 'angle', 'numbered', 'bullets', 'commas', 'caps_spaces', 'me_plus', 'own_name', 'tbd',
    'blank', 'couple', 'one_word', 'native_script', 'too_many']
  let s = 0
  const sharedInbox = 'events@sharedinbox.example.org'
  for (const [glName, tier, count, seats, amount] of SPONSORSHIPS) {
    for (let i = 0; i < count; i++, s++) {
      const buyer = person()
      const company = org()
      // One sponsor buys from a shared inbox already on file under someone else's name.
      const email = s === 7 ? sharedInbox : `${slug(buyer.first)}.${slug(buyer.last)}@${slug(company).replace(/\./g, '')}.example.org`
      const style = sponsorStyles[s % sponsorStyles.length]!
      // Some sponsors name everyone, some name a few, the clear-name styles leave room for a couple of extras.
      const n = Math.max(1, Math.min(seats - 1, Math.round(seats * (0.4 + r() * 0.6))))
      const g = STYLES[style]!(n, seats, { first: buyer.first, last: buyer.last, email })
      add({
        row: { ...base(buyer, email), 'Tier Purchased': glName, 'Tier Category': 'Sponsorship', 'Tickets Purchased': '1', 'Total Seats': String(seats),
          'Amount Spent': money(amount), 'Company/Organization Name': r() < 0.15 ? `  ${company.toUpperCase()} ` : company, Guests: g },
        expect: { category: 'sponsor', seats, tier, review: s === 7 ? ['email_name_conflict'] : [] },
      })
    }
  }

  // ---- 85 ticket purchases, 107 seats (63 single, 22 pairs); Give Lively calls them all "Ticket"
  const ticketStyles = ['me_plus', 'blank', 'own_name', 'lines', 'tbd', 'dash_email', 'me_plus', 'blank']
  for (let i = 0; i < 85; i++) {
    const buyer = person()
    const seats = i < 22 ? 2 : 1
    const email = `${slug(buyer.first)}${r() < 0.2 ? '.' + slug(buyer.last) : ''}${i}@${pick(['mail', 'inbox', 'home'])}.example.org`
    const style = ticketStyles[i % ticketStyles.length]!
    const g = STYLES[style]!(seats, seats, { first: buyer.first, last: buyer.last, email })
    add({
      row: { ...base(buyer, r() < 0.25 ? email.toUpperCase() : email), 'Tier Purchased': 'Ticket', 'Tier Category': 'Ticket',
        'Tickets Purchased': String(seats), 'Total Seats': String(seats), 'Amount Spent': money(1000 * seats), Guests: g },
      expect: { category: 'ticket', seats, tier: 'supporter', review: [] },
    })
  }

  // ---- Rows the import leaves out or flags (not part of the 553)
  const extra = (row: Record<string, string>, expect: Purchase['expect']) => {
    const buyer = person()
    add({ row: { ...base(buyer, `${slug(buyer.first)}.${slug(buyer.last)}@donor.example.org`), 'Tier Purchased': 'Ticket', 'Tier Category': 'Ticket',
      'Tickets Purchased': '1', 'Total Seats': '1', 'Amount Spent': '$1,000.00', Guests: 'me', ...row }, expect })
  }
  extra({ 'Page Name': 'Year-End Appeal 2025', 'Tier Purchased': 'Donation', 'Total Seats': '', 'Amount Spent': '$250.00', Guests: '' },
    { category: 'other_campaign', seats: 0, tier: null, review: [] })
  extra({ 'Page Name': '', 'Internal Name': 'Lunar New Year Appeal', 'Tier Purchased': 'Donation', 'Total Seats': '', 'Amount Spent': '$100.00', Guests: '' },
    { category: 'other_campaign', seats: 0, tier: null, review: [] })
  extra({ 'Tickets Purchased': '2', 'Total Seats': '2', 'Amount Spent': '$2,000.00', 'Amount Refunded': '$2,000.00', Status: 'refunded' },
    { category: 'refunded', seats: 2, tier: 'supporter', review: ['refund'] })
  extra({ 'Tier Purchased': 'VIP Table 2026', 'Tier Category': 'Sponsorship', 'Total Seats': '10', 'Amount Spent': '$30,000.00', Guests: 'TBD' },
    { category: 'unknown_tier', seats: 10, tier: null, review: ['unknown_tier'] })
  extra({ Email: 'not an email', Guests: '' }, { category: 'rejected', seats: 0, tier: null, review: [] })

  // In purchase-time order, as Give Lively exports it, so categories interleave.
  purchases.sort((a, b) => saleTimes.get(a.row['Date/Time of Purchase']!)! - saleTimes.get(b.row['Date/Time of Purchase']!)!)

  // ---- 212 guests staff add by hand (comps and the rest): not in Give Lively
  const STAFF_ADDED: [string, number, string][] = [
    ['comped', 109, 'Comp: community partner'], ['government_or_vip', 53, 'Government or VIP guest'],
    ['aafe_staff', 45, 'AAFE staff'], ['event_volunteer', 3, 'Event volunteer'], ['event_staff', 2, 'Event staff'],
  ]
  const titles = ['Council Member', 'State Senator', 'Assembly Member', 'Commissioner', 'Director', 'Board Member', 'Executive Director', '']
  const staffAdded = STAFF_ADDED.flatMap(([category, count, note]) => Array.from({ length: count }, (_, i) => {
    const p = person()
    const messy = i % 9 === 0 ? p.first.toLowerCase() : p.first
    return {
      category,
      first_name: i % 13 === 0 ? `  ${messy} ` : messy,
      last_name: p.last,
      title: category === 'government_or_vip' ? pick(titles.filter(Boolean)) : category === 'aafe_staff' ? pick(['Program Manager', 'Organizer', 'Associate', '']) : '',
      organization: category === 'aafe_staff' || category.startsWith('event') ? 'AAFE' : r() < 0.6 ? org() : '',
      email: r() < 0.7 ? guestEmail(p) : '',
      relationship_note: note,
    }
  }))

  const csv = Papa.unparse({
    fields: [...HEADERS],
    data: purchases.map((p) => HEADERS.map((h) => (h.startsWith('Please list') ? p.row.Guests : p.row[h]) ?? '')),
  })
  const sponsors = [{ id: 'sp-shared-inbox', organizationName: 'Shared Inbox Example Co', primaryContactName: 'Pat Morgan', primaryContactEmail: sharedInbox }]
  const expected = {
    note: 'Invented data. What the import should make of each Give Lively row, in file order (row 2 is the first data row).',
    totals: {
      sponsorSeats: sum(purchases, 'sponsor'), ticketSeats: sum(purchases, 'ticket'), staffAdded: staffAdded.length,
      byStaffCategory: Object.fromEntries(STAFF_ADDED.map(([c]) => [c, staffAdded.filter((g) => g.category === c).length])),
    },
    sponsors,
    rows: purchases.map((p, i) => ({ rowNumber: i + 2, email: p.row.Email, ...p.expect })),
  }
  return { csv, staffAdded, expected }
}

function sum(ps: Purchase[], category: string) {
  return ps.filter((p) => p.expect.category === category).reduce((t, p) => t + p.expect.seats, 0)
}

export const FILES = { csv: 'givelively-export.csv', staff: 'staff-added.json', expected: 'expected.json' } as const

export function render() {
  const { csv, staffAdded, expected } = build()
  return {
    [FILES.csv]: csv + '\n',
    [FILES.staff]: JSON.stringify(staffAdded, null, 1) + '\n',
    [FILES.expected]: JSON.stringify(expected, null, 1) + '\n',
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [name, text] of Object.entries(render())) writeFileSync(DIR + name, text)
  const { expected } = build()
  console.log(`Wrote ${Object.values(FILES).join(', ')}: ${expected.rows.length} rows; ${expected.totals.sponsorSeats} sponsor seats, ` +
    `${expected.totals.ticketSeats} ticket seats, ${expected.totals.staffAdded} staff-added guests`)
}
