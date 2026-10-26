// @vitest-environment jsdom
// Payments & fees search, sort and Void (AAFE's Oct 20 walk-through, items 14 and 15; #223): find a payment, sort by any
// amount, date, sponsor or method, and void a check, ACH or wire entered by mistake. Gala admins only, never a Give
// Lively payment. The totals stay for the whole gala year.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { loadDB, methodLabel, sponsorOf } from '@shared/data'
import type { Role } from '@shared/types'
import type { StaffApi } from '../api'
import { StaffCtx } from '../store'
import Payments from './Payments'

afterEach(cleanup)

function setup(role: Role = 'gala_admin') {
  const db = loadDB()
  const current = new Set(db.orders.filter((o) => o.event_id === db.meta.current_event_id).map((o) => o.id))
  const pays = db.payments.filter((p) => current.has(p.order_id))
  const voidPayment = vi.fn(async () => {})
  const api = { live: false, voidPayment } as unknown as StaffApi
  render(<StaffCtx.Provider value={{ db, api, user: { id: 'st-x', name: 'Test User', email: 'user@aafe-demo.example.org', role }, toast: () => {}, act: async (p) => { await p; return true }, demo: null }}><Payments /></StaffCtx.Provider>)
  const rows = () => within(screen.getByTestId('fee-ledger')).getAllByRole('row').slice(1, -1)   // header and totals out
  const sponsor = (id: string) => sponsorOf(db, db.orders.find((o) => o.id === id)!.sponsor_id).organization_name
  return { pays, voidPayment, rows, sponsor }
}

describe('Payments & fees: search and sort (item 14)', () => {
  it("finds a sponsor's payments and keeps the totals for the whole year", () => {
    const { pays, rows, sponsor } = setup()
    const net = screen.getByTestId('net-total').textContent
    const name = sponsor(pays[0].order_id)
    fireEvent.change(screen.getByLabelText('Search payments'), { target: { value: name } })
    const mine = pays.filter((p) => sponsor(p.order_id).toLowerCase().includes(name.toLowerCase()))
    expect(rows().length).toBe(mine.length)
    expect(screen.getByTestId('payment-count').textContent).toBe(`${mine.length} of ${pays.length} payments · totals are for all ${pays.length}`)
    expect(screen.getByTestId('net-total').textContent).toBe(net)
  })

  it('sorts by method A to Z, then Z to A, and the heading keeps keyboard focus', () => {
    const { pays, rows } = setup()
    const sortMethod = screen.getByTestId('sort-method')
    sortMethod.focus()
    fireEvent.click(sortMethod)
    expect(document.activeElement).toBe(sortMethod)   // the same button, not a remounted one
    const methods = () => rows().map((r) => r.querySelectorAll('td')[2].textContent)
    expect(methods()).toEqual(pays.map((p) => methodLabel(p)).sort((a, b) => a.localeCompare(b)))
    expect(sortMethod.closest('th')!.getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(sortMethod)
    expect(methods()).toEqual(pays.map((p) => methodLabel(p)).sort((a, b) => b.localeCompare(a)))
  })
})

describe('Payments & fees: Void (item 15, #223)', () => {
  it('offers Void on staff-entered payments only', () => {
    const { pays } = setup()
    const staffEntered = pays.filter((p) => p.processor === 'none')
    expect(staffEntered.length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /^Void / }).length).toBe(staffEntered.length)
  })

  it('needs a reason, then voids that payment', async () => {
    const { pays, voidPayment } = setup()
    fireEvent.click(screen.getAllByRole('button', { name: /^Void / })[0])
    const dialog = screen.getByRole('dialog')
    const confirm = within(dialog).getByTestId('confirm-void') as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText(/Why/), { target: { value: 'Entered twice' } })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    await vi.waitFor(() => expect(voidPayment).toHaveBeenCalledTimes(1))
    expect((voidPayment.mock.calls[0] as unknown[])[1]).toBe('Entered twice')
    expect(pays.filter((x) => x.processor === 'none').map((x) => x.id)).toContain((voidPayment.mock.calls[0] as unknown[])[0])
  })

  it("isn't offered to a relationship manager (the server refuses them too)", () => {
    setup('relationship_manager')
    expect(screen.queryAllByRole('button', { name: /^Void / }).length).toBe(0)
  })
})
