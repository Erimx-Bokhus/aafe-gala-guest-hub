// Splits the free-text guest-list answer into guests (spec section 3, "Splitting the free-text guest list").
// The result only pre-fills the sponsor's portal; the sponsor confirms or fixes it. Clear names are
// pre-filled even when other entries aren't (decided Oct 6); the sponsor sees the original text next to
// them. More names than seats pre-fills nothing, since there's no way to know who to leave out.

import { normEmail, normName, nameWordSet } from './normalize.ts'

export interface Buyer {
  first: string
  last: string
  email: string
}

export interface ParsedGuest {
  /** Exactly as written; printed on badges, check-in, and the portal. */
  displayName: string
  /** Lower-cased. null when none was given, or when it was the buyer's own inbox (a coordinator). */
  email: string | null
  /** The buyer named themself ("me", their own name, or their own email alone). */
  isBuyer: boolean
}

export type GuestList =
  /** Empty or "TBD": all seats stay unnamed. */
  | { kind: 'none' }
  /**
   * Pre-fill these, in order, into the next free seats. `unread` lists the entries that couldn't be
   * read (empty when the whole list was clear); the portal shows them with the original text.
   */
  | { kind: 'names'; guests: ParsedGuest[]; unread: string[] }
  /** Left for the sponsor: no guests created; the portal shows the original text. */
  | { kind: 'unclear'; reasons: string[] }

