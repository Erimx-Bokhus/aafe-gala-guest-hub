// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { loadDB } from '@shared/data'
import type { DB } from '@shared/types'
import Portal from './Portal'

function PortalHarness({ initialDb, onDbChange }: { initialDb: DB; onDbChange: (db: DB) => void }) {
  const [db, setDb] = useState(initialDb)
  return <Portal db={db} update={(update) => setDb((current) => { const next = update(current); onDbChange(next); return next })} token="ac-6w9k3p5d" lang="en" />
}

afterEach(cleanup)

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
