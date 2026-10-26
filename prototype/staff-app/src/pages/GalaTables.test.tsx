// @vitest-environment jsdom
// Tables on Gala information (AAFE's Oct 20 walk-through, items 12 and 24): a gala admin names a table and sets how many it
// seats. The demo store keeps staff_save_table's rules (scripts/test-backend.mjs checks the server's): a table can't seat
// fewer than are at it, a guest past a smaller size moves to an open seat number, and a new name flags printed badges.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { loadDB } from '@shared/data'
import type { DB, Role, StaffUser } from '@shared/types'
import { demoApi } from '../api'
import { StaffCtx, saveTable } from '../store'
import GalaInfo from './GalaInfo'

afterEach(cleanup)
const user = (role: Role): StaffUser => ({ id: 'st-x', name: 'Test User', email: 'user@aafe-demo.example.org', role })

function show(role: Role) {
  let db: DB = loadDB()
  const api = demoApi(user(role), (fn) => { db = fn(db) }, () => db)
  render(<StaffCtx.Provider value={{ db, api, user: user(role), toast: () => {}, act: async (p) => { await p; return true }, demo: null }}><GalaInfo /></StaffCtx.Provider>)
  const t = db.event_tables.filter((x) => x.event_id === db.meta.current_event_id).sort((a, b) => a.number - b.number)[0]
  return { now: () => db, t, at: db.guests.filter((g) => g.table_id === t.id).length }
}

describe('Tables on Gala information', () => {
  it('lets a gala admin rename a table and change its size', async () => {
    const { now, t } = show('gala_admin')
    fireEvent.change(screen.getByLabelText(`Name of Table ${t.number}`), { target: { value: '  Peony  ' } })
    fireEvent.change(screen.getByLabelText(`Seats at Table ${t.number}`), { target: { value: '12' } })
    fireEvent.click(screen.getByLabelText(`Seats at Table ${t.number}`).closest('tr')!.querySelector('button')!)
    await vi.waitFor(() => expect(now().event_tables.find((x) => x.id === t.id)).toMatchObject({ label: 'Peony', capacity: 12 }))
    expect(now().audit_log.at(-1)).toMatchObject({ entity: 'table', entity_id: t.id, action: 'table.updated' })
  })

  it("won't save a size smaller than the guests at the table, and says how many are there", () => {
    const { t, at } = show('gala_admin')
    expect(at).toBeGreaterThan(1)
    const seats = screen.getByLabelText(`Seats at Table ${t.number}`)
    fireEvent.change(seats, { target: { value: String(at - 1) } })
    expect(seats.closest('td')!.textContent).toContain(`${at} seated now`)
    expect((seats.closest('tr')!.querySelector('button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows a relationship manager the tables without letting them change them', () => {
    const { t } = show('relationship_manager')
    expect((screen.getByLabelText(`Name of Table ${t.number}`) as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByLabelText(`Seats at Table ${t.number}`).closest('tr')!.querySelector('button')).toBeNull()
  })
})

describe('saveTable in the demo store', () => {
  const setup = () => {
    const db = loadDB()
    const t = db.event_tables.find((x) => db.guests.filter((g) => g.table_id === x.id).length >= 2)
    if (!t) throw new Error('the demo data needs a table with two guests')
    const [far, printed] = db.guests.filter((g) => g.table_id === t.id)
    db.guests = db.guests.map((g) => (g.id === far.id ? { ...g, seat_number: t.capacity } : g.id === printed.id ? { ...g, badge_status: 'printed' as const } : g))
    return { db, t, far, printed, at: db.guests.filter((g) => g.table_id === t.id).length }
  }

  it('moves a guest past a smaller size to an open seat number, and flags printed badges when renamed', () => {
    const { db, t, far, printed, at } = setup()
    const next = saveTable(db, user('gala_admin'), t.id, 'Peony', at)
    const seats = next.guests.filter((g) => g.table_id === t.id).map((g) => g.seat_number)
    expect(seats.every((n) => n != null && n >= 1 && n <= at)).toBe(true)
    expect(new Set(seats).size).toBe(at)
    expect(next.guests.find((g) => g.id === far.id)?.seat_number).toBeLessThanOrEqual(at)
    expect(next.guests.find((g) => g.id === printed.id)?.badge_status).toBe('reprint_needed')
  })

  it('refuses a size below the guests at the table, or outside 1 to 30', () => {
    const { db, t, at } = setup()
    expect(() => saveTable(db, user('gala_admin'), t.id, '', at - 1)).toThrow(`${at} people are at Table ${t.number}`)
    expect(() => saveTable(db, user('gala_admin'), t.id, '', 0)).toThrow('invalid_input')
    expect(() => saveTable(db, user('gala_admin'), t.id, '', 31)).toThrow('invalid_input')
  })
})
