// The three export files (PR #34): badges for the printer, the printed check-in list, and the Salesforce attendee file.
// LIVE: staff_export_badges / staff_export_checkin / staff_export_salesforce in database/backend.sql return the rows,
//   check the caller's role and log the export. DEMO: the functions below build the same rows from the demo data, in the
//   same order, so both modes download the same file. Each page then writes the CSV with downloadCsv (one writer, with the
//   spreadsheet-formula guard). Columns stay provisional until AAFE sends its badge and check-in templates.
import { GUEST_TYPE_LABEL, displayName } from '@shared/data'
import { needStatus } from '@shared/guestNeeds'
import type { DB, GuestType } from '@shared/types'

export interface BadgeRow {
  /** The name printed on the badge. */
  display_name: string
  first_name: string; last_name: string; title: string | null; organization: string | null
  table_number: number | null; seat_number: number | null; sponsor: string | null; guest_type: GuestType; badge_status: string
}
export interface CheckinRow {
  last_name: string; first_name: string | null; display_name: string; organization: string | null; sponsor: string; table_number: number | null
  seat_number: number | null; guest_type: GuestType | 'unnamed_seat'; /** A yes/no flag; the details stay staff-only. */ access_needs: boolean; arrived: boolean
}
export interface SalesforceRow {
  first_name: string | null; last_name: string; email: string | null; title: string | null; organization: string | null; sponsor: string | null
  salesforce_account_id: string | null; salesforce_opportunity_id: string | null; guest_type: GuestType | 'walk_in'
  checked_in_at: string; check_in_method: string
}

const NOTICE = ['Capstone prototype — synthetic demonstration data only']
const byText = (a: string | null | undefined, b: string | null | undefined) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a.localeCompare(b))
const byNum = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b)

function current(db: DB) {
  const orders = new Map(db.orders.filter((o) => o.event_id === db.meta.current_event_id && o.status !== 'cancelled').map((o) => [o.id, o]))
  const sponsor = (orderId: string | null) => {
    const o = orderId ? db.orders.find((x) => x.id === orderId) : undefined
    return o ? db.sponsors.find((s) => s.id === o.sponsor_id) : undefined
  }
  const table = (id: string | null) => db.event_tables.find((t) => t.id === id)?.number ?? null
  return { orders, sponsor, table }
}

/** staff_export_badges: badges ready or flagged for reprint (and printed ones if asked), by table and seat. */
export function demoBadgeRows(db: DB, includePrinted: boolean): BadgeRow[] {
  const { orders, sponsor, table } = current(db)
  return db.guests
    .filter((g) => orders.has(g.order_id) && (g.badge_status === 'ready' || g.badge_status === 'reprint_needed' || (includePrinted && g.badge_status === 'printed')))
    .map((g) => ({
      display_name: displayName(g), first_name: g.first_name, last_name: g.last_name, title: g.title, organization: g.organization, table_number: table(g.table_id),
      seat_number: g.seat_number, sponsor: g.guest_type === 'sponsor_guest' ? sponsor(g.order_id)?.organization_name ?? null : null,
      guest_type: g.guest_type, badge_status: g.badge_status,
    }))
    .sort((a, b) => byNum(a.table_number, b.table_number) || byNum(a.seat_number, b.seat_number) || byText(a.last_name, b.last_name) || byText(a.first_name, b.first_name))
}

/** staff_export_checkin: every named guest by last name, then one row per unnamed sponsor seat. No email, phone, payment or notes. */
export function demoCheckinRows(db: DB): CheckinRow[] {
  const { orders, sponsor, table } = current(db)
  const named: CheckinRow[] = db.guests.filter((g) => orders.has(g.order_id)).map((g) => ({
    last_name: g.last_name, first_name: g.first_name, display_name: displayName(g), organization: g.organization, sponsor: sponsor(g.order_id)?.organization_name ?? '',
    table_number: table(g.table_id), seat_number: g.seat_number, guest_type: g.guest_type, access_needs: needStatus(g.accessibility_needs) === 'some',
    arrived: g.attendance_status === 'checked_in',
  }))
  const unnamed: CheckinRow[] = db.seats.filter((s) => !s.guest_id && s.status !== 'cancelled' && orders.has(s.order_id)).map((s) => ({
    last_name: 'Unnamed seat', first_name: null, display_name: 'Unnamed seat', organization: null, sponsor: sponsor(s.order_id)?.organization_name ?? '',
    table_number: null, seat_number: s.slot_number, guest_type: 'unnamed_seat', access_needs: false, arrived: false,
  }))
  const order = (a: CheckinRow, b: CheckinRow) => byText(a.last_name, b.last_name) || byText(a.first_name, b.first_name) || byText(a.sponsor, b.sponsor) || byNum(a.seat_number, b.seat_number)
  return [...named.sort(order), ...unnamed.sort(order)]
}

