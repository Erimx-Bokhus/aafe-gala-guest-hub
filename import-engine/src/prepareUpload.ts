// The CSV upload path, before the database (spec sections 2–5 and 8): read the export, filter to this
// gala's page, resolve tiers, split guest lists, match buyers and guests, find missing purchases, and
// build the report. The result goes to `gl_import()`, which stays the only place that writes.
//
// Left to `gl_import()` because they need the stored rows: skipping unchanged rows, `guest_text_changed`,
// never filling seats a sponsor or staff already named, and the all-or-nothing transaction.

import { parseGuestList, type GuestList, type ParsedGuest } from './guestList.ts'
import { matchBuyer, matchGuest, type BuyerMatch, type ExistingGuest, type GuestFinding, type Sponsor } from './matching.ts'
import { findMissing, type ImportedPurchase } from './missing.ts'
import { readExport, type PurchaseRow, type RejectedRow } from './readExport.ts'
import { normText } from './normalize.ts'
import { isGalaPage, resolveTier, seatCount, tierMappingKey, type Tier, type TierMapping } from './tiers.ts'

export interface UploadContext {
  /** `gala_events.givelively_page_name`. Not set → GalaPageNotSetError, listing the pages in the file. */
  galaPageName: string | null
  /** The gala's other Give Lively pages (`gala_events.givelively_other_pages`), such as a private Community Tickets page. */
  otherPages?: string[]
  tiers: Tier[]
  tierMappings: TierMapping[]
  sponsors: Sponsor[]
  /** Guests already on this gala's list, for `double_booked` and `possible_duplicate`. */
  existingGuests: ExistingGuest[]
  /** Purchases from earlier uploads, for `missing_from_source`. */
  previousPurchases: ImportedPurchase[]
  /** Order ids of purchases already imported, so a re-import isn't matched against itself. */
  orderIdByPurchaseKey?: Record<string, string>
}

export interface PreparedRow extends PurchaseRow {
  tierId: string
  tierVia: 'mapping' | 'name'
  seatCount: number
  guestList: GuestList
  buyerMatch: BuyerMatch
  /** One entry per pre-filled guest, in the same order; null when nothing matched. */
  guestFindings: (GuestFinding | null)[]
  /** Refunded in full, or Status says refunded or failed: order and seats `cancelled`, review `refund`. */
  cancelled: boolean
}

export type ReviewReason =
  | 'unknown_tier' | 'email_name_conflict' | 'double_booked' | 'possible_duplicate' | 'refund' | 'missing_from_source'

export interface ReviewItem {
  reason: ReviewReason
  purchaseKey: string
  /** null for `missing_from_source`: the purchase isn't in this file. */
  rowNumber: number | null
  details: Record<string, unknown>
}

export interface UploadReport {
  rowsRead: number
  rejected: RejectedRow[]
  skippedOtherPage: { rowNumber: number; pageName: string | null }[]
  /** Give Lively tier names with no mapping and no matching tier, by page (null: the main page), with the rows that used them. */
  unknownTiers: { givelivelyName: string; pageName: string | null; rowNumbers: number[] }[]
  namesPrefilled: number
  /** Guest lists with entries left for the sponsor (all of the list, or only the entries that couldn't be read). */
  listsForSponsor: number
  reviewItems: ReviewItem[]
  dateRange: { earliest: string; latest: string } | null
}

/**
 * The gala has no Give Lively page name yet (decided Oct 6). Nothing is imported; the staff app shows
 * `pages` so staff pick this gala's page once, saves it to `gala_events.givelively_page_name`, and
 * runs the upload again.
 */
export class GalaPageNotSetError extends Error {
  readonly pages: { pageName: string | null; rows: number }[]
  constructor(pages: { pageName: string | null; rows: number }[]) {
    super("Choose this gala's Give Lively page before importing. Pages in this file: " +
      pages.map((p) => `${p.pageName ?? '(no page name)'} (${p.rows} row${p.rows === 1 ? '' : 's'})`).join(', '))
    this.pages = pages
  }
}

