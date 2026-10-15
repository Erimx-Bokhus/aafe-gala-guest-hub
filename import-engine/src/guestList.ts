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
// Name particles and titles don't count toward a run-on: "Maria de la Cruz" and "Dr. Lena Ortiz" are one person.
const PARTICLES = new Set(['de', 'del', 'della', 'la', 'le', 'van', 'von', 'der', 'den', 'da', 'di', 'du', 'dos', 'das', 'bin', 'binti', 'al', 'el', 'y'])
// ponytail: four words is the cutoff, so a real four-word name ("Juan Carlos Rodriguez Garcia") is also left for the
// sponsor to confirm. Two people run together with nothing between them ("Paul Marsh Ana Ruiz") can't be split safely.
const RUN_ON = 4
const countNameWords = (name: string) => name.split(/\s+/).map(normName).filter((w) => w && !PARTICLES.has(w)).length

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
  const [only] = matches
  if (matches.length === 1 && only && !/^[)>\]]?\s*,/.test(line.slice(only.index + only[0].length))) return [line]
  const entries: string[] = []
  let start = 0
  for (const m of matches) {
    const end = m.index + m[0].length
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

/** Commas between names. An entry with an address that won't split stays whole, as before ("Doe, Jane jane@…"). */
function splitOnCommas(entries: string[], seatCount: number, reasons: string[]): string[] {
  return entries.flatMap((entry) => {
    if (!entry.includes(',')) return [entry]
    const split = splitCommas(entry, seatCount)
    if (split) return split
    if (entry.match(EMAIL)) return [entry]
    reasons.push(`commas that don't separate full names: "${entry}"`)
    return []
  })
}

/** One entry: the buyer themselves, a guest, or the reason it can't be read as one person. */
function readGuest(entry: string, me: { email: string; name: string }): { guest: ParsedGuest } | { reason: string } {
  const { name, email } = readEntry(entry)
  if (isBuyer(name, email, me)) return { guest: { displayName: name && !SELF.test(name) ? name : me.name, email: me.email, isBuyer: true } }
  if (name === '') return { reason: `an email address with no name: "${entry}"` }
  if (!/\p{L}/u.test(name) || /\d|@/.test(name)) return { reason: `can't be read: "${entry}"` }
  if (COUPLE.test(name)) return { reason: `a couple or pair on one line: "${entry}"` }
  if (normName(name).split(' ').filter(Boolean).length < 2) return { reason: `a one-word name: "${entry}"` }
  if (countNameWords(name) >= RUN_ON) return { reason: `may be more than one person: "${entry}"` }
  return { guest: { displayName: name, email: email === me.email ? null : email, isBuyer: false } }
}

/** "me", the buyer's own address with no name, or the buyer's own name in any order. */
function isBuyer(name: string, email: string | null, me: { email: string; name: string }): boolean {
  return SELF.test(name) || (name === '' && email === me.email) || (name !== '' && nameWordSet(name) === nameWordSet(me.name))
}

export function parseGuestList(text: string | null, seatCount: number, buyer: Buyer): GuestList {
  const trimmed = (text ?? '').trim()
  // No seats to fill (an ad, say): whatever the buyer wrote ("No ticket included") names nobody.
  if (trimmed === '' || NOTHING.test(trimmed) || seatCount === 0) return { kind: 'none' }

  const reasons: string[] = []
  const entries = splitOnCommas(splitEntries(trimmed).filter((e) => e.includes(',') || !PLACEHOLDER.test(e)), seatCount, reasons)   // with commas: splitCommas drops them
  const me = { email: normEmail(buyer.email), name: `${buyer.first} ${buyer.last}`.trim() }
  const guests: ParsedGuest[] = []
  for (const entry of entries) {
    const read = readGuest(entry, me)
    if ('guest' in read) guests.push(read.guest)
    else reasons.push(read.reason)
  }

  if (guests.length > seatCount) {
    return { kind: 'unclear', reasons: [`${guests.length} names for ${seatCount} seat${seatCount === 1 ? '' : 's'}`, ...reasons] }
  }
  if (guests.length === 0) return reasons.length ? { kind: 'unclear', reasons } : { kind: 'none' }
  return { kind: 'names', guests, unread: reasons }
}
