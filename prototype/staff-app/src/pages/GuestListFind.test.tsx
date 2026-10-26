// @vitest-environment jsdom
// The guest list by table, a guest's sponsor one click away, and long text that wraps (AAFE's Oct 20 walk-through, items
// 11 and 29, and Aisling's note at 15:51).
import { afterEach, describe, expect, it } from 'vitest'
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
  const [first, last] = db.event_tables.filter((t) => t.event_id === db.meta.current_event_id).sort((a, b) => a.number - b.number).filter((_, i, all) => i === 0 || i === all.length - 1)
  const [a, b, c, d] = db.guests.filter((g) => current.has(g.order_id))
  db.guests = db.guests.map((g) =>
    g.id === a.id ? { ...g, table_id: last.id, seat_number: 9 } : g.id === b.id ? { ...g, table_id: first.id, seat_number: 9 }
      : g.id === c.id ? { ...g, table_id: null, seat_number: null } : g.id === d.id ? { ...g, first_name: 'Zyxwunique' } : g)
  const api = { live: false } as unknown as StaffApi
  render(<StaffCtx.Provider value={{ db, api, user: { id: 'st-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' }, toast: () => {}, act: async () => true, demo: null }}><GuestList /></StaffCtx.Provider>)
  const guests = db.guests.filter((g) => current.has(g.order_id))
  const rows = () => [...screen.getByTestId('guest-grid').querySelectorAll('tbody tr')]
  const tableOf = (r: Element) => (r.querySelector('select[aria-label^="Table for"]') as HTMLSelectElement).value
  return { db, guests, first, d, rows, tableOf }
}

describe('the guest list by table (item 11)', () => {
  it("shows one table's guests, or those with no table yet", () => {
    const { guests, first, rows, tableOf } = setup()
    fireEvent.change(screen.getByLabelText('Filter by table'), { target: { value: first.id } })
    expect(rows().length).toBe(guests.filter((g) => g.table_id === first.id).length)
    expect(rows().every((r) => tableOf(r) === first.id)).toBe(true)
    fireEvent.change(screen.getByLabelText('Filter by table'), { target: { value: 'none' } })
    expect(rows().length).toBe(guests.filter((g) => !g.table_id).length)
    expect(screen.getByTestId('guest-count').textContent).toBe(`${rows().length} guest${rows().length === 1 ? '' : 's'}`)
  })

  it('orders everyone by table number, with no table last', () => {
    const { db, rows, tableOf } = setup()
    fireEvent.change(screen.getByLabelText('Order'), { target: { value: 'table' } })
    const numbers = rows().map((r) => db.event_tables.find((t) => t.id === tableOf(r))?.number ?? Infinity)
    expect(numbers).toEqual([...numbers].sort((x, y) => x - y))
    expect(numbers.at(-1)).toBe(Infinity)
  })
})

describe('the guest list cells', () => {
  it("links the sponsor's name to its order page (item 29)", () => {
    const { d, rows } = setup()
    fireEvent.change(screen.getByLabelText('Search guests'), { target: { value: 'Zyxwunique' } })
    expect(rows().length).toBe(1)
    expect(rows()[0].querySelector('td a')?.getAttribute('href')).toBe(`#/sponsors/${d.order_id}`)
  })

  it('wraps long text: the cell grows with its copy, and a line break becomes a space', () => {
    const { d } = setup()
    const cell = screen.getByLabelText(`title for Zyxwunique ${d.last_name}`) as HTMLTextAreaElement
    fireEvent.change(cell, { target: { value: 'Senior Vice President\nCommunity Partnerships' } })
    expect(cell.value).toBe('Senior Vice President Community Partnerships')
    expect(cell.parentElement?.classList.contains('grow-wrap')).toBe(true)
    expect(cell.parentElement?.dataset.value).toBe(cell.value)
    expect(fireEvent.keyDown(cell, { key: 'Enter' })).toBe(false)   // Enter saves; it never adds a line
  })
})
