// @vitest-environment jsdom
// The guest list's Table column, which replaced the seating chart (Oct 17, #177): picking a table takes its first open seat,
// a full table can't be picked, and "No table" clears the guest's table. Badges print the table number from here.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { loadDB } from '@shared/data'
import type { StaffApi } from '../api'
import { StaffCtx } from '../store'
import { curOrders } from './Dashboard'
import GuestList from './GuestList'

afterEach(cleanup)

function setup() {
  const db = loadDB()
  const current = new Set(curOrders(db).map((o) => o.id))
  const [seated, unseated, alone] = db.guests.filter((g) => current.has(g.order_id))
  const [two, one] = db.event_tables.filter((t) => t.event_id === db.meta.current_event_id).sort((a, b) => a.number - b.number)
  db.event_tables = db.event_tables.map((t) => (t.id === two.id ? { ...t, capacity: 2 } : t.id === one.id ? { ...t, capacity: 1 } : t))
  db.guests = db.guests.map((g) =>
    g.id === seated.id ? { ...g, table_id: two.id, seat_number: 1 }
      : g.id === alone.id ? { ...g, table_id: one.id, seat_number: 1 }
        : g.table_id === two.id || g.table_id === one.id || g.id === unseated.id ? { ...g, table_id: null, seat_number: null } : g)
  const assignSeat = vi.fn(async () => {})
  const api = { live: false, assignSeat } as unknown as StaffApi
  render(<StaffCtx.Provider value={{ db, api, user: { id: 'st-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' }, toast: () => {}, act: async () => true, demo: null }}><GuestList /></StaffCtx.Provider>)
  const picker = (g: typeof seated) => screen.getByLabelText(`Table for ${g.first_name} ${g.last_name}`) as HTMLSelectElement
  return { seated, unseated, two, one, assignSeat, picker, guests: db.guests.filter((g) => current.has(g.order_id)) }
}

describe('the guest list Table column', () => {
  it('takes the first open seat at the table picked', () => {
    const { unseated, two, assignSeat, picker } = setup()
    fireEvent.change(picker(unseated), { target: { value: two.id } })
    expect(assignSeat).toHaveBeenCalledWith(unseated.id, two.id, 2)   // seat 1 is taken
  })

  it("can't pick a full table, and says so", () => {
    const { unseated, one, picker } = setup()
    const full = [...picker(unseated).options].find((o) => o.value === one.id)!
    expect(full.disabled).toBe(true)
    expect(full.textContent).toContain('(full)')
  })

  it('counts one guest as "1 guest", not "1 guests" (Oct 23 click-through)', () => {
    const { guests } = setup()
    const name = (g: (typeof guests)[number]) => `${g.first_name} ${g.last_name}`.toLowerCase()
    const one = guests.find((g) => guests.filter((h) => `${name(h)} ${h.organization}`.toLowerCase().includes(name(g))).length === 1)
    if (!one) throw new Error('the demo data has no guest with a name of their own')
    const search = screen.getByLabelText('Search guests')
    fireEvent.change(search, { target: { value: name(one) } })
    expect(screen.getByTestId('guest-count').textContent).toBe('1 guest')
    fireEvent.change(search, { target: { value: '' } })
    expect(screen.getByTestId('guest-count').textContent).toBe(`${guests.length} guests`)
  })

  it('"No table" clears the guest\'s table', () => {
    const { seated, assignSeat, picker } = setup()
    expect(picker(seated).value).not.toBe('')
    fireEvent.change(picker(seated), { target: { value: '' } })
    expect(assignSeat).toHaveBeenCalledWith(seated.id, null, null)
  })
})
