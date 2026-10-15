// The name engine (spec section 3, "Names"). However a name arrives (one full-name field, first and last,
// Give Lively's buyer columns, a line of a typed guest list), it becomes one record. The display name IS the
// name: printed on badges, the check-in list, the table chart, exports and the portal, exactly as written.
// First and last are a best guess for sorting and search, and staff can correct them. Each place that needs a
// particular format (Salesforce, a sort order) gets it from here.

export interface Name {
  /** As written, spaces tidied. What every screen and badge shows. */
  display: string
  /** Best guess for sorting and search. A one-word name has an empty last name. */
  first: string
  last: string
  /** false when the split is a guess worth a staff look: three or more words, or a family name that may come first. */
  sure: boolean
}

const fold = (w: string) => w.toLowerCase().replace(/\./g, '')
const TITLES = new Set(['dr', 'mr', 'mrs', 'ms', 'mx', 'miss', 'rev', 'prof', 'hon', 'fr', 'sir', 'dame'])
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'md', 'phd', 'esq', 'cpa', 'dds', 'rn'])
// Surname prefixes that belong with the last name: "Maria de la Cruz", "Ludwig van Beethoven".
const PARTICLES = new Set(['de', 'del', 'della', 'der', 'den', 'da', 'das', 'do', 'dos', 'di', 'du', 'la', 'le', 'van', 'von', 'ter', 'ten', 'bin', 'ibn', 'al', 'el', 'st'])
// Common Korean, Chinese and Vietnamese family names, romanized. Written first only when the pattern says so.
const FAMILY_FIRST = new Set(('kim lee park choi jung jeong kang cho yoon jang lim han oh seo shin kwon hwang ahn song yoo hong ' +
  'wang li zhang liu chen yang huang zhao wu zhou xu sun ma zhu hu guo he lin gao luo zheng liang xie tang cao deng feng ' +
  'ng wong chan cheung leung lau chow tsang yeung nguyen tran pham hoang phan vu dang bui ngo duong').split(' '))
// Two-character family names in Chinese and Korean script.
const COMPOUND = new Set(['欧阳', '歐陽', '司马', '司馬', '诸葛', '諸葛', '上官', '东方', '東方', '皇甫', '尉迟', '尉遲', '公孙', '公孫', '慕容', '令狐', '夏侯',
  '남궁', '황보', '제갈', '선우', '독고', '사공', '서문'])
const CJK = /^[\p{Script=Han}\p{Script=Hangul}]+$/u

/** One full-name field (a portal, a guest list, staff typing a name) → the record. */
export function fromFullName(input: string | null | undefined): Name {
  const display = (input ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!display) return { display, first: '', last: '', sure: false }
  // Written in Chinese or Korean script without spaces: family name first, one character or a known two-character one.
  if (CJK.test(display)) {
    const n = COMPOUND.has(display.slice(0, 2)) && display.length > 2 ? 2 : 1
    return { display, first: display.slice(n), last: display.slice(0, n), sure: display.length <= 3 || n === 2 }
  }
  const comma = lastNameFirst(display)
  return 'name' in comma ? comma.name : fromWords(display, strip(comma.body.split(' ')))
}

/** "Doe, Jane" is last name first; "John Smith, Jr." is a suffix, so the name before the comma is the whole name. */
function lastNameFirst(display: string): { name: Name } | { body: string } {
  const parts = display.split(',').map((p) => p.trim()).filter(Boolean)
  const [before = '', after = ''] = parts
  if (parts.length !== 2) return { body: display }
  const afterWords = after.split(' ')
  if (afterWords.every((w) => SUFFIXES.has(fold(w)))) return { body: before }
  return { name: { display, first: strip(afterWords).join(' '), last: strip(before.split(' ')).join(' '), sure: true } }
}

/** A name written in words, titles and suffixes already removed. */
function fromWords(display: string, words: string[]): Name {
  const [head = '', second = ''] = words
  if (words.length === 1) return { display, first: head, last: '', sure: true }
  // Chinese or Korean script with spaces ("陳 美玲"): the family name is written first.
  if (CJK.test(head)) return { display, first: words.slice(1).join(' '), last: head, sure: true }
  // A romanized family name written first: "Kim Min-ji", "KIM Minji". "Grace Kim" stays given name first.
  if (words.length === 2 && FAMILY_FIRST.has(fold(head))) return romanizedTwoWords(display, head, second)
  // A surname prefix starts the last name: "Maria de la Cruz" → "de la Cruz".
  const p = words.findIndex((w, i) => i > 0 && i < words.length - 1 && PARTICLES.has(fold(w)))
  if (p > 0) return { display, first: words.slice(0, p).join(' '), last: words.slice(p).join(' '), sure: true }
  // Otherwise the last word. With three or more words it's a guess ("José García López" may be two surnames).
  return { display, first: words.slice(0, -1).join(' '), last: words.at(-1) ?? '', sure: words.length === 2 }
}

/** Two words, the first a common family name: "Kim Min-ji" and "KIM Minji" are family name first. */
function romanizedTwoWords(display: string, a: string, b: string): Name {
  const familyFirst = b.includes('-') || (a.length > 1 && a === a.toUpperCase() && b !== b.toUpperCase())
  if (familyFirst) return { display, first: b, last: a, sure: true }
  return { display, first: a, last: b, sure: false }   // "Chen Wei": either order is possible; staff can check
}

/** Without titles in front or suffixes behind ("Dr. Lena Ortiz Jr." → Lena Ortiz); a lone word is kept. */
function strip(words: string[]): string[] {
  const w = words.filter(Boolean)
  while (w.length > 1 && TITLES.has(fold(w[0] ?? ''))) w.shift()
  while (w.length > 1 && SUFFIXES.has(fold(w.at(-1) ?? ''))) w.pop()
  return w
}

/** First and last name fields (Give Lively's buyer columns, a two-field form) → the record. */
export function fromParts(first: string | null | undefined, last: string | null | undefined): Name {
  const f = (first ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
  const l = (last ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
  return { display: [f, l].filter(Boolean).join(' '), first: f, last: l, sure: Boolean(f) }
}

/** Sort and search key: family name, then given name, without accents ("Núñez, Ángel" → "nunez angel"). */
export function sortKey(n: Pick<Name, 'first' | 'last'>): string {
  return `${n.last || n.first} ${n.last ? n.first : ''}`.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

/** Salesforce Contact fields. LastName is required there, so a one-word name goes into LastName. */
export function forSalesforce(n: Name): { FirstName: string; LastName: string } {
  return n.last ? { FirstName: n.first, LastName: n.last } : { FirstName: '', LastName: n.display || n.first }
}
