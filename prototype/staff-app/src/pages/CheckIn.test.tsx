// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { loadDB } from '@shared/data'
import type { Ctx } from '../store'
import { StaffCtx } from '../store'
import CheckIn from './CheckIn'

afterEach(cleanup)

describe('Recent arrivals', () => {
  it('shows the six newest check-ins by checked_in_at, newest first, regardless of id order', () => {
    const db = loadDB()
    const eventGuests = db.guests.filter((g) => db.orders.some((o) => o.id === g.order_id && o.event_id === db.meta.current_event_id))
    db.guests = eventGuests.slice(0, 8).map((g, i) => ({ ...g, first_name: `Arrival ${i + 1}`, last_name: 'Guest' }))

    // API rows are id-sorted. The iPad can sync late, so ids need not follow arrival time.
    const timesInIdOrder = [5, 4, 3, 2, 1, 8, 7, 6]
    db.check_ins = timesInIdOrder.map((day, i) => ({
      id: `ci-${String(i + 1).padStart(3, '0')}`,
      event_id: db.meta.current_event_id,
      guest_id: db.guests[i].id,
      order_id: db.guests[i].order_id,
      arrival_name: null,
      method: 'search',
      type: 'standard',
      checked_in_by: 'Staff',
      note: '',
      checked_in_at: `2027-05-${String(day).padStart(2, '0')}T18:00:00.000Z`,
    }))
    // Undo deletes the check_ins row (the live sync sends a check_ins tombstone), so undone arrivals are absent here.

    const context = { db, api: {} as Ctx['api'], user: {} as Ctx['user'], toast: () => {}, act: async () => true, demo: null } satisfies Ctx
    render(<StaffCtx.Provider value={context}><CheckIn /></StaffCtx.Provider>)

    const list = screen.getByText('Recent arrivals').parentElement!.querySelectorAll('li')
    expect([...list].map((li) => li.textContent)).toEqual([
      expect.stringContaining('Arrival 6 Guest'),
      expect.stringContaining('Arrival 7 Guest'),
      expect.stringContaining('Arrival 8 Guest'),
      expect.stringContaining('Arrival 1 Guest'),
      expect.stringContaining('Arrival 2 Guest'),
      expect.stringContaining('Arrival 3 Guest'),
    ])
  })
})