export interface PreparedUpload {
  rows: PreparedRow[]
  /** Rows waiting on a tier mapping. Sent to `gl_import()` too, which records the `unknown_tier` review. */
  pendingTier: PurchaseRow[]
  report: UploadReport
}

/**
 * A Status that cancels the purchase. The failure words match the Give Lively sync's `classify()` and `gl_import`
 * in backend.sql (prototype/scripts/test-audit-fixes.mjs checks all three agree). A partial refund keeps the order
 * (spec case 19): "Partially Refunded" isn't a cancellation; "Refunded" alone is.
 */
export const CANCELLED_STATUS = /fail|declin|cancel|void|revers|return|^\s*(fully\s+)?refund(ed)?\s*$/i

const isCancelled = (r: PurchaseRow) =>
  CANCELLED_STATUS.test(r.status ?? '') || (r.refunded !== null && r.refunded > 0 && r.refunded >= r.gross)

export async function prepareUpload(csv: string, ctx: UploadContext): Promise<PreparedUpload> {
  const read = await readExport(csv)
  const galaPageName = ctx.galaPageName?.trim()
  if (!galaPageName) throw new GalaPageNotSetError(pagesIn(read.rows))

  const t: Tally = {
    rows: [], pendingTier: [], skippedOtherPage: [], unknownTiers: new Map(), reviewItems: [], pagesSeen: new Set(),
    // ponytail: each guest is compared with every guest before it (quadratic): about 1 s for 1,000 purchases, 3 minutes
    // for 10,000 (benchmarked Oct 12). AAFE has a few hundred; past that, index the pool by email and name words.
    guestPool: [...ctx.existingGuests], namesPrefilled: 0, listsForSponsor: 0,
  }
  for (const row of read.rows) prepareRow(row, galaPageName, ctx, t)

  // Every accepted row in the file counts as present, even one skipped for its tier, so a purchase
  // waiting on a tier mapping isn't also reported missing.
  // Only purchases from the pages in this file can be missing from it: the Community Tickets export doesn't hold the
  // main page's purchases. A purchase with no page (imported before Oct 15) is the main page's.
  const presentKeys = read.rows.map((r) => r.purchaseKey)
  const comparable = ctx.previousPurchases.filter((p) => t.pagesSeen.has(normText(p.pageName ?? galaPageName)))
  for (const p of findMissing(comparable, presentKeys, read.dateRange)) {
    t.reviewItems.push({ reason: 'missing_from_source', purchaseKey: p.purchaseKey, rowNumber: null, details: { purchasedAt: p.purchasedAt } })
  }

  return {
    rows: t.rows,
    pendingTier: t.pendingTier,
    report: {
      rowsRead: read.rows.length + read.rejected.length,
      rejected: read.rejected,
      skippedOtherPage: t.skippedOtherPage,
      unknownTiers: [...t.unknownTiers.values()],
      namesPrefilled: t.namesPrefilled,
      listsForSponsor: t.listsForSponsor,
      reviewItems: t.reviewItems,
      dateRange: read.dateRange,
    },
  }
}

/** What one upload has prepared so far. */
interface Tally {
  rows: PreparedRow[]
  pendingTier: PurchaseRow[]
  skippedOtherPage: UploadReport['skippedOtherPage']
  unknownTiers: Map<string, UploadReport['unknownTiers'][number]>
  reviewItems: ReviewItem[]
  /** The gala's pages this file holds purchases from (normalized), for the missing-purchase check. */
  pagesSeen: Set<string>
  guestPool: ExistingGuest[]
  namesPrefilled: number
  listsForSponsor: number
}

/** The Give Lively pages in the file, with their row counts, for staff to pick this gala's page from. */
function pagesIn(rows: PurchaseRow[]): { pageName: string | null; rows: number }[] {
  const pages = new Map<string | null, number>()
  for (const r of rows) {
    const name = r.pageName ?? r.internalName
    pages.set(name, (pages.get(name) ?? 0) + 1)
  }
  return [...pages].map(([pageName, n]) => ({ pageName, rows: n }))
}

