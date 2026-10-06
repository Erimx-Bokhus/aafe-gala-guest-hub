import { describe, expect, it } from 'vitest'
import { parseAmount, parseCount, parsePurchaseTime, purchaseKey, ValueError } from '../src/index.ts'

describe('parseAmount', () => {
  it('reads Give Lively amounts, including trailing spaces', () => {
    expect(parseAmount('$1,000.00 ')).toBe(1000)
    expect(parseAmount('$25,000.00')).toBe(25000)
    expect(parseAmount('2500')).toBe(2500)
    expect(parseAmount('$0.50')).toBe(0.5)
    expect(parseAmount('($250.00)')).toBe(-250)
  })
  it('treats blank as null', () => {
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('  ')).toBeNull()
    expect(parseAmount(undefined)).toBeNull()
  })
  it('rejects what it cannot read', () => {
    for (const s of ['abc', '$1,00.00', '1.234', '($5.00', '$1 000']) expect(() => parseAmount(s)).toThrow(ValueError)
  })
})

describe('parseCount', () => {
  it('reads whole numbers and blanks', () => {
    expect(parseCount(' 2 ')).toBe(2)
    expect(parseCount('')).toBeNull()
    expect(() => parseCount('2.5')).toThrow(ValueError)
  })
})

describe('parsePurchaseTime', () => {
  it('converts EST and EDT to UTC', () => {
    expect(parsePurchaseTime('2026-02-05 05:14:46 PM EST')).toBe('2026-02-05T22:14:46Z')
    expect(parsePurchaseTime('2026-04-10 09:00:00 AM EDT')).toBe('2026-04-10T13:00:00Z')
  })
  it('handles 12 AM and 12 PM', () => {
    expect(parsePurchaseTime('2026-02-05 12:05:00 AM EST')).toBe('2026-02-05T05:05:00Z')
    expect(parsePurchaseTime('2026-02-05 12:05:00 PM EST')).toBe('2026-02-05T17:05:00Z')
  })
  it('crosses midnight into the next UTC day', () => {
    expect(parsePurchaseTime('2026-12-31 11:30:00 PM EST')).toBe('2027-01-01T04:30:00Z')
  })
  it('reads US dates, 24-hour times, and numeric offsets', () => {
    expect(parsePurchaseTime('2/5/2026 17:14:46 EST')).toBe('2026-02-05T22:14:46Z')
    expect(parsePurchaseTime('2026-02-05 17:14 -05:00')).toBe('2026-02-05T22:14:00Z')
  })
  it('gives the same moment for the same purchase written in EST or UTC', () => {
    expect(parsePurchaseTime('2026-02-05 05:14:46 PM EST')).toBe(parsePurchaseTime('2026-02-05 22:14:46 UTC'))
  })
  it('rejects a time with no zone rather than guessing', () => {
    expect(() => parsePurchaseTime('2026-02-05 05:14:46 PM')).toThrow(/no time zone/)
  })
  it('rejects impossible or unreadable dates', () => {
    for (const s of ['2026-02-30 10:00:00 AM EST', '2026-02-05 13:00:00 PM EST', 'yesterday', '2026-02-05 10:00 XYZ']) {
      expect(() => parsePurchaseTime(s)).toThrow(ValueError)
    }
  })
})

describe('purchaseKey', () => {
  it('ignores email case and spaces', async () => {
    const a = await purchaseKey('grace.kim@example.org', '2026-02-05T22:14:46Z')
    expect(await purchaseKey(' Grace.Kim@Example.org ', '2026-02-05T22:14:46Z')).toBe(a)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
  it('differs by email or time', async () => {
    const a = await purchaseKey('grace.kim@example.org', '2026-02-05T22:14:46Z')
    expect(await purchaseKey('grace.kim@example.org', '2026-02-05T22:14:47Z')).not.toBe(a)
    expect(await purchaseKey('sam.lee@example.org', '2026-02-05T22:14:46Z')).not.toBe(a)
  })
})
