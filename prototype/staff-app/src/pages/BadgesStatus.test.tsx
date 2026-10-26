// @vitest-environment jsdom
// Badges after AAFE's Oct 20 walk-through: one badge status that staff change in bulk (item 13, D3), the sponsorship level
// in larger type (item 25), and the gala's own name at the top (item 27). Runs on the demo store, which takes the same
// one-step-at-a-time seat transitions as the server (submitted -> reviewed -> badge ready).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { loadDB, tierOf } from '@shared/data'
import type { DB, StaffUser } from '@shared/types'
import { demoApi } from '../api'
import { StaffCtx } from '../store'
import { curOrders } from './Dashboard'
import Badges from './Badges'
import GuestList from './GuestList'

afterEach(cleanup)
const ADMIN: StaffUser = { id: 'st-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' }

/** Three guests whose badges need review: one name not yet reviewed, one reviewed, one already checked in. */
function seed() {
  let db: DB = loadDB()
  const current = new Set(curOrders(db).map((o) => o.id))
  const [fresh, checked, arrived] = db.guests.filter((g) => current.has(g.order_id) && db.seats.some((s) => s.guest_id === g.id))
  const seatTo: Record<string, string> = { [fresh.id]: 'submitted', [checked.id]: 'reviewed', [arrived.id]: 'checked_in' }
  db = { ...db,
    guests: db.guests.map((g) => (seatTo[g.id] ? { ...g, badge_status: 'needs_review' as const } : g.badge_status === 'needs_review' ? { ...g, badge_status: 'ready' as const } : g)),
    seats: db.seats.map((s) => (s.guest_id && seatTo[s.guest_id] ? { ...s, status: seatTo[s.guest_id] as DB['seats'][number]['status'] } : s)) }
  return { db, fresh, checked, arrived }
}

function show(page: 'badges' | 'guests', start: DB) {
  let db = start
  const api = demoApi(ADMIN, (fn) => { db = fn(db) }, () => db)
  render(<StaffCtx.Provider value={{ db, api, user: ADMIN, toast: () => {}, act: async (p) => { await p; return true }, demo: null }}>{page === 'badges' ? <Badges /> : <GuestList />}</StaffCtx.Provider>)
  return { now: () => db }
}

describe('Badges: one status, changed in bulk (item 13)', () => {
  it('marks every needs-review badge ready, reviewing the name first where needed, and leaves a checked-in guest alone', async () => {
    const { db, fresh, checked, arrived } = seed()
    const { now } = show('badges', db)
    fireEvent.click(screen.getByRole('tab', { name: 'Needs review (3)' }))
    const button = screen.getByTestId('mark-ready')
    expect(button.textContent).toBe('Mark 2 ready')
    fireEvent.click(button)
    await vi.waitFor(() => expect(now().guests.find((g) => g.id === checked.id)?.badge_status).toBe('ready'))
    const seat = (id: string) => now().seats.find((s) => s.guest_id === id)?.status
    expect(now().guests.find((g) => g.id === fresh.id)?.badge_status).toBe('ready')
    expect([seat(fresh.id), seat(checked.id)]).toEqual(['badge_ready', 'badge_ready'])
    // The server takes one step at a time, so the unreviewed name was reviewed first, on the record.
    const freshSeat = now().seats.find((s) => s.guest_id === fresh.id)!.id
    expect(now().audit_log.filter((a) => a.entity_id === freshSeat).map((a) => a.action)).toEqual(expect.arrayContaining(['seat.reviewed', 'badge.ready']))
    expect(now().guests.find((g) => g.id === arrived.id)?.badge_status).toBe('needs_review')
    expect(seat(arrived.id)).toBe('checked_in')
  })

  it("doesn't offer a printer file for badges that need review", () => {
    show('badges', seed().db)
    fireEvent.click(screen.getByRole('tab', { name: /^Needs review/ }))
    expect((screen.getByTestId('export-badges') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('Badges: what prints (items 25 and 27)', () => {
  it("heads every badge with the gala's own name", () => {
    const { db } = seed()
    show('badges', db)
    const name = db.gala_events.find((e) => e.id === db.meta.current_event_id)!.name
    expect(within(screen.getByTestId('badge-sheet')).getAllByText(name).length).toBeGreaterThan(0)
    expect(screen.queryByText(/^Annual Gala \d{4}$/)).toBeNull()
  })

  it("prints a sponsor's guest's sponsorship level, and no level for anyone else", () => {
    const { db } = seed()
    show('badges', db)
    fireEvent.click(screen.getByRole('tab', { name: /^All/ }))
    const current = new Set(curOrders(db).map((o) => o.id))
    const levels = db.guests.filter((g) => current.has(g.order_id) && g.guest_type === 'sponsor_guest')
      .map((g) => tierOf(db, db.orders.find((o) => o.id === g.order_id)!.tier_id)).filter((t) => t.tier_category === 'sponsorship')
    expect(levels.length).toBeGreaterThan(0)
    expect(screen.getAllByTestId('badge-level').map((e) => e.textContent).sort()).toEqual(levels.map((t) => t.name).sort())
  })
})

describe('the guest list after D3', () => {
  it('has no "Badge ready" status: a badge-ready seat reads Reviewed, and the badge column says Ready', () => {
    const { db } = seed()
    show('guests', db)
    const filter = screen.getByLabelText('Filter by status') as HTMLSelectElement
    expect([...filter.options].map((o) => o.textContent)).toEqual(['All statuses', 'Needs review', 'Reviewed', 'Checked in'])
    const current = new Set(curOrders(db).map((o) => o.id))
    const ready = db.seats.filter((s) => current.has(s.order_id) && s.guest_id && s.status === 'badge_ready').length
    const reviewed = db.seats.filter((s) => current.has(s.order_id) && s.guest_id && s.status === 'reviewed').length
    fireEvent.change(filter, { target: { value: 'reviewed' } })
    expect(screen.getByTestId('guest-count').textContent).toBe(`${ready + reviewed} guest${ready + reviewed === 1 ? '' : 's'}`)
    expect(screen.queryByText('Badge ready')).toBeNull()
  })
})
