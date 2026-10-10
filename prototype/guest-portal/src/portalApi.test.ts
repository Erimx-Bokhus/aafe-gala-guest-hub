import { describe, expect, it } from 'vitest'
import { loadDB } from '@shared/data'
import { getPortalView, saveAttendee } from './portalApi'

describe('demo full-name persistence', () => {
  it('stores and returns the full name through the offline portal adapter', () => {
    const db = loadDB()
    const token = 'ac-6w9k3p5d'
    const view = getPortalView(db, token)
    expect(view).not.toBeNull()
    const orderId = db.orders.find((order) => order.portal_token === token)!.id
    const openSeat = view!.seats.find((seat) => !seat.guest)
    expect(openSeat).toBeDefined()

    const updated = saveAttendee(db, token, openSeat!.slot, {
      first_name: '陳偉', last_name: '', title: 'Director', organization: 'Example Org', email: 'guest@example.org',
      dietary_needs: '', accessibility_needs: '',
    })

    const savedGuest = updated.guests.find((guest) => guest.id === updated.seats.find((seat) => seat.order_id === orderId && seat.slot_number === openSeat!.slot)?.guest_id)
    expect(savedGuest).toMatchObject({ first_name: '陳偉', last_name: '', display_name: '陳偉' })
    expect(getPortalView(updated, token)?.seats.find((seat) => seat.slot === openSeat!.slot)?.guest?.display_name).toBe('陳偉')
  })
})
