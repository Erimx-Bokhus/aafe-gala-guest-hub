// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadDB } from '@shared/data'
import type { DB } from '@shared/types'
import Portal from './Portal'
import { getPortalView } from './portalApi'

const TOKEN = 'ac-6w9k3p5d'

function PortalHarness({ initialDb, onDbChange }: { initialDb: DB; onDbChange: (db: DB) => void }) {
  const [db, setDb] = useState(initialDb)
  return <Portal db={db} update={(update) => setDb((current) => { const next = update(current); onDbChange(next); return next })} token="ac-6w9k3p5d" lang="en" />
}

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', `#/s/${TOKEN}`)
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  window.history.replaceState(null, '', '#/')
})

describe('the sponsor link stays a secret, and contact never pretends to send', () => {
  it('opens the guest list header without a welcome dialog', () => {
    window.history.replaceState(null, '', `#/s/${TOKEN}`)
    render(<PortalHarness initialDb={loadDB()} onDbChange={() => undefined} />)
    expect(screen.getByRole('heading', { name: 'Your guests' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
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

// Gate 3: when the live portal can't load or save, the sponsor reads what happened and what to do, never why a seat
// is locked (a checked-in guest stays private: scripts/test-arrivals.mjs).
describe('live portal failures', () => {
  async function renderLive(api: { fetch: () => Promise<unknown>; save?: () => Promise<unknown> }) {
    vi.resetModules()
    vi.doMock('./portalApi', async (actual) => ({ ...(await actual<typeof import('./portalApi')>()), LIVE: true,
      fetchPortalView: api.fetch, saveAttendeeLive: api.save ?? (() => Promise.reject(new Error('not mocked'))) }))
    const { default: LivePortal } = await import('./Portal')
    render(<LivePortal db={loadDB()} update={() => {}} token={TOKEN} lang="en" />)
  }
  afterEach(() => { vi.doUnmock('./portalApi') })

  it("a list that couldn't load says to check the connection and reload, not that the link is bad", async () => {
    await renderLive({ fetch: () => Promise.reject(new Error('Failed to fetch')) })
    expect((await screen.findByRole('alert')).textContent).toBe('We couldn’t load your guest list. Please check your connection and reload this page.')
    expect(screen.queryByText('This guest-list link is not valid or has expired.')).toBeNull()
  })

  it('a locked seat says it can no longer be changed online; an expired link says to ask for a new one', async () => {
    const view = { ...getPortalView(loadDB(), TOKEN)!, deadline: null }
    const save = vi.fn()
      .mockRejectedValueOnce(new Error('seat_locked: this seat can no longer be changed online; please contact AAFE'))
      .mockRejectedValueOnce(new Error('invalid_link'))
    await renderLive({ fetch: async () => view, save })
    fireEvent.click(await screen.findByTestId('edit-seat-1'))
    fireEvent.click(screen.getByTestId('save-attendee'))
    expect(await screen.findByText('This seat can no longer be changed online. Please contact the AAFE Gala Planning Team.')).toBeTruthy()
    fireEvent.click(screen.getByTestId('save-attendee'))
    expect(await screen.findByText('This guest-list link is not valid or has expired. Please contact the AAFE Gala Planning Team for a new link.')).toBeTruthy()
  })
})
