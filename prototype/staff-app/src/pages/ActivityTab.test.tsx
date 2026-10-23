// @vitest-environment jsdom
// A sponsor's activity (Aisling's review of the story video, Oct 22): it opens from an Activity button in its own
// scrolling window instead of a long list under the seats, and the change log is gala admins' (Oct 20 and Oct 22):
// a relationship manager sees only what the sponsor changed in the portal and what Give Lively recorded.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { addAudit, loadDB } from '@shared/data'
import type { DB, StaffUser } from '@shared/types'
import { demoApi } from '../api'
import { StaffCtx } from '../store'
import { SponsorDetail } from './Sponsors'

afterEach(cleanup)
const ADMIN: StaffUser = { id: 'st-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' }
const RM: StaffUser = { id: 'st-rm', name: 'Test Manager', email: 'rm@aafe-demo.example.org', role: 'relationship_manager' }

function show(user: StaffUser) {
  let db: DB = loadDB()
  const order = db.orders.find((o) => o.event_id === db.meta.current_event_id && db.seats.some((s) => s.order_id === o.id))
  if (!order) throw new Error('the demo data has no order with seats')
  const entry = { entity: 'order', entity_id: order.id, order_id: order.id, from_state: null, to_state: null }
  db = { ...db, audit_log: db.audit_log.filter((a) => a.order_id !== order.id) }
  db = addAudit(db, { ...entry, actor_type: 'staff', actor: 'Mei Lin Ortiz', action: 'payment.recorded', guest_visible: false, summary: 'Test: a staff change.' })
  db = addAudit(db, { ...entry, actor_type: 'guest_portal', actor: 'Jordan Lee', action: 'guest.added', guest_visible: true, summary: 'Test: a portal change.' })
  db = addAudit(db, { ...entry, actor_type: 'system', actor: 'Give Lively sync', action: 'order.created', guest_visible: true, summary: 'Test: a Give Lively change.' })
  const api = { ...demoApi(user, (fn) => { db = fn(db) }, () => db), live: false }
  render(<StaffCtx.Provider value={{ db, api, user, toast: () => {}, act: async (p) => { await p; return true }, demo: null }}><SponsorDetail id={order.id} /></StaffCtx.Provider>)
}
const open = () => { fireEvent.click(screen.getByTestId('open-activity')); return screen.getByTestId('activity-list').textContent ?? '' }

describe("a sponsor's activity", () => {
  it('opens from the Activity button in its own window, not as a list under the seats', () => {
    show(ADMIN)
    expect(screen.queryByTestId('activity-list')).toBeNull()
    expect(document.body.textContent).not.toContain('Test: a staff change.')
    expect(screen.getByTestId('open-activity').textContent).toContain('Activity (3)')
    open()
    expect(screen.getByRole('dialog', { name: 'Activity for this order' })).toBeTruthy()
  })

  it('a gala admin sees every change, staff changes included', () => {
    show(ADMIN)
    const list = open()
    for (const s of ['staff', 'portal', 'Give Lively']) expect(list).toContain(`Test: a ${s} change.`)
    expect(screen.queryByTestId('activity-scope')).toBeNull()
  })

  it("a relationship manager sees the portal's and Give Lively's changes, and is told staff changes are the admins'", () => {
    show(RM)
    expect(screen.getByTestId('open-activity').textContent).toContain('Activity (2)')
    const list = open()
    expect(list).toContain('Test: a portal change.')
    expect(list).toContain('Test: a Give Lively change.')
    expect(list).not.toContain('Test: a staff change.')
    expect(screen.getByTestId('activity-scope').textContent).toMatch(/gala admins see/)
  })
})
