// Food and accessibility needs: the one list of choices for every app. The sponsor portal shows them as
// checkboxes, the staff app counts them for the caterer and the venue, and the demo data generators use the
// same names, so a count never splits "Hearing support" from "Hearing loop".
//
// Stored on each guest as plain text, the chosen names joined by commas ("Vegan, Nut allergy", "Other: no
// mushrooms"). "None" means the guest answered and has no need; an empty value means nobody answered yet.

export const DIETARY_OPTIONS = [
  'Vegetarian', 'Vegan', 'Halal', 'Kosher', 'Gluten-free', 'No pork', 'No beef', 'No shellfish', 'Nut allergy',
] as const

export const ACCESSIBILITY_OPTIONS = [
  'Wheelchair access', 'Step-free access', 'Hearing support', 'Visual support',
] as const

/** Saved when a guest has no need: "No dietary restrictions", or "No" to accessibility support. */
export const NONE = 'None'

export type DietaryOption = typeof DIETARY_OPTIONS[number] | 'Other' | typeof NONE
export type AccessibilityOption = typeof ACCESSIBILITY_OPTIONS[number] | 'Other'

/** Older names, read as today's: values saved before the list changed still count in the right place. */
const ALIASES: Record<string, string> = { 'Step-free seating': 'Step-free access', 'Hearing loop': 'Hearing support' }

export type ParsedNeeds<T extends string> = { selected: T[]; otherDetails: string }

function parseNeeds<T extends string>(raw: string, known: readonly T[]): ParsedNeeds<T | 'Other'> {
  const value = raw.trim()
  if (!value || value === 'No' || value === 'Yes' || value === NONE) return { selected: [], otherDetails: '' }

  const selected = new Set<T | 'Other'>()
  const details: string[] = []
  const parts = value.split(/\s*[;,]\s*/).filter(Boolean)
  for (const written of parts) {
    const part = ALIASES[written] ?? written
    if (known.includes(part as T)) {
      selected.add(part as T)
    } else if (/^Other(?::|$)/.test(part)) {
      selected.add('Other')
      const detail = part.replace(/^Other\s*:?\s*/, '').trim()
      if (detail) details.push(detail)
    } else {
      // Preserve legacy free text, including values from the former single-select form.
      selected.add('Other')
      details.push(part.trim())
    }
  }
  return { selected: [...selected], otherDetails: details.join(', ') }
}

function serializeNeeds<T extends string>(selected: readonly (T | 'Other')[], otherDetails: string, order: readonly T[]): string {
  const choices = order.filter((choice) => selected.includes(choice))
  if (selected.includes('Other')) choices.push('Other' as T)
  const values: string[] = choices.map((choice) => choice === 'Other'
    ? (otherDetails.trim() ? `Other: ${otherDetails.trim()}` : 'Other')
    : choice)
  return values.join(', ')
}

/** Dietary: "None" stays "None"; otherwise the chosen options. */
export const parseDietaryNeeds = (value: string): ParsedNeeds<DietaryOption> =>
  value.trim() === NONE ? { selected: [NONE], otherDetails: '' } : parseNeeds(value, DIETARY_OPTIONS)
export const parseAccessibilityNeeds = (value: string) => parseNeeds(value, ACCESSIBILITY_OPTIONS)
export const serializeDietaryNeeds = (selected: readonly DietaryOption[], details: string) =>
  selected.includes(NONE) ? NONE : serializeNeeds(selected.filter((s): s is typeof DIETARY_OPTIONS[number] | 'Other' => s !== NONE), details, DIETARY_OPTIONS)
export const serializeAccessibilityNeeds = (selected: readonly AccessibilityOption[], details: string) => serializeNeeds(selected, details, ACCESSIBILITY_OPTIONS)

/** Has this guest answered? "none" (answered, no need), "some" (at least one need), or "unanswered".
 *  Same rule as has_need() in database/backend.sql, which sets the door list's access flag. */
export function needStatus(value: string | null | undefined): 'none' | 'some' | 'unanswered' {
  const v = (value ?? '').trim()
  if (!v) return 'unanswered'
  return /^(none|no)$/i.test(v) ? 'none' : 'some'
}

export interface NeedCounts {
  /** Guests per choice, in the list's order, then Other. */
  byChoice: { choice: string; count: number }[]
  /** What guests wrote under Other. */
  otherDetails: string[]
  some: number
  none: number
  unanswered: number
}

/** Counts for the caterer or the venue: how many guests chose each need, and how many haven't answered. */
export function countNeeds(values: (string | null | undefined)[], kind: 'dietary' | 'accessibility'): NeedCounts {
  const options: readonly string[] = kind === 'dietary' ? DIETARY_OPTIONS : ACCESSIBILITY_OPTIONS
  const counts = new Map<string, number>([...options, 'Other'].map((o) => [o, 0]))
  const otherDetails: string[] = []
  let some = 0, none = 0, unanswered = 0
  for (const v of values) {
    const status = needStatus(v)
    if (status === 'unanswered') { unanswered++; continue }
    if (status === 'none') { none++; continue }
    some++
    const parsed = kind === 'dietary' ? parseDietaryNeeds(v ?? '') : parseAccessibilityNeeds(v ?? '')   // needStatus said it has an answer
    for (const s of parsed.selected) if (s !== NONE) counts.set(s, (counts.get(s) ?? 0) + 1)
    if (parsed.otherDetails) otherDetails.push(parsed.otherDetails)
  }
  return { byChoice: [...counts].map(([choice, count]) => ({ choice, count })), otherDetails, some, none, unanswered }
}
