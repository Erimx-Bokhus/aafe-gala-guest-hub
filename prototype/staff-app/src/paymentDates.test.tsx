// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { loadDB } from '@shared/data'
import type { StaffApi } from './api'
import { RecordPaymentModal } from './components'
import Payments from './pages/Payments'
import { StaffCtx } from './store'

const csvDownload = vi.hoisted(() => vi.fn())
vi.mock('@shared/ui', async (importOriginal) => ({
  ...await importOriginal<typeof import('@shared/ui')>(),
  downloadCsv: csvDownload,
}))

const api = { live: false, recordPayment: vi.fn(async () => {}) } as unknown as StaffApi
function renderWith(ui: React.ReactNode) {
  const db = loadDB()
  return render(<StaffCtx.Provider value={{ db, api, user: { id: 'staff-test', name: 'Test Staff', email: 'test@aafe-demo.example.org', role: 'gala_admin' }, toast: () => {}, act: async () => true, demo: null }}>{ui}</StaffCtx.Provider>)
}

afterEach(() => { cleanup(); vi.useRealTimers(); csvDownload.mockReset() })

describe('New York payment dates', () => {
  it('defaults to the New York calendar date at 9 PM, not the next UTC date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-05-27T01:00:00.000Z')) // May 26, 9 PM in New York
    renderWith(<RecordPaymentModal open onClose={() => {}} orderId="ord-acme" />)
    expect((document.getElementById('rd') as HTMLInputElement).value).toBe('2027-05-26')
  })

  it('defaults to the new New York date just after midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-05-27T04:01:00.000Z')) // May 27, 12:01 AM in New York
    renderWith(<RecordPaymentModal open onClose={() => {}} orderId="ord-acme" />)
    expect((document.getElementById('rd') as HTMLInputElement).value).toBe('2027-05-27')
  })

  it('exports payment dates using the New York date, including either side of midnight', () => {
    const db = loadDB()
    const currentOrders = new Set(db.orders.filter((o) => o.event_id === db.meta.current_event_id).map((o) => o.id))
    const original = db.payments.find((p) => currentOrders.has(p.order_id))!
    db.payments = [
      { ...original, id: 'payment-9pm-ny', received_at: '2027-05-27T01:00:00.000Z' },
      { ...original, id: 'payment-after-midnight-ny', received_at: '2027-05-27T04:01:00.000Z' },
      ...db.payments.filter((p) => p.id !== original.id),
    ]
    render(<StaffCtx.Provider value={{ db, api, user: { id: 'staff-test', name: 'Test Staff', email: 'test@aafe-demo.example.org', role: 'gala_admin' }, toast: () => {}, act: async () => true, demo: null }}><Payments /></StaffCtx.Provider>)

    fireEvent.click(screen.getByText('Export'))
    const rows = csvDownload.mock.calls[0][1] as (string | number | null | undefined)[][]
    const paymentDates = rows.slice(2, -1).map(([date]) => date)
    expect(paymentDates).toContain('2027-05-26')
    expect(paymentDates).toContain('2027-05-27')
  })
})
