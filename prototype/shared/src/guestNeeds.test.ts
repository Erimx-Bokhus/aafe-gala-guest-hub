import { describe, expect, it } from 'vitest'
import {
  countNeeds,
  needStatus,
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

describe('answered "none" vs not answered', () => {
  it('keeps "No dietary restrictions" as None, and it excludes the needs', () => {
    expect(serializeDietaryNeeds(['None'], '')).toBe('None')
    expect(serializeDietaryNeeds(['None', 'Vegan'], '')).toBe('None')
    expect(parseDietaryNeeds('None')).toEqual({ selected: ['None'], otherDetails: '' })
  })

  it('tells an answer of none from no answer', () => {
    expect(needStatus('None')).toBe('none')
    expect(needStatus('No')).toBe('none')
    expect(needStatus('')).toBe('unanswered')
    expect(needStatus(null)).toBe('unanswered')
    expect(needStatus('Vegan, Nut allergy')).toBe('some')
  })

  it('reads older names as today’s', () => {
    expect(parseAccessibilityNeeds('Step-free seating, Hearing loop')).toEqual({ selected: ['Step-free access', 'Hearing support'], otherDetails: '' })
  })
})

describe('counts for the caterer and the venue', () => {
  it('counts each need, the Other notes, and who has not answered', () => {
    const c = countNeeds(['Vegan, Nut allergy', 'Vegan', 'None', '', null, 'Other: no mushrooms'], 'dietary')
    const n = Object.fromEntries(c.byChoice.map((x) => [x.choice, x.count]))
    expect(n.Vegan).toBe(2)
    expect(n['Nut allergy']).toBe(1)
    expect(n.Other).toBe(1)
    expect(c.otherDetails).toEqual(['no mushrooms'])
    expect([c.some, c.none, c.unanswered]).toEqual([3, 1, 2])
  })

  it('counts accessibility under today’s names, older values included', () => {
    const c = countNeeds(['Step-free seating', 'Step-free access', 'None', 'Wheelchair access'], 'accessibility')
    const n = Object.fromEntries(c.byChoice.map((x) => [x.choice, x.count]))
    expect(n['Step-free access']).toBe(2)
    expect(n['Wheelchair access']).toBe(1)
    expect(c.none).toBe(1)
  })
})
