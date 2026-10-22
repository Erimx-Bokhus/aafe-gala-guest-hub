// @vitest-environment jsdom
// Relationship guests shows this gala's only (AAFE's Oct 20 walk-through, triage B5). It listed every gala's while the
// guest list shows the current gala only, so once next year's gala runs, last year's comps would show up again.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { loadDB } from '@shared/data'
import type { DB, StaffUser } from '@shared/types'
import { demoApi } from '../api'
import { StaffCtx } from '../store'
import Relationship from './Relationship'

afterEach(cleanup)
const ADMIN: StaffUser = { id: 'st-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' }

describe('Relationship guests', () => {
  it("lists this gala's relationship guests, not another gala's", () => {
    let db: DB = loadDB()
    const current = db.guests.find((g) => g.guest_type === 'comp_relationship')
    const past = db.orders.find((o) => o.event_id !== db.meta.current_event_id)
    if (!current || !past) throw new Error('the demo data needs a relationship guest and a past gala order')
    db = { ...db, guests: [...db.guests, { ...current, id: 'g-past-comp', order_id: past.id, first_name: 'Pastgala', last_name: 'Example' }] }
    const api = demoApi(ADMIN, (fn) => { db = fn(db) }, () => db)
    render(<StaffCtx.Provider value={{ db, api, user: ADMIN, toast: () => {}, act: async (p) => { await p; return true }, demo: null }}><Relationship /></StaffCtx.Provider>)
    expect(screen.getAllByText(`${current.first_name} ${current.last_name}`).length).toBeGreaterThan(0)
    expect(screen.queryByText('Pastgala Example')).toBeNull()
  })
})
