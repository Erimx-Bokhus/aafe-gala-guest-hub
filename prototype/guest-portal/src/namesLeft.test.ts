import { describe, expect, it } from 'vitest'
import { DICT } from './i18n'
import { namesLeftText } from './namesLeft'

const text = (count: number) => namesLeftText(count, DICT.en.namesLeft)

describe('names left message', () => {
  it('is hidden when every guest has a name', () => {
    expect(text(0)).toBeNull()
  })

  it('uses singular copy for one guest without repeating the deadline', () => {
    expect(text(1)).toBe('1 guest still needs a name')
  })

  it('uses plural copy for several guests without repeating the deadline', () => {
    expect(text(3)).toBe('3 guests still need names')
  })

  it('keeps every translated version short and date-free', () => {
    expect(namesLeftText(3, DICT.zh.namesLeft)).toBe('3 位賓客仍需填寫姓名')
    expect(namesLeftText(3, DICT.es.namesLeft)).toBe('Aún faltan los nombres de 3 invitados')
    expect(namesLeftText(3, DICT.ko.namesLeft)).toBe('3명의 게스트 이름이 아직 필요합니다')
  })
})
