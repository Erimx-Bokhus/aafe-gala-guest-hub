// @vitest-environment jsdom
// Badges for guests admitted without a table (Oct 25): most guests have none (208 of 553 in 2026), so their badge has
// no table line rather than "Table assignment pending", and a seated guest's badge shows the table and its name, never a
// seat number (AAFE's Oct 20 walk-through, item 24).
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { loadDB, tableLabel } from '@shared/data'
import type { StaffApi } from '../api'
import { StaffCtx } from '../store'
import { curOrders } from './Dashboard'
import Badges from './Badges'

afterEach(cleanup)

describe('a badge without a table', () => {
  it('has no table line, and a seated guest\'s badge shows the table and its name, no seat', () => {
    const db = loadDB()
    const current = new Set(curOrders(db).map((o) => o.id))
    const seated = db.guests.find((g) => current.has(g.order_id) && g.table_id && g.seat_number)
    const unseated = db.guests.find((g) => current.has(g.order_id) && !g.table_id)
    if (!seated || !unseated) throw new Error('the demo data needs a seated and an unseated guest')
    db.guests = db.guests.map((g) => ({ ...g, badge_status: g.id === seated.id || g.id === unseated.id ? 'ready' : 'needs_review' }))
    const table = db.event_tables.find((t) => t.id === seated.table_id)
    if (!table) throw new Error('the seated guest\'s table is missing')
    const { container } = render(<StaffCtx.Provider value={{ db, api: { live: false } as unknown as StaffApi, user: { id: 'st-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' }, toast: () => {}, act: async () => true, demo: null }}><Badges /></StaffCtx.Provider>)
    const card = (first: string, last: string) => [...container.querySelectorAll('.badge-card')].find((c) => c.textContent?.includes(`${first} ${last}`))
    const withTable = card(seated.first_name, seated.last_name), without = card(unseated.first_name, unseated.last_name)
    expect(table.label).toBeTruthy()   // the demo's tables have names, so the name is checked too
    expect(withTable?.querySelector('[data-testid="badge-table"]')?.textContent).toBe(tableLabel(table))
    expect(withTable?.textContent).not.toMatch(/Seat/)
    expect(without).toBeTruthy()
    expect(without?.textContent).not.toMatch(/Table/)
  })
})