const NOTHING = /^(tbd|tba|to follow|to be (determined|announced)|n\/?a|none|-+)\.?$/i
// A seat left open inside a longer list ("Ellen Marsh, Paul Marsh, TBD", "Seats 4-10 to be named"): skipped, not a name.
// Only a bare placeholder, maybe after "seats 4-10" or "guest": "John Smith email TBD" still holds a name.
const PLACEHOLDER = /^(?:(?:(?:seats?|guests?|names?|\+?\d+)\b[\s\d\-–#]*)?(?:(?:are|is)\s+)?(?:tbd|tba|to follow|to be (?:named|determined|announced|confirmed))|n\/?a|none|-+)\.?$/i
const SELF = /^(me|myself|self|me \(buyer\)|myself \(buyer\))$/i
const EMAIL = /[^\s<>(),;:"'[\]]+@[^\s<>(),;:"'[\]]+\.[a-z]{2,}/gi
const COUPLE = /(^|\s)(and|&|\+)(\s|$)|&/i

/** Split on line breaks, semicolons, a spaced slash (" / "), numbered markers ("1." "2)"), and bullets. */
function splitEntries(text: string): string[] {
  return text
    .split(/\r?\n|;|\s+\/\s+/)
    .flatMap((line) => line.split(/(?:^|\s)\d{1,2}[.)]\s+/))
    .flatMap((line) => line.split(/(?:^|\s)[•·*]\s*/))
    .map((line) => line.replace(/^\s*-\s+/, ''))
    .flatMap(splitAroundEmails)
    .map((e) => e.trim())
    .filter(Boolean)
}

/**
 * "Jane Doe jane@example.org, Sam Lee sam@example.org" → one entry per address, each ending at its address.
 * With one address, the line splits only when a comma follows it ("Ellen Marsh ellen@…, Paul Marsh"), so
 * "jane@example.org Jane Doe" stays one entry.
 */
function splitAroundEmails(line: string): string[] {
  const matches = [...line.matchAll(EMAIL)]
  if (matches.length === 0) return [line]
  if (matches.length === 1 && !/^[)>\]]?\s*,/.test(line.slice(matches[0]!.index! + matches[0]![0].length))) return [line]
  const entries: string[] = []
  let start = 0
  for (const m of matches) {
    const end = m.index! + m[0].length
    entries.push(line.slice(start, end))
    start = end
  }
  const rest = line.slice(start).replace(/^[\s,]+/, '')
  if (rest) entries.push(rest)
  return entries
}

/** Remove the address and separators (`-`, `:`, `,`, `<>`, `()`) around it; keep the name as written. */
function readEntry(entry: string): { name: string; email: string | null } {
  const found = entry.match(EMAIL)
  const email = found ? normEmail(found[0]) : null
  const name = entry
    .replace(EMAIL, ' ')
    .replace(/[<>()[\]"]/g, ' ')
    .replace(/\s[-–:,/]+(?=\s|$)/g, ' ')
    .replace(/^[\s,:/\-–]+|[\s,:/\-–]+$/g, '')
    .replace(/\s+/g, ' ')
  return { name, email }
}

/**
 * Commas between names: "Rina Adeyemi, Hector Vale hector@…" or "Paul Marsh, TBD". Open-seat placeholders
 * are dropped, an address on its own after a comma stays with the name before it ("Jane Doe, jane@…").
 * Splits only if every piece is two or more words and there are no more pieces than seats; null otherwise.
 */
function splitCommas(entry: string, seatCount: number): string[] | null {
  const pieces = entry.split(',').map((p) => p.trim()).filter(Boolean).reduce<string[]>((acc, p) => {
    if (acc.length && readEntry(p).name === '' && p.match(EMAIL)) acc[acc.length - 1] += ` ${p}`
    else acc.push(p)
    return acc
  }, []).filter((p) => !PLACEHOLDER.test(p))
  if (pieces.length <= 1) return pieces
  if (pieces.length <= seatCount && pieces.every((p) => readEntry(p).name.split(/\s+/).length >= 2)) return pieces
  return null
}

export function parseGuestList(text: string | null, seatCount: number, buyer: Buyer): GuestList {
  const trimmed = (text ?? '').trim()
  // No seats to fill (an ad, say): whatever the buyer wrote ("No ticket included") names nobody.
  if (trimmed === '' || NOTHING.test(trimmed) || seatCount === 0) return { kind: 'none' }

  let entries = splitEntries(trimmed).filter((e) => e.includes(',') || !PLACEHOLDER.test(e))   // with commas: splitCommas drops them

  // Commas between names. An entry with an address that won't split stays whole, as before ("Doe, Jane jane@…").
  const reasons: string[] = []
  entries = entries.flatMap((entry) => {
    if (!entry.includes(',')) return [entry]
    const split = splitCommas(entry, seatCount)
    if (split) return split
    if (entry.match(EMAIL)) return [entry]
    reasons.push(`commas that don't separate full names: "${entry}"`)
    return []
  })

  const buyerEmail = normEmail(buyer.email)
  const buyerName = `${buyer.first} ${buyer.last}`.trim()
  const guests: ParsedGuest[] = []

  for (const entry of entries) {
    const { name, email } = readEntry(entry)
    if (SELF.test(name) || (name === '' && email === buyerEmail) || (name && nameWordSet(name) === nameWordSet(buyerName))) {
      guests.push({ displayName: name && !SELF.test(name) ? name : buyerName, email: buyerEmail, isBuyer: true })
      continue
    }
    if (name === '') { reasons.push(`an email address with no name: "${entry}"`); continue }
    if (!/\p{L}/u.test(name) || /\d|@/.test(name)) { reasons.push(`can't be read: "${entry}"`); continue }
    if (COUPLE.test(name)) { reasons.push(`a couple or pair on one line: "${entry}"`); continue }
    if (normName(name).split(' ').filter(Boolean).length < 2) { reasons.push(`a one-word name: "${entry}"`); continue }
    guests.push({ displayName: name, email: email === buyerEmail ? null : email, isBuyer: false })
  }

  if (guests.length > seatCount) {
    return { kind: 'unclear', reasons: [`${guests.length} names for ${seatCount} seat${seatCount === 1 ? '' : 's'}`, ...reasons] }
  }
  if (guests.length === 0) return reasons.length ? { kind: 'unclear', reasons } : { kind: 'none' }
  return { kind: 'names', guests, unread: reasons }
}
