import { describe, expect, it } from 'vitest'
import { guestNameForDisplay, guestNameForForm } from './guestNames'

describe('guest full names', () => {
  it('prefers the demo display_name exactly as saved', () => {
    expect(guestNameForForm({ first_name: '陳偉', last_name: '', display_name: '陳偉' }, 'zh')).toBe('陳偉')
    expect(guestNameForDisplay({ first_name: '陳偉', last_name: '', display_name: '陳偉' })).toBe('陳偉')
  })

  it('prefills old Chinese and Korean records family name first', () => {
    const oldRecord = { first_name: 'Wei', last_name: 'Chen' }
    expect(guestNameForForm(oldRecord, 'zh')).toBe('Chen Wei')
    expect(guestNameForForm(oldRecord, 'ko')).toBe('Chen Wei')
  })

  it('keeps a two-part Spanish surname together', () => {
    const guest = { first_name: 'María', last_name: 'García López' }
    expect(guestNameForForm(guest, 'es')).toBe('María García López')
  })

  it('retains the old first-name then last-name display when display_name is absent', () => {
    expect(guestNameForDisplay({ first_name: 'María', last_name: 'García López' })).toBe('María García López')
  })
})
