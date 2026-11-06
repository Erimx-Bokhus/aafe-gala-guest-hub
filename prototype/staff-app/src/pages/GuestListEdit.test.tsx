// @vitest-environment jsdom
// Editing a guest in the list (#242, Cornell's test, Oct 24): a save the server refuses (a bad email, a blank
// name) puts the saved value back in the cell, so it never looks saved when it isn't; an accepted edit stays.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { loadDB } from '@shared/data'
import type { StaffApi } from '../api'
import { StaffCtx } from '../store'
import { curOrders } from './Dashboard'
import GuestList from './GuestList'

afterEach(cleanup)

function setup(saved: boolean) {
  const db = loadDB()
  const current = new Set(curOrders(db).map((o) => o.id))
  const g = db.guests.find((x) => current.has(x.order_id) && x.email)
  if (!g) throw new Error('the demo data has no current guest with an email')
  const updateGuest = vi.fn(async () => {})
  const api = { live: false, updateGuest } as unknown as StaffApi
  // act() answers false when the server refuses the save (it shows the reason as a toast).
  render(<StaffCtx.Provider value={{ db, api, user: { id: 'st-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' }, toast: () => {}, act: async () => saved, demo: null }}><GuestList /></StaffCtx.Provider>)
  const cell = screen.getByLabelText(`email for ${g.first_name} ${g.last_name}`) as HTMLInputElement
  return { g, updateGuest, cell }
}

describe('editing a guest in the list (#242)', () => {
  it('puts the saved value back when the server refuses the edit', async () => {
    const { g, updateGuest, cell } = setup(false)
    fireEvent.change(cell, { target: { value: 'nope' } })
    fireEvent.blur(cell)
    expect(updateGuest).toHaveBeenCalledWith(g.id, { email: 'nope' })
    await waitFor(() => expect(cell.value).toBe(g.email))   // not "nope", which wasn't saved
  })

  it('keeps an edit the server accepted', async () => {
    const { cell } = setup(true)
    fireEvent.change(cell, { target: { value: 'new.address@guest.example.org' } })
    fireEvent.blur(cell)
    await new Promise((r) => setTimeout(r, 0))
    expect(cell.value).toBe('new.address@guest.example.org')
  })
})
