// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadDB } from '@shared/data'
import type { DB } from '@shared/types'
import Portal from './Portal'
import { portalWelcomeStorageKey, resetPortalWelcomeMemoryForTests } from './portalWelcome'

const TOKEN = 'ac-6w9k3p5d'

function PortalHarness({ initialDb, onDbChange }: { initialDb: DB; onDbChange: (db: DB) => void }) {
  const [db, setDb] = useState(initialDb)
  return <Portal db={db} update={(update) => setDb((current) => { const next = update(current); onDbChange(next); return next })} token="ac-6w9k3p5d" lang="en" />
}

beforeEach(() => {
  resetPortalWelcomeMemoryForTests()
  localStorage.clear()
  localStorage.setItem(portalWelcomeStorageKey(TOKEN), '1')
  window.history.replaceState(null, '', `#/s/${TOKEN}`)
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  resetPortalWelcomeMemoryForTests()
  window.history.replaceState(null, '', '#/')
})

describe('the sponsor link stays a secret, and contact never pretends to send', () => {
  it('keeps no copy of the sponsor link in browser storage', async () => {
    localStorage.removeItem(portalWelcomeStorageKey(TOKEN))
    expect(portalWelcomeStorageKey(TOKEN)).not.toContain(TOKEN)
    render(<PortalHarness initialDb={loadDB()} onDbChange={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'View your guest list' }))
    await waitFor(() => expect(localStorage.getItem(portalWelcomeStorageKey(TOKEN))).toBe('1'))
    expect(Object.keys(localStorage).some((k) => k.includes(TOKEN) || localStorage.getItem(k)?.includes(TOKEN))).toBe(false)
  })

  it("contact shows AAFE's gala inbox instead of a form that says sent", () => {
    render(<PortalHarness initialDb={loadDB()} onDbChange={() => undefined} />)
    fireEvent.click(screen.getByTestId('open-contact'))
    expect(screen.getByTestId('contact-email').getAttribute('href')).toBe('mailto:gala@aafe.org')
    expect(screen.queryByTestId('contact-form')).toBeNull()
    expect(screen.queryByTestId('contact-sent')).toBeNull()
  })
})

describe('sponsor welcome invitation', () => {
  it('shows on the first visit, remembers closing, and focuses the guest-list heading', async () => {
    localStorage.removeItem(portalWelcomeStorageKey(TOKEN))
    const db = loadDB()
    const first = render(<PortalHarness initialDb={db} onDbChange={() => undefined} />)
    const dialog = screen.getByRole('dialog', { name: 'Thank you, Acme Community Partners!' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByText('Your sponsorship makes this night possible. Next, add the names of your guests.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'View your guest list' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Thank you, Acme Community Partners!' })).toBeNull())
    expect(localStorage.getItem(portalWelcomeStorageKey(TOKEN))).toBe('1')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Your guests' })))

    first.unmount()
    render(<PortalHarness initialDb={db} onDbChange={() => undefined} />)
    expect(screen.queryByRole('dialog', { name: 'Thank you, Acme Community Partners!' })).toBeNull()
  })

  it('closes with Escape and returns focus to the page', async () => {
    localStorage.removeItem(portalWelcomeStorageKey(TOKEN))
    render(<PortalHarness initialDb={loadDB()} onDbChange={() => undefined} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Thank you, Acme Community Partners!' })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Your guests' })))
  })

  it('shows when ?welcome=1 is present, even if this token was already dismissed', () => {
    localStorage.setItem(portalWelcomeStorageKey(TOKEN), '1')
    window.history.replaceState(null, '', `#/s/${TOKEN}?welcome=1`)
    render(<PortalHarness initialDb={loadDB()} onDbChange={() => undefined} />)
    expect(screen.getByRole('dialog', { name: 'Thank you, Acme Community Partners!' })).toBeTruthy()
  })
})

describe('guest form with nullable seed fields', () => {
  it('opens and saves an existing guest with null display and needs fields', async () => {
    const db = loadDB()
    const order = db.orders.find((item) => item.portal_token === 'ac-6w9k3p5d')!
    const seat = db.seats.find((item) => item.order_id === order.id && item.guest_id)!
    const guest = db.guests.find((item) => item.id === seat.guest_id)!
    Object.assign(guest, { display_name: null, dietary_needs: null, accessibility_needs: null })

    let updatedDb = db
    render(<PortalHarness initialDb={db} onDbChange={(next) => { updatedDb = next }} />)
    fireEvent.click(screen.getByTestId(`edit-seat-${seat.slot_number}`))

    const fullName = await screen.findByLabelText('Full name') as HTMLInputElement
    expect(fullName.value).toBe(`${guest.first_name} ${guest.last_name}`.trim())
    fireEvent.click(screen.getByTestId('save-attendee'))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const savedGuest = updatedDb.guests.find((item) => item.id === guest.id)!
    expect(savedGuest).toMatchObject({ first_name: `${guest.first_name} ${guest.last_name}`.trim(), last_name: '', display_name: `${guest.first_name} ${guest.last_name}`.trim() })
  })
})

describe('hero contact button', () => {
  it('scrolls to the help heading and moves focus there', () => {
    const db = loadDB()
    const headingScroll = { behavior: '', block: '' }
    render(<PortalHarness initialDb={db} onDbChange={() => undefined} />)

    const heading = screen.getByRole('heading', { name: 'Questions or changes?' })
    Object.defineProperty(heading, 'scrollIntoView', { configurable: true, value: (options: ScrollIntoViewOptions) => Object.assign(headingScroll, options) })
    fireEvent.click(screen.getByTestId('hero-contact'))

    expect(headingScroll).toEqual({ behavior: 'smooth', block: 'start' })
    expect(document.activeElement).toBe(heading)
  })
})

describe('guest-facing slot wording', () => {
  it('uses guest labels in cards, add/edit actions, and the remove dialog', () => {
    const db = loadDB()
    render(<PortalHarness initialDb={db} onDbChange={() => undefined} />)

    expect(screen.getByText('Guest 4')).toBeTruthy()
    expect(screen.getByTestId('add-next').textContent).toContain('Add guest 6')
    expect(screen.getByLabelText(/Edit: Guest 1/)).toBeTruthy()

    fireEvent.click(screen.getByTestId('edit-seat-1'))
    expect(screen.getByRole('dialog').textContent).toContain('Edit guest 1')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.click(screen.getByTestId('remove-seat-1'))
    expect(screen.getByRole('dialog').textContent).toContain('Remove Jordan Lee from Guest 1?')
  })
})
