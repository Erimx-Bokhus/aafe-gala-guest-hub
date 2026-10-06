// Purchases missing from a later export (spec section 5). CSV uploads only: the JSON sync is incremental.

export interface ImportedPurchase {
  purchaseKey: string
  /** UTC ISO time, as stored by the import. */
  purchasedAt: string
  cancelled?: boolean
}

/**
 * Purchases from earlier uploads whose purchase time falls inside this file's date range (inclusive)
 * but aren't in the file → staff review `missing_from_source`. Older or newer purchases aren't checked,
 * so a "this month only" export doesn't flag everything else. Nothing is cancelled automatically.
 */
export function findMissing(
  previous: ImportedPurchase[],
  fileKeys: Iterable<string>,
  dateRange: { earliest: string; latest: string } | null,
): ImportedPurchase[] {
  if (!dateRange) return []
  const inFile = new Set(fileKeys)
  const from = Date.parse(dateRange.earliest)
  const to = Date.parse(dateRange.latest)
  return previous.filter((p) => {
    const t = Date.parse(p.purchasedAt)
    return !p.cancelled && t >= from && t <= to && !inFile.has(p.purchaseKey)
  })
}
