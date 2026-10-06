// Tier resolution and the gala page filter (spec section 3).

import { normText } from './normalize.ts'

/** A row of Natalie's `sponsorship_tiers`. Names look like "Gold — Documentary Screening Sponsor". */
export interface Tier {
  id: string
  name: string
  tierCategory: string
  includedSeatCount: number
}

/** A row of `tier_mappings`: a Give Lively tier name staff linked to a tier for this gala. */
export interface TierMapping {
  givelivelyName: string
  tierId: string
}

export type TierResolution = { tier: Tier; via: 'mapping' | 'name' } | null

/** The key `tier_mappings` is unique on (with the event): NFKC, case-folded, trimmed, spaces collapsed. */
export const tierMappingKey = normText

/**
 * The gala's tier mapping first, then Natalie's longest-name match: the tier whose short name (before
 * " — ") appears in the Give Lively tier name, longest first, ignoring complimentary tiers.
 * null means `unknown_tier`: nothing is created for the row until staff map it.
 */
export function resolveTier(givelivelyName: string, mappings: TierMapping[], tiers: Tier[]): TierResolution {
  const key = tierMappingKey(givelivelyName)
  if (!key) return null
  const mapping = mappings.find((m) => tierMappingKey(m.givelivelyName) === key)
  if (mapping) {
    const tier = tiers.find((t) => t.id === mapping.tierId)
    if (tier) return { tier, via: 'mapping' }
  }
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
 * Does a purchase belong to this gala? Matches the gala's Give Lively page name (normalized, exact)
 * against the row's Page Name or Internal Name.
 *
 * - CSV upload (`allowBlank: true`): a row with no page name is imported.
 * - JSON sync (`allowBlank: false`): only a matching page name is imported.
 * With no page name configured for the gala, nothing matches; callers decide what that means
 * (the sync does nothing and says so).
 */
export function isGalaPage(
  names: { pageName: string | null; internalName: string | null },
  galaPageName: string | null,
  { allowBlank }: { allowBlank: boolean },
): boolean {
  const candidates = [names.pageName, names.internalName].map(normText).filter(Boolean)
  if (candidates.length === 0) return allowBlank
  const target = normText(galaPageName)
  return target !== '' && candidates.includes(target)
}
