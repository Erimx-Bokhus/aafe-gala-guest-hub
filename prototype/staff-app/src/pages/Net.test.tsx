// @vitest-environment jsdom
// #187: AAFE's ticket export has no processor-fee column, so an uploaded purchase's fee and net are unknown (null). Net to
// AAFE counted them as $0 and read about $0 after a ticket upload. Both pages now count such a payment before its fee and
// say so. The expected totals come from the seed's own nets and fees, not from the rule being tested.
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { loadDB } from '@shared/data'
import { money } from '@shared/ui'
import type { DB, Payment } from '@shared/types'
import type { StaffApi } from '../api'
import { StaffCtx } from '../store'
import Dashboard, { curPayments } from './Dashboard'
import Payments from './Payments'

afterEach(cleanup)

const show = (db: DB, page: ReactElement) => render(<StaffCtx.Provider value={{ db, api: { live: false } as unknown as StaffApi,
  user: { id: 'st-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' }, toast: () => {}, act: async () => true, demo: null }}>{page}</StaffCtx.Provider>)
const kpi = (label: string) => screen.getByText(label).nextElementSibling?.textContent
// Net as the seed records it, plus the fees about to be blanked: what AAFE received before those fees.
const before = (pays: Payment[], blank: Set<string>) =>
  pays.reduce((s, p) => s + (p.net_amount ?? NaN) + (blank.has(p.id) ? p.transaction_fee_amount ?? NaN : 0), 0)

/** The demo gala with its Give Lively payments as a ticket upload leaves them: fee and net unknown. */
function uploaded() {
  const db = loadDB()
  const current = new Set(db.orders.filter((o) => o.event_id === db.meta.current_event_id).map((o) => o.id))
  const ofGala = db.payments.filter((p) => current.has(p.order_id))
  const blank = new Set(ofGala.filter((p) => p.processor === 'stripe').map((p) => p.id))
  const dashboard = before(curPayments(db), blank), payments = before(ofGala, blank)
  db.payments = db.payments.map((p) => (blank.has(p.id) ? { ...p, transaction_fee_amount: null, net_amount: null } : p))
  return { db, blank, dashboard, payments }
}

describe('Net to AAFE when Give Lively fees are unknown (#187)', () => {
  it('the dashboard counts those payments before their fee, not as $0, and says how many', () => {
    const { db, blank, dashboard } = uploaded()
    expect(blank.size).toBeGreaterThan(0)
    show(db, <Dashboard />)
    expect(kpi('Net to AAFE')).toBe(money(dashboard, true))
    expect(screen.getByText(/^before Give Lively fees on \d+ payments?$/)).toBeTruthy()
  })

  it('the payments page and its table total count them the same way', () => {
    const { db, blank, payments } = uploaded()
    show(db, <Payments />)
    expect(kpi('Net to AAFE')).toBe(money(payments, true))
    expect(screen.getByTestId('net-total').textContent).toBe(`${money(payments, true)}before Give Lively fees on ${blank.size} payment${blank.size === 1 ? '' : 's'}`)
  })

  it('with every fee known, nothing is labeled', () => {
    show(loadDB(), <Dashboard />)
    expect(screen.queryByText(/before Give Lively fees/)).toBeNull()
  })
})