/** staff_export_salesforce: who actually came, for a Contact + Campaign Member import. Walk-ins come by the name the desk wrote. */
export function demoSalesforceRows(db: DB): SalesforceRow[] {
  const { sponsor } = current(db)
  return db.check_ins.filter((c) => c.event_id === db.meta.current_event_id).flatMap((c): SalesforceRow[] => {
    const order = c.order_id ? db.orders.find((o) => o.id === c.order_id) : undefined
    const sp = sponsor(c.order_id)
    const ids = { salesforce_account_id: sp?.salesforce_account_id ?? null, salesforce_opportunity_id: order?.salesforce_opportunity_id ?? null }
    if (!c.guest_id) return [{ first_name: null, last_name: c.arrival_name ?? '', email: null, title: null, organization: null, sponsor: sp?.organization_name ?? null, ...ids, guest_type: 'walk_in', checked_in_at: c.checked_in_at, check_in_method: c.method }]
    const g = db.guests.find((x) => x.id === c.guest_id)
    if (!g) return []
    const gs = sponsor(g.order_id), go = db.orders.find((o) => o.id === g.order_id)
    // Salesforce requires a LastName: a one-word name goes there.
    return [{ first_name: g.last_name ? g.first_name : null, last_name: g.last_name || displayName(g), email: g.email || null, title: g.title, organization: g.organization, sponsor: gs?.organization_name ?? null,
      salesforce_account_id: gs?.salesforce_account_id ?? null, salesforce_opportunity_id: go?.salesforce_opportunity_id ?? null, guest_type: g.guest_type,
      checked_in_at: c.checked_in_at, check_in_method: c.method }]
  }).sort((a, b) => byText(a.last_name, b.last_name) || byText(a.first_name, b.first_name))
}

// ---- CSV layout (same columns as the downloads before the server exports, so nothing changes for staff) ----

/** The badge printer's file. Affiliation is what the badge's bottom line says. */
export const badgeCsv = (rows: BadgeRow[]) => [NOTICE, ['Name on badge', 'First', 'Last', 'Title', 'Organization', 'Table', 'Seat', 'Affiliation'],
  ...rows.map((r) => [r.display_name, r.first_name, r.last_name, r.title, r.organization, r.table_number, r.seat_number, r.sponsor ?? GUEST_TYPE_LABEL[r.guest_type]])]

export const checkinCsv = (rows: CheckinRow[]) => [NOTICE, ['Last', 'First', 'Name', 'Organization', 'Sponsor', 'Table', 'Seat', 'Guest type', 'Access needs', 'Arrived'],
  ...rows.map((r) => [r.last_name, r.first_name, r.display_name, r.organization, r.sponsor, r.table_number, r.seat_number,
    r.guest_type === 'unnamed_seat' ? 'Unnamed sponsor seat' : GUEST_TYPE_LABEL[r.guest_type], r.access_needs ? 'Yes, ask a staff lead' : '', r.arrived ? 'Yes' : ''])]

export const salesforceCsv = (rows: SalesforceRow[]) => [NOTICE, ['First Name', 'Last Name', 'Email', 'Title', 'Account Name', 'Sponsor',
  'Account ID', 'Opportunity ID', 'Guest Type', 'Checked In At', 'Check-in Method'],
  ...rows.map((r) => [r.first_name, r.last_name, r.email, r.title, r.organization, r.sponsor, r.salesforce_account_id, r.salesforce_opportunity_id,
    r.guest_type === 'walk_in' ? 'Walk-in' : GUEST_TYPE_LABEL[r.guest_type], r.checked_in_at, r.check_in_method])]
