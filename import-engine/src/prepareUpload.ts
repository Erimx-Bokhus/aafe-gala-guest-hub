// The CSV upload path, before the database (spec sections 2–5 and 8): read the export, filter to this
// gala's page, resolve tiers, split guest lists, match buyers and guests, find missing purchases, and
// build the report. The result goes to `gl_import()`, which stays the only place that writes.
//
// Left to `gl_import()` because they need the stored rows: skipping unchanged rows, `guest_text_changed`,
// never filling seats a sponsor or staff already named, and the all-or-nothing transaction.

import { parseGuestList, type GuestList } from './guestList.ts'
import { matchBuyer, matchGuest, type BuyerMatch, type ExistingGuest, type GuestFinding, type Sponsor } from './matching.ts'
import { findMissing, type ImportedPurchase } from './missing.ts'
import { readExport, type PurchaseRow, type RejectedRow } from './readExport.ts'
import { isGalaPage, resolveTier, seatCount, tierMappingKey, type Tier, type TierMapping } from './tiers.ts'

export interface UploadContext {
  /** `gala_events.givelively_page_name`. Not set → GalaPageNotSetError, listing the pages in the file. */
  galaPageName: string | null
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
  /** Give Lively tier names with no mapping and no matching tier, with the rows that used them. */
  unknownTiers: { givelivelyName: string; rowNumbers: number[] }[]
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
  constructor(readonly pages: { pageName: string | null; rows: number }[]) {
    super("Choose this gala's Give Lively page before importing. Pages in this file: " +
      pages.map((p) => `${p.pageName ?? '(no page name)'} (${p.rows} row${p.rows === 1 ? '' : 's'})`).join(', '))
  }
}

export interface PreparedUpload {
  rows: PreparedRow[]
  report: UploadReport
}

const isCancelled = (r: PurchaseRow) =>
  /refund|fail|cancel|void/i.test(r.status ?? '') || (r.refunded !== null && r.refunded > 0 && r.refunded >= r.gross)

export async function prepareUpload(csv: string, ctx: UploadContext): Promise<PreparedUpload> {
  const read = await readExport(csv)
  const galaPageName = ctx.galaPageName?.trim()
  if (!galaPageName) {
    const pages = new Map<string | null, number>()
    for (const r of read.rows) {
      const name = r.pageName ?? r.internalName
      pages.set(name, (pages.get(name) ?? 0) + 1)
    }
    throw new GalaPageNotSetError([...pages].map(([pageName, rows]) => ({ pageName, rows })))
  }

  const rows: PreparedRow[] = []
  const skippedOtherPage: UploadReport['skippedOtherPage'] = []
  const unknownTiers = new Map<string, { givelivelyName: string; rowNumbers: number[] }>()
  const reviewItems: ReviewItem[] = []
  const guestPool: ExistingGuest[] = [...ctx.existingGuests]
  let namesPrefilled = 0
  let listsForSponsor = 0

  for (const row of read.rows) {
    if (!isGalaPage(row, galaPageName, { allowBlank: true })) {
      skippedOtherPage.push({ rowNumber: row.rowNumber, pageName: row.pageName ?? row.internalName })
      continue
    }

    const resolved = resolveTier(row.tierName, ctx.tierMappings, ctx.tiers)
    if (!resolved) {
      const key = tierMappingKey(row.tierName)
      const entry = unknownTiers.get(key) ?? { givelivelyName: row.tierName, rowNumbers: [] }
      entry.rowNumbers.push(row.rowNumber)
      unknownTiers.set(key, entry)
      reviewItems.push({ reason: 'unknown_tier', purchaseKey: row.purchaseKey, rowNumber: row.rowNumber, details: { tierPurchased: row.tierName } })
      continue
    }

    const seats = seatCount(resolved.tier, row.seats, row.quantity)
    const guestList = parseGuestList(row.guestText, seats, row.buyer)
    const buyerMatch = matchBuyer(row.buyer, row.company, ctx.sponsors)
    const cancelled = isCancelled(row)
    const orderId = ctx.orderIdByPurchaseKey?.[row.purchaseKey] ?? row.purchaseKey

    const guestFindings: (GuestFinding | null)[] = []
    if (guestList.kind === 'names') {
      namesPrefilled += guestList.guests.length
      guestList.guests.forEach((g, i) => {
        const found = matchGuest({ ...g, organization: null }, orderId, guestPool)
        guestFindings.push(found)
        if (found) {
          reviewItems.push({
            reason: found.reason, purchaseKey: row.purchaseKey, rowNumber: row.rowNumber,
            details: { guest: g.displayName, existingGuestId: found.existingGuestId, existingOrderId: found.existingOrderId },
          })
        }
        guestPool.push({ id: `${row.purchaseKey}#${i}`, orderId, displayName: g.displayName, email: g.email, organization: null })
      })
      if (guestList.unread.length) listsForSponsor += 1
    } else if (guestList.kind === 'unclear') {
      listsForSponsor += 1
    }

    if (buyerMatch.kind === 'email_name_conflict') {
      reviewItems.push({
        reason: 'email_name_conflict', purchaseKey: row.purchaseKey, rowNumber: row.rowNumber,
        details: { buyer: `${row.buyer.first} ${row.buyer.last}`, email: row.buyer.email, candidateSponsorIds: buyerMatch.candidateSponsorIds },
      })
    }
    if (cancelled) {
      reviewItems.push({
        reason: 'refund', purchaseKey: row.purchaseKey, rowNumber: row.rowNumber,
        details: { status: row.status, gross: row.gross, refunded: row.refunded },
      })
    }

    rows.push({ ...row, tierId: resolved.tier.id, tierVia: resolved.via, seatCount: seats, guestList, buyerMatch, guestFindings, cancelled })
  }

  // Every accepted row in the file counts as present, even one skipped for its tier, so a purchase
  // waiting on a tier mapping isn't also reported missing.
  const presentKeys = read.rows.map((r) => r.purchaseKey)
  for (const p of findMissing(ctx.previousPurchases, presentKeys, read.dateRange)) {
    reviewItems.push({ reason: 'missing_from_source', purchaseKey: p.purchaseKey, rowNumber: null, details: { purchasedAt: p.purchasedAt } })
  }

  return {
    rows,
    report: {
      rowsRead: read.rows.length + read.rejected.length,
      rejected: read.rejected,
      skippedOtherPage,
      unknownTiers: [...unknownTiers.values()],
      namesPrefilled,
      listsForSponsor,
      reviewItems,
      dateRange: read.dateRange,
    },
  }
}
