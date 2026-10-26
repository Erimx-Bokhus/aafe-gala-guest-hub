// @vitest-environment jsdom
// No seat numbers on staff screens (AAFE's Oct 20 walk-through, 36:39: they don't seat guests at numbered places). The
// iPad check-in page and a sponsor's seat list show the table and its name, as the badge does; seat numbers stay in the
// database only to count who is at a table.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { loadDB, tableLabel } from '@shared/data'
import type { StaffApi } from '../api'
import { StaffCtx } from '../store'
import { curOrders } from './Dashboard'
import CheckIn from './CheckIn'
import { SponsorDetail } from './Sponsors'

afterEach(cleanup)

function setup() {
  const db = loadDB()
  const current = new Set(curOrders(db).map((o) => o.id))
  const g = db.guests.find((x) => current.has(x.order_id) && x.table_id && x.seat_number && x.attendance_status === 'expected')
  if (!g) throw new Error('the demo data needs a seated guest who has not arrived')
  const t = db.event_tables.find((x) => x.id === g.table_id)!
  expect(t.label).toBeTruthy()   // the demo's tables have names, so the name is checked too
  const ctx = { db, api: { live: false } as unknown as StaffApi, user: { id: 'st-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' as const }, toast: () => {}, act: async () => true, demo: null }
  return { db, g, t, ctx }
}

describe('no seat numbers on staff screens', () => {
  it('the check-in page shows the table and its name', () => {
    const { g, t, ctx } = setup()
    render(<StaffCtx.Provider value={ctx}><CheckIn /></StaffCtx.Provider>)
    fireEvent.change(screen.getByTestId('checkin-search'), { target: { value: `${g.first_name} ${g.last_name}` } })
    const row = screen.getByTestId(`arrive-${g.id}`).closest('li, div.card, div')!.parentElement!
    expect(row.textContent).toContain(tableLabel(t))
    expect(row.textContent).not.toMatch(/seat \d/i)
  })

  it("a sponsor's seat list shows the table and its name", () => {
    const { g, t, ctx } = setup()
    const { container } = render(<StaffCtx.Provider value={ctx}><SponsorDetail id={g.order_id} /></StaffCtx.Provider>)
    expect(container.textContent).toContain(tableLabel(t))
    expect(container.textContent).not.toMatch(new RegExp(`T${t.number} · S\\d`))
  })
})
