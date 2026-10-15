// Normalization for matching only (spec section 4). Never use these for display:
// names are stored and printed exactly as typed (spec section 3).

const HONORIFICS = new Set(['dr', 'mr', 'ms', 'mrs', 'mx', 'hon', 'rev', 'jr', 'sr', 'ii', 'iii'])
const ORG_SUFFIXES = new Set(['inc', 'llc', 'llp', 'corp', 'co', 'ltd'])

/** NFKC, case-folded, trimmed, inner spaces collapsed. Used for tier and page names. */
export function normText(s: string | null | undefined): string {
  return (s ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** normText plus punctuation removed. Apostrophes and periods vanish ("O'Brien" = "obrien"); other punctuation becomes a space. */
function normWords(s: string | null | undefined): string {
  return normText(s)
    .replace(/['’.]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A person's name for matching: no punctuation, honorifics, or suffixes. */
export function normName(s: string | null | undefined): string {
  return normWords(s)
    .split(' ')
    .filter((w) => w && !HONORIFICS.has(w))
    .join(' ')
}

/** The words of a name, sorted, so "Wei Chen" and "Chen Wei" compare equal. */
export function nameWordSet(s: string | null | undefined): string {
  return normName(s).split(' ').filter(Boolean).sort().join(' ')
}

/** An organization for matching: "&" as "and", no leading "The", no legal suffix. */
export function normOrg(s: string | null | undefined): string {
  const words = normWords(normText(s).replace(/&/g, ' and ')).split(' ').filter(Boolean)
  if (words[0] === 'the') words.shift()
  while (words.length > 1 && ORG_SUFFIXES.has(words.at(-1) ?? '')) words.pop()
  return words.join(' ')
}

/** Emails are trimmed and lower-cased only. */
export function normEmail(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

/** Best-effort first/last split, for sorting and matching only: the last word is the last name. */
export function splitName(displayName: string): { first: string; last: string } {
  const words = displayName.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 1) return { first: words[0] ?? '', last: '' }
  return { first: words.slice(0, -1).join(' '), last: words.at(-1) ?? '' }
}
