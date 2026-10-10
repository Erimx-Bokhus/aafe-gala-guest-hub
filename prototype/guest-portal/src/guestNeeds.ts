export const DIETARY_OPTIONS = [
  'Vegetarian', 'Vegan', 'Halal', 'Kosher', 'Gluten-free', 'No pork', 'No beef', 'No shellfish', 'Nut allergy',
] as const

export const ACCESSIBILITY_OPTIONS = [
  'Wheelchair access', 'Step-free seating', 'Hearing support', 'Visual support',
] as const

export type DietaryOption = typeof DIETARY_OPTIONS[number] | 'Other'
export type AccessibilityOption = typeof ACCESSIBILITY_OPTIONS[number] | 'Other'

export type ParsedNeeds<T extends string> = { selected: T[]; otherDetails: string }

function parseNeeds<T extends string>(raw: string, known: readonly T[]): ParsedNeeds<T | 'Other'> {
  const value = raw.trim()
  if (!value || value === 'No') return { selected: [], otherDetails: '' }
  if (value === 'Yes') return { selected: [], otherDetails: '' }

  const selected = new Set<T | 'Other'>()
  const details: string[] = []
  const parts = value.split(/\s*[;,]\s*/).filter(Boolean)
  for (const part of parts) {
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

export const parseDietaryNeeds = (value: string) => parseNeeds(value, DIETARY_OPTIONS)
export const parseAccessibilityNeeds = (value: string) => parseNeeds(value, ACCESSIBILITY_OPTIONS)
export const serializeDietaryNeeds = (selected: readonly DietaryOption[], details: string) => serializeNeeds(selected, details, DIETARY_OPTIONS)
export const serializeAccessibilityNeeds = (selected: readonly AccessibilityOption[], details: string) => serializeNeeds(selected, details, ACCESSIBILITY_OPTIONS)
