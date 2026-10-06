// Matching buyers to sponsors and imported guests to guests already on the gala list (spec section 4).
// Plain rules, first rule that answers wins. Nicknames and typos aren't detected; staff merge by hand.

import { nameWordSet, normEmail, normName, normOrg, splitName } from './normalize.ts'

/** A row of Natalie's `sponsors`. */
export interface Sponsor {
  id: string
  organizationName: string
  primaryContactName: string
  primaryContactEmail: string
}

export type BuyerMatch =
  | { kind: 'existing'; sponsorId: string }
  /** Shared inbox: review `email_name_conflict`; a new sponsor is created meanwhile so the order isn't lost. */
  | { kind: 'email_name_conflict'; candidateSponsorIds: string[]; organizationName: string }
  | { kind: 'new'; organizationName: string }

const lastNameOf = (fullName: string) => normName(splitName(fullName).last || fullName)

export function matchBuyer(
  buyer: { first: string; last: string; email: string },
  company: string | null,
  sponsors: Sponsor[],
): BuyerMatch {
  const email = normEmail(buyer.email)
  const last = normName(buyer.last)
  const sameEmail = sponsors.filter((s) => normEmail(s.primaryContactEmail) === email)
  const same = sameEmail.find((s) => lastNameOf(s.primaryContactName) === last)
  if (same) return { kind: 'existing', sponsorId: same.id }
  const organizationName = company?.trim() || `${buyer.first} ${buyer.last}`.trim()
  if (sameEmail.length) return { kind: 'email_name_conflict', candidateSponsorIds: sameEmail.map((s) => s.id), organizationName }
  return { kind: 'new', organizationName }
}

/** A guest already on this gala's list. */
export interface ExistingGuest {
  id: string
  orderId: string
  displayName: string
  email: string | null
  organization: string | null
}

export interface GuestFinding {
  reason: 'double_booked' | 'possible_duplicate'
  existingGuestId: string
  existingOrderId: string
}

/**
 * Checks one imported guest against guests on other orders of this gala:
 * 1. Same email and same last name → `double_booked`.
 * 2. Same name words (any order) and the same known organization → `double_booked`. When either
 *    organization is unknown (imported free text rarely says) or they differ → `possible_duplicate`,
 *    a softer flag staff confirm, so one sponsor's guest list isn't treated as conflicting with another's
 *    on a name alone (decided Oct 6).
 * 3. Same first initial and last name, same organization → `possible_duplicate`.
 * Returns the first finding, or null.
 */
export function matchGuest(
  guest: { displayName: string; email: string | null; organization: string | null },
  orderId: string,
  existing: ExistingGuest[],
): GuestFinding | null {
  const others = existing.filter((g) => g.orderId !== orderId)
  const email = guest.email ? normEmail(guest.email) : ''
  const last = lastNameOf(guest.displayName)
  const words = nameWordSet(guest.displayName)
  const org = normOrg(guest.organization)
  const finding = (reason: GuestFinding['reason'], g: ExistingGuest): GuestFinding =>
    ({ reason, existingGuestId: g.id, existingOrderId: g.orderId })

  const byEmail = email && others.find((g) => g.email && normEmail(g.email) === email && lastNameOf(g.displayName) === last)
  if (byEmail) return finding('double_booked', byEmail)

  const byName = others.filter((g) => words && nameWordSet(g.displayName) === words)
  const booked = byName.find((g) => org && normOrg(g.organization) === org)
  if (booked) return finding('double_booked', booked)
  if (byName[0]) return finding('possible_duplicate', byName[0])

  const initial = normName(splitName(guest.displayName).first).charAt(0)
  const close = others.find((g) =>
    initial && last && org && normOrg(g.organization) === org &&
    lastNameOf(g.displayName) === last && normName(splitName(g.displayName).first).charAt(0) === initial)
  return close ? finding('possible_duplicate', close) : null
}
