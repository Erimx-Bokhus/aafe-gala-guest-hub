// The name engine: the display name is kept exactly; first and last are a best guess for sorting. Invented names only.
import { describe, expect, it } from 'vitest'
import { forSalesforce, fromFullName, fromParts, sortKey } from '../src/index.ts'

const split = (s: string) => { const n = fromFullName(s); return [n.first, n.last, n.sure] }

describe('fromFullName', () => {
  it('keeps the display name exactly as written, spaces tidied', () => {
    expect(fromFullName('  Dr.  Lena   Ortiz ').display).toBe('Dr. Lena Ortiz')
    expect(fromFullName('').display).toBe('')
  })

  it('given name first, family name last', () => {
    expect(split('Jane Doe')).toEqual(['Jane', 'Doe', true])
    expect(split('Grace Kim')).toEqual(['Grace', 'Kim', true])
  })

  it('titles and suffixes stay in the display name, not in first or last', () => {
    expect(split('Dr. Lena Ortiz')).toEqual(['Lena', 'Ortiz', true])
    expect(split('Rev Samuel Lee Jr.')).toEqual(['Samuel', 'Lee', true])
    expect(split('John Smith, Jr.')).toEqual(['John', 'Smith', true])
    expect(fromFullName('Dr. Lena Ortiz').display).toBe('Dr. Lena Ortiz')
  })

  it('surname prefixes stay with the last name', () => {
    expect(split('Maria de la Cruz')).toEqual(['Maria', 'de la Cruz', true])
    expect(split('Ludwig van Beethoven')).toEqual(['Ludwig', 'van Beethoven', true])
  })

  it('"Last, First" reads the last name first', () => {
    expect(split('Doe, Jane')).toEqual(['Jane', 'Doe', true])
  })

  it('a one-word name is allowed, with no last name', () => {
    expect(split('Cher')).toEqual(['Cher', '', true])
  })

  it('Chinese and Korean script: family name first, including two-character family names', () => {
    expect(split('陳美玲')).toEqual(['美玲', '陳', true])
    expect(split('김민지')).toEqual(['민지', '김', true])
    expect(split('欧阳娜娜')).toEqual(['娜娜', '欧阳', true])
    expect(split('남궁민')).toEqual(['민', '남궁', true])
    expect(split('陳 美玲')).toEqual(['美玲', '陳', true])
  })

  it('a romanized family name written first is recognized from the pattern, otherwise flagged as a guess', () => {
    expect(split('Kim Min-ji')).toEqual(['Min-ji', 'Kim', true])
    expect(split('KIM Minji')).toEqual(['Minji', 'KIM', true])
    expect(split('Chen Wei')).toEqual(['Chen', 'Wei', false])       // either order is possible: staff check
    expect(split('Kim Lee')).toEqual(['Kim', 'Lee', false])
  })

  it('three or more words is a guess (two given names, or two surnames?)', () => {
    expect(split('José García López')).toEqual(['José García', 'López', false])
  })
})

describe('fromParts, sortKey, forSalesforce', () => {
  it('builds the display name from first and last', () => {
    expect(fromParts(' Jane ', 'Doe')).toEqual({ display: 'Jane Doe', first: 'Jane', last: 'Doe', sure: true })
    expect(fromParts('Cher', '').display).toBe('Cher')
  })

  it('sorts by family name, without accents', () => {
    expect(sortKey(fromFullName('Ángel Núñez'))).toBe('nunez angel')
    expect(sortKey(fromFullName('Cher'))).toBe('cher')
    expect([fromFullName('Kim Min-ji'), fromFullName('Jane Doe')].map(sortKey).sort()).toEqual(['doe jane', 'kim min-ji'])
  })

  it('Salesforce always gets a last name', () => {
    expect(forSalesforce(fromFullName('Jane Doe'))).toEqual({ FirstName: 'Jane', LastName: 'Doe' })
    expect(forSalesforce(fromFullName('Cher'))).toEqual({ FirstName: '', LastName: 'Cher' })
  })
})
