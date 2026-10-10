import { describe, expect, it } from 'vitest'
import {
  parseAccessibilityNeeds,
  parseDietaryNeeds,
  serializeAccessibilityNeeds,
  serializeDietaryNeeds,
} from './guestNeeds'

describe('guest needs serialization', () => {
  it('serializes multiple dietary selections as comma-separated English values', () => {
    expect(serializeDietaryNeeds(['Vegetarian', 'Nut allergy'], '')).toBe('Vegetarian, Nut allergy')
  })

  it('serializes Other with its description', () => {
    expect(serializeDietaryNeeds(['Other'], 'no mushrooms')).toBe('Other: no mushrooms')
    expect(serializeAccessibilityNeeds(['Other'], 'large-print program')).toBe('Other: large-print program')
  })

  it('parses known saved values back into checked options', () => {
    expect(parseDietaryNeeds('Vegan, Nut allergy')).toEqual({ selected: ['Vegan', 'Nut allergy'], otherDetails: '' })
    expect(parseAccessibilityNeeds('Wheelchair access, Hearing support')).toEqual({
      selected: ['Wheelchair access', 'Hearing support'], otherDetails: '',
    })
  })

  it('routes unknown legacy text into Other without losing it', () => {
    expect(parseDietaryNeeds('No mushrooms')).toEqual({ selected: ['Other'], otherDetails: 'No mushrooms' })
    expect(parseDietaryNeeds('Vegetarian, No mushrooms')).toEqual({ selected: ['Vegetarian', 'Other'], otherDetails: 'No mushrooms' })
    expect(parseAccessibilityNeeds('Wheelchair access; Ramp near entrance')).toEqual({
      selected: ['Wheelchair access', 'Other'], otherDetails: 'Ramp near entrance',
    })
  })

  it('uses an empty string when no dietary or accessibility choices are selected', () => {
    expect(serializeDietaryNeeds([], '')).toBe('')
    expect(serializeAccessibilityNeeds([], '')).toBe('')
  })
})
