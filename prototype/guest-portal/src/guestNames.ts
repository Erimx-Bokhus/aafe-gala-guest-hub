import type { Lang } from './i18n'

export interface GuestNameParts {
  first_name: string
  last_name: string
  display_name?: string | null
}

export function guestNameForForm(guest: GuestNameParts, lang: Lang): string {
  if (guest.display_name != null) return guest.display_name
  const parts = lang === 'zh' || lang === 'ko'
    ? [guest.last_name, guest.first_name]
    : [guest.first_name, guest.last_name]
  return parts.filter(Boolean).join(' ')
}

export function guestNameForDisplay(guest: GuestNameParts): string {
  return guest.display_name ?? `${guest.first_name} ${guest.last_name}`
}
