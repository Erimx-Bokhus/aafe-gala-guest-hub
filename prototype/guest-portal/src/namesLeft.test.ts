import { describe, expect, it } from 'vitest'
import { DICT } from './i18n'
import { namesLeftText } from './namesLeft'

const text = (count: number, deadline?: string) => namesLeftText(count, deadline, DICT.en.namesLeft)

describe('names left message', () => {
  it('is hidden when every guest has a name', () => {
    expect(text(0, 'May 11, 2027')).toBeNull()
  })

  it('uses singular copy for one guest', () => {
    expect(text(1, 'May 11, 2027')).toBe('1 guest still needs a name · add by May 11, 2027')
  })

  it('uses plural copy for several guests', () => {
    expect(text(3, 'May 11, 2027')).toBe('3 guests still need names · add by May 11, 2027')
  })

  it('omits the deadline phrase when there is no deadline', () => {
    expect(text(2)).toBe('2 guests still need names')
  })
})
