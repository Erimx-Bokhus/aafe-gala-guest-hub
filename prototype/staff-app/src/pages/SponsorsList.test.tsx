// @vitest-environment jsdom
// Sponsors & orders filters and sortable headings (AAFE's Oct 20 walk-through, item 2): staff narrow the list by package,
// owner or status, and any heading but Source and Seats sorts it, clicking again flips the order.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { loadDB, sponsorOf, staffName } from '@shared/data'
import type { StaffApi } from '../api'
import { StaffCtx } from '../store'
import { curOrders } from './Dashboard'
import Sponsors from './Sponsors'

afterEach(cleanup)

function setup() {
  const db = loadDB()
  const api = { live: false } as unknown as StaffApi
  render(<StaffCtx.Provider value={{ db, api, user: { id: 'st-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' }, toast: () => {}, act: async () => true, demo: null }}><Sponsors /></StaffCtx.Provider>)
  const names = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((r) => r.querySelector('td')!.textContent)
  return { db, orders: curOrders(db), names }
}

describe('Sponsors & orders list', () => {
  it('filters by status, then by owner too, and Clear filters brings every order back', () => {
    const { db, orders, names } = setup()
    const pledged = orders.filter((o) => o.status === 'pledged')
    expect(pledged.length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'pledged' } })
    expect(names().sort()).toEqual(pledged.map((o) => sponsorOf(db, o.sponsor_id).organization_name).sort())
    expect(screen.getByTestId('sponsor-count').textContent).toBe(`${pledged.length} of ${orders.length} orders`)

    const ownerId = sponsorOf(db, pledged[0].sponsor_id).relationship_owner_id
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: ownerId } })
    const both = pledged.filter((o) => sponsorOf(db, o.sponsor_id).relationship_owner_id === ownerId)
    expect(names().sort()).toEqual(both.map((o) => sponsorOf(db, o.sponsor_id).organization_name).sort())
    expect(within(screen.getByRole('table')).getAllByText(staffName(db, ownerId)).length).toBe(both.length)

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(names().length).toBe(orders.length)
  })

  it('filters by package', () => {
    const { db, orders, names } = setup()
    const tierId = orders[0].tier_id
    fireEvent.change(screen.getByLabelText('Package'), { target: { value: tierId } })
    expect(names().length).toBe(orders.filter((o) => o.tier_id === tierId).length)
    expect(names()).toContain(sponsorOf(db, orders[0].sponsor_id).organization_name)
  })

  it('sorts by commitment, largest first, and a heading click sorts A to Z, then Z to A, keeping keyboard focus', () => {
    const { names } = setup()
    expect(screen.getByTestId('sort-commitment').closest('th')!.getAttribute('aria-sort')).toBe('descending')
    const sortSponsor = screen.getByTestId('sort-sponsor')
    sortSponsor.focus()
    fireEvent.click(sortSponsor)
    expect(document.activeElement).toBe(sortSponsor)   // the same button, not a remounted one
    const az = names()
    expect(az).toEqual([...az].sort((a, b) => a!.localeCompare(b!)))
    expect(screen.getByTestId('sort-sponsor').closest('th')!.getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(screen.getByTestId('sort-sponsor'))
    expect(names()).toEqual([...az].reverse())
  })
})
