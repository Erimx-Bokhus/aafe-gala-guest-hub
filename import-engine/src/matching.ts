// Matching buyers to sponsors (spec section 4). Plain rules, first rule that answers wins.
// The import reads no guest names (decided Oct 7), so there is no guest matching here.

import { normEmail, normName, splitName } from './normalize.ts'

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
