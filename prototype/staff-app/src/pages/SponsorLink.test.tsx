// @vitest-environment jsdom
// A sponsor's page and its portal link (AAFE's Oct 20 walk-through, triage B2). Live, the order keeps only the link's
// fingerprint (hard rule 6), so the page used to print a URL built from it that never opens. It now shows the link in
// the demo only, where it is the real one, and live it says how to send a fresh one.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { loadDB } from '@shared/data'
import type { DB, StaffUser } from '@shared/types'
import { demoApi } from '../api'
import { StaffCtx } from '../store'
import { SponsorDetail } from './Sponsors'

afterEach(cleanup)
const ADMIN: StaffUser = { id: 'st-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' }

function show(live: boolean) {
  let db: DB = loadDB()
  const order = db.orders.find((o) => o.portal_token && o.event_id === db.meta.current_event_id)
  if (!order) throw new Error('the demo data has no order with a portal link')
  const api = { ...demoApi(ADMIN, (fn) => { db = fn(db) }, () => db), live }
  render(<StaffCtx.Provider value={{ db, api, user: ADMIN, toast: () => {}, act: async (p) => { await p; return true }, demo: null }}><SponsorDetail id={order.id} /></StaffCtx.Provider>)
  return order
}

describe("a sponsor's portal link", () => {
  it('live: no link built from the stored fingerprint, a note, and Resend portal link', () => {
    const order = show(true)
    expect(document.body.textContent).not.toContain(`#/s/${order.portal_token}`)
    expect(screen.getByTestId('private-link-note').textContent).toMatch(/Resend portal link sends a fresh one/)
    expect(screen.getByRole('button', { name: /Resend portal link/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Copy link/ })).toBeNull()
  })

  it('demo: the real link, with Copy link', () => {
    const order = show(false)
    expect(document.body.textContent).toContain(`#/s/${order.portal_token}`)
    expect(screen.getByRole('button', { name: /Copy link/ })).toBeTruthy()
    expect(screen.queryByTestId('private-link-note')).toBeNull()
  })
})
