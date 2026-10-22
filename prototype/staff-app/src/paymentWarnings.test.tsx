// @vitest-environment jsdom
// Cornell's review of Oct 21 (#222, #224): the payment form took the same check twice, an extra zero and a date in 2031
// without a word. It now warns before the first two (the button says Record anyway) and refuses the date, as the server does.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { loadDB } from '@shared/data'
import type { DB } from '@shared/types'
import type { StaffApi } from './api'
import { RecordPaymentModal } from './components'
import { nyDate } from './date'
import { StaffCtx } from './store'

/** Acme's $15,000 pledge with check #1042 for $5,000 already recorded: $10,000 due. */
function acmeWithCheck(): DB {
  const db = loadDB()
  const any = db.payments[0]
  db.payments.push({ ...any, id: 'pay-test-1042', order_id: 'ord-acme', method: 'check', processor: 'none', givelively_transaction_id: null,
    check_number: '1042', original_amount: 5000, covered_fee_amount: 0, gross_amount: 5000, transaction_fee_amount: 0, refunded_amount: 0,
    net_amount: 5000, received_at: '2026-10-20T16:00:00.000Z' })
  return db
}
function open(db = acmeWithCheck()) {
  const api = { live: true, recordPayment: vi.fn(async () => {}) } as unknown as StaffApi
  render(<StaffCtx.Provider value={{ db, api, user: { id: 'st-rm', name: 'Test Manager', email: 'rm@aafe-demo.example.org', role: 'relationship_manager' },
    toast: () => {}, act: async (p) => { await p; return true }, demo: null }}><RecordPaymentModal open onClose={() => {}} orderId="ord-acme" /></StaffCtx.Provider>)
  return api
}
const type = (id: string, value: string) => fireEvent.change(document.getElementById(id)!, { target: { value } })
const button = () => screen.getByTestId('save-payment')
const warning = () => screen.queryByTestId('payment-warning')?.textContent ?? null

afterEach(cleanup)

describe('the payment form warns before a likely mistake (#222)', () => {
  it('the same check again: warns, says Record anyway, and records when chosen', async () => {
    const api = open()
    type('ra', '5000'); type('rc', '#01042')
    expect(warning()).toContain('Check #1042 is already recorded on this order: $5,000 on October 20, 2026.')
    expect(button().textContent).toBe('Record anyway')
    fireEvent.click(button())
    await vi.waitFor(() => expect(api.recordPayment).toHaveBeenCalledWith('ord-acme',
      { method: 'check', amount: 5000, received: nyDate(new Date()), check_number: '#01042' }))
  })

  it('an extra zero: warns how much more than the balance due it is', () => {
    open()
    type('ra', '100000'); type('rc', '2001')
    expect(warning()).toContain('This is $90,000 more than the balance due ($10,000).')
    expect(button().textContent).toBe('Record anyway')
  })

  it('a new check within the balance: no warning', () => {
    open()
    type('ra', '2500'); type('rc', '2002')
    expect(warning()).toBeNull()
    expect(button().textContent).toBe('Record payment')
  })
})

describe('the payment date (#224)', () => {
  it('is required, and at most 3 days ahead, as on the server', () => {
    open()
    type('ra', '2500'); type('rc', '2003')
    type('rd', '')
    expect(screen.getByText('Enter the day the payment arrived.')).toBeTruthy()
    expect(button().hasAttribute('disabled')).toBe(true)
    type('rd', '2031-01-01')
    expect(screen.getByText('January 1, 2031 is more than 3 days ahead. Enter the day the payment arrived.')).toBeTruthy()
    expect(button().hasAttribute('disabled')).toBe(true)
    const ahead = new Date(`${nyDate(new Date())}T12:00:00Z`)
    ahead.setUTCDate(ahead.getUTCDate() + 3)
    type('rd', ahead.toISOString().slice(0, 10))
    expect(screen.queryByText(/days ahead/)).toBeNull()
    expect(button().hasAttribute('disabled')).toBe(false)
  })
})
