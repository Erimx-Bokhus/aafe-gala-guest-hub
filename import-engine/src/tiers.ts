// Tier resolution and the gala page filter (spec section 3).

import { normText } from './normalize.ts'

/** A row of Natalie's `sponsorship_tiers`. Names look like "Gold — Documentary Screening Sponsor". */
export interface Tier {
  id: string
  name: string
  tierCategory: string
  includedSeatCount: number
}

/**
 * A row of `tier_mappings`: a Give Lively tier name staff linked to a tier for this gala, on its main page or on one
 * of its other pages, so "Ticket" on the Community Tickets page is its own mapping.
 */
export interface TierMapping {
  givelivelyName: string
  tierId: string
  /** The gala's other page it's for (`tier_mappings.page_key`); missing, null or '': the main page. */
  pageName?: string | null
}

export type TierResolution = { tier: Tier; via: 'mapping' | 'name' } | null

/** The key `tier_mappings` is unique on (with the event): NFKC, case-folded, trimmed, spaces collapsed. */
export const tierMappingKey = normText

/**
 * The gala's tier mapping for the page first, then Natalie's longest-name match: the tier whose short name (before
 * " — ") appears in the Give Lively tier name, longest first, ignoring complimentary tiers. null means `unknown_tier`:
 * nothing is created for the row until staff map it.
 *
 * `otherPage`: the gala's other page the purchase was made on (null: its main page). There, only a mapping made for that
 * page counts, on purpose: "Ticket" on the Community Tickets page must never land on the main page's $500 Ticket level
 * by name or by the main page's mapping. gl_import() in backend.sql follows the same rule.
 */
export function resolveTier(givelivelyName: string, mappings: TierMapping[], tiers: Tier[], otherPage: string | null = null): TierResolution {
  const key = tierMappingKey(givelivelyName)
  if (!key) return null
  const page = tierMappingKey(otherPage)
  const mapping = mappings.find((m) => tierMappingKey(m.givelivelyName) === key && tierMappingKey(m.pageName) === page)
  if (mapping) {
    const tier = tiers.find((t) => t.id === mapping.tierId)
    if (tier) return { tier, via: 'mapping' }
  }
  if (page) return null
  let best: { tier: Tier; length: number } | null = null
  for (const tier of tiers) {
    if (tier.tierCategory === 'complimentary') continue
    const short = normText(tier.name.split(' — ')[0])
    if (short && key.includes(short) && (!best || short.length > best.length)) best = { tier, length: short.length }
  }
  return best ? { tier: best.tier, via: 'name' } : null
}

/**
 * Seats for a purchase: the export's Total Seats, else the tier's seat count × tickets purchased.
 * Advertising-only tiers (no included seats) get none.
 */
export function seatCount(tier: Tier, seats: number | null, quantity: number | null): number {
  if (tier.includedSeatCount === 0) return 0
  return seats ?? tier.includedSeatCount * Math.max(1, quantity ?? 1)
}

/**
 * Does a purchase belong to this gala? Matches the gala's Give Lively pages (its main page and any others, such as
 * a private Community Tickets page; normalized, exact) against the row's Page Name or Internal Name.
 *
 * - CSV upload (`allowBlank: true`): a row with no page name is imported.
 * - JSON sync (`allowBlank: false`): only a matching page name is imported.
 * With no page configured for the gala, nothing matches; callers decide what that means
 * (the sync does nothing and says so).
 */
export function isGalaPage(
  names: { pageName: string | null; internalName: string | null },
  galaPages: string | null | readonly (string | null)[],
  { allowBlank }: { allowBlank: boolean },
): boolean {
  const candidates = [names.pageName, names.internalName].map(normText).filter(Boolean)
  if (candidates.length === 0) return allowBlank
  const targets = (Array.isArray(galaPages) ? galaPages : [galaPages]).map(normText).filter(Boolean)
  return candidates.some((c) => targets.includes(c))
}