/** One purchase: skipped for its page, waiting on a tier mapping, or prepared with its guests and review items. */
function prepareRow(row: PurchaseRow, main: string, ctx: UploadContext, t: Tally): void {
  const others = ctx.otherPages ?? []
  if (!isGalaPage(row, [main, ...others], { allowBlank: true })) {
    t.skippedOtherPage.push({ rowNumber: row.rowNumber, pageName: row.pageName ?? row.internalName })
    return
  }
  const otherPage = isGalaPage(row, main, { allowBlank: true }) ? null : others.find((p) => isGalaPage(row, p, { allowBlank: false })) ?? null
  t.pagesSeen.add(normText(otherPage ?? main))
  const resolved = resolveTier(row.tierName, ctx.tierMappings, ctx.tiers, otherPage)
  if (!resolved) {
    waitForTier(row, otherPage, t)
    return
  }
  const seats = seatCount(resolved.tier, row.seats, row.quantity)
  const guestList = parseGuestList(row.guestText, seats, row.buyer)
  const buyerMatch = matchBuyer(row.buyer, row.company, ctx.sponsors)
  const cancelled = isCancelled(row)
  const orderId = ctx.orderIdByPurchaseKey?.[row.purchaseKey] ?? row.purchaseKey
  const guestFindings = guestList.kind === 'names' ? matchListedGuests(row, guestList.guests, orderId, t) : []
  if (guestList.kind === 'unclear' || (guestList.kind === 'names' && guestList.unread.length)) t.listsForSponsor += 1
  t.reviewItems.push(...buyerAndRefundReviews(row, buyerMatch, cancelled))
  t.rows.push({ ...row, tierId: resolved.tier.id, tierVia: resolved.via, seatCount: seats, guestList, buyerMatch, guestFindings, cancelled })
}

/** A tier name with no level or mapping: one staff review per row, grouped by page and name for the report. */
function waitForTier(row: PurchaseRow, otherPage: string | null, t: Tally): void {
  const key = `${tierMappingKey(otherPage)}\n${tierMappingKey(row.tierName)}`
  const entry = t.unknownTiers.get(key) ?? { givelivelyName: row.tierName, pageName: otherPage, rowNumbers: [] }
  entry.rowNumbers.push(row.rowNumber)
  t.unknownTiers.set(key, entry)
  t.reviewItems.push({ reason: 'unknown_tier', purchaseKey: row.purchaseKey, rowNumber: row.rowNumber, details: { tierPurchased: row.tierName, page: otherPage } })
  t.pendingTier.push(row)
}

/** Each named guest against every guest already known (and those earlier in this file): possible duplicates for review. */
function matchListedGuests(row: PurchaseRow, guests: ParsedGuest[], orderId: string, t: Tally): (GuestFinding | null)[] {
  t.namesPrefilled += guests.length
  return guests.map((g, i) => {
    const found = matchGuest({ ...g, organization: null }, orderId, t.guestPool)
    if (found) {
      t.reviewItems.push({
        reason: found.reason, purchaseKey: row.purchaseKey, rowNumber: row.rowNumber,
        details: { guest: g.displayName, existingGuestId: found.existingGuestId, existingOrderId: found.existingOrderId },
      })
    }
    t.guestPool.push({ id: `${row.purchaseKey}#${i}`, orderId, displayName: g.displayName, email: g.email, organization: null })
    return found
  })
}

/** A shared inbox (same email, another family) and a refund each need staff to look. */
function buyerAndRefundReviews(row: PurchaseRow, buyerMatch: BuyerMatch, cancelled: boolean): ReviewItem[] {
  const items: ReviewItem[] = []
  if (buyerMatch.kind === 'email_name_conflict') {
    items.push({
      reason: 'email_name_conflict', purchaseKey: row.purchaseKey, rowNumber: row.rowNumber,
      details: { buyer: `${row.buyer.first} ${row.buyer.last}`, email: row.buyer.email, candidateSponsorIds: buyerMatch.candidateSponsorIds },
    })
  }
  if (cancelled) {
    items.push({ reason: 'refund', purchaseKey: row.purchaseKey, rowNumber: row.rowNumber, details: { status: row.status, gross: row.gross, refunded: row.refunded } })
  }
  return items
}
