// @vitest-environment jsdom
// The demo data switch: the chosen set loads; an unknown or blocked choice falls back to the small set.
import { afterEach, expect, test, vi } from 'vitest'
import { demoSet, loadDB, orderMoney } from './data'

afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

test('loads the set saved in this browser', () => {
  localStorage.setItem('aafe-demo-data', 'full-fixed')
  expect(demoSet()).toBe('full-fixed')
  const db = loadDB()
  expect(db.guests).toHaveLength(553)
  expect(db.email_log.filter((e) => e.status !== 'queued').every((e) => e.approved_at)).toBe(true)
})

test('an unknown choice falls back to the small set', () => {
  localStorage.setItem('aafe-demo-data', 'nonsense')
  expect(demoSet()).toBe('small')
  expect(loadDB().guests).toHaveLength(48)
})

test('blocked storage falls back to the small set', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  expect(demoSet()).toBe('small')
})

function dbWithPayment({ status = 'paid', commitment = 30_000, original = 25_000, refunded = 5_000 }: {
  status?: 'pledged' | 'partially_paid' | 'paid' | 'comp' | 'invoice_sent' | 'cancelled'
  commitment?: number; original?: number; refunded?: number
} = {}) {
  const db = loadDB()
  const orderId = 'ord-acme'
  db.orders = db.orders.map((o) => o.id === orderId ? { ...o, status, commitment_amount: commitment } : o)
  const template = db.payments.find((p) => p.order_id === orderId)!
  db.payments = [...db.payments.filter((p) => p.order_id !== orderId), {
    ...template, id: 'test-refund', order_id: orderId, original_amount: original, gross_amount: original,
    refunded_amount: refunded, net_amount: Math.max(original - refunded, 0),
  }]
  return { db, orderId }
}

test('order balance applies partial refunds to paid and balance', () => {
  const { db, orderId } = dbWithPayment()
  expect(orderMoney(db, orderId)).toMatchObject({ paid: 20_000, balance: 10_000 })
})

test('a fully refunded cancelled order has no balance', () => {
  const { db, orderId } = dbWithPayment({ status: 'cancelled', commitment: 30_000, original: 5_000, refunded: 5_000 })
  expect(orderMoney(db, orderId)).toMatchObject({ paid: 0, balance: 0 })
})

test('comp orders have no balance', () => {
  const { db, orderId } = dbWithPayment({ status: 'comp', commitment: 10_000, original: 0, refunded: 0 })
  expect(orderMoney(db, orderId)).toMatchObject({ paid: 0, balance: 0 })
})

test('paid is clamped to zero when refunds exceed the original payment', () => {
  const { db, orderId } = dbWithPayment({ commitment: 500, original: 500, refunded: 800 })
  expect(orderMoney(db, orderId).paid).toBe(0)
})
