// @vitest-environment jsdom
// Finding a comp on the guest list (AAFE's Oct 20 walk-through): a relationship guest just added sat far down the list,
// under its comp order's sponsor, and nothing picked out comps or the newest. A guest-type filter and a newest-first
// order find it.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { loadDB } from '@shared/data'
import type { DB, StaffUser } from '@shared/types'
import { demoApi } from '../api'
import { StaffCtx } from '../store'
import GuestList from './GuestList'

afterEach(cleanup)
const ADMIN: StaffUser = { id: 'st-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' }
/** How many rows the grid shows, and the first row's editable cells (first name, last name, title, organization...). */
const rowCount = () => screen.getByTestId('guest-grid').querySelectorAll('tbody tr').length
const firstRow = () => [...(screen.getByTestId('guest-grid').querySelector('tbody tr')?.querySelectorAll('textarea') ?? [])].map((i) => i.value).join(' ')

async function setup() {
  let db: DB = loadDB()
  const api = demoApi(ADMIN, (fn) => { db = fn(db) }, () => db)
  await api.addCompGuest({ first_name: 'Newcomp', last_name: 'Example', title: 'Partner', organization: 'Example Fund', email: 'newcomp@example.org', relationship_note: 'test' })
  // the newest by a clear margin, whatever the demo data's own dates
  db = { ...db, guests: db.guests.map((g) => (g.first_name === 'Newcomp' ? { ...g, created_at: '2099-01-01T00:00:00Z' } : g)) }
  render(<StaffCtx.Provider value={{ db, api, user: ADMIN, toast: () => {}, act: async (p) => { await p; return true }, demo: null }}><GuestList /></StaffCtx.Provider>)
  const current = new Set(db.orders.filter((o) => o.event_id === db.meta.current_event_id && o.status !== 'cancelled').map((o) => o.id))
  return db.guests.filter((g) => current.has(g.order_id) && g.guest_type === 'comp_relationship').length
}

describe('finding a comp on the guest list', () => {
  it('the guest-type filter shows relationship guests only', async () => {
    const comps = await setup()
    const all = rowCount()
    fireEvent.change(screen.getByLabelText('Filter by guest type'), { target: { value: 'comp_relationship' } })
    expect(rowCount()).toBe(comps)
    expect(rowCount()).toBeLessThan(all)
    expect(screen.getByText(`${comps} guests`)).toBeTruthy()
  })

  it('newest first puts the comp just added at the top', async () => {
    await setup()
    expect(firstRow()).not.toMatch(/Newcomp/)
    fireEvent.change(screen.getByLabelText('Order'), { target: { value: 'newest' } })
    expect(firstRow()).toMatch(/Newcomp Example/)
  })
})
