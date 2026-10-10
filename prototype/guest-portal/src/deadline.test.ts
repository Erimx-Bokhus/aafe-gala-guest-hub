import { describe, expect, it } from 'vitest'
import { isPastDeadline } from './deadline'

const deadline = '2027-04-23'

describe('isPastDeadline', () => {
  it('stays open when there is no deadline', () => {
    expect(isPastDeadline(null, { live: false, now: new Date('2027-04-24T12:00:00Z') })).toBe(false)
  })

  it('stays open the day before the deadline in New York', () => {
    expect(isPastDeadline(deadline, { live: false, now: new Date('2027-04-22T16:00:00Z') })).toBe(false)
  })

  it('stays open through the end of the deadline day in New York', () => {
    expect(isPastDeadline(deadline, { live: false, now: new Date('2027-04-24T03:59:59Z') })).toBe(false)
  })

  it('closes at the start of the day after the deadline in New York', () => {
    expect(isPastDeadline(deadline, { live: false, now: new Date('2027-04-24T04:00:00Z') })).toBe(true)
  })

  it('ignores demoToday in live mode', () => {
    expect(isPastDeadline(deadline, {
      live: true,
      search: '?demoToday=2099-01-01',
      now: new Date('2027-04-22T16:00:00Z'),
    })).toBe(false)
  })
})
