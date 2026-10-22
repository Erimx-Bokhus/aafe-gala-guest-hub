// @vitest-environment jsdom
// Gate 1 (#146): the money rules in the staff app, for every order of every demo set, the same rules the database is
// held to in scripts/test-money.mjs. orderMoney (shared/src/data.ts) is what every page shows; the demo reports and
// recordOfflinePayment (store.ts) must count the same way.
import { afterEach, describe, expect, it } from 'vitest'
import { loadDB, orderMoney } from '@shared/data'
import type { DB, StaffUser } from '@shared/types'
import { demoPayments, demoSponsors } from './reports'
import { recordOfflinePayment, voidPayment } from './store'

const CENT = 0.005
const SETS = ['small', 'full-fixed', 'full-as-sent'] as const
const load = (set: string): DB => { localStorage.setItem('aafe-demo-data', set); return loadDB() }
afterEach(() => { localStorage.clear() })

describe.each(SETS)('the money rules on the %s demo set', (set) => {
  it('every order: paid never negative, nothing owed on cancelled or comp orders, and the status agrees with the money', () => {
    const db = load(set), wrong: string[] = []
    for (const o of db.orders) {
      const m = orderMoney(db, o.id)
      const paid = m.pays.reduce((s, p) => s + Math.max(p.original_amount - p.refunded_amount, 0), 0)
      const owed = o.status === 'cancelled' || o.status === 'comp' ? 0 : Math.max(o.commitment_amount - paid, 0)
      if (m.paid < 0 || Math.abs(m.paid - paid) > CENT || Math.abs(m.balance - owed) > CENT) wrong.push(`${o.id} money`)
      if (o.status === 'paid' && m.paid + CENT < o.commitment_amount) wrong.push(`${o.id} paid but owes`)
      if (o.status === 'partially_paid' && (m.pays.length === 0 || m.paid + CENT >= o.commitment_amount)) wrong.push(`${o.id} part paid`)
      if (o.status === 'pledged' && m.paid > CENT) wrong.push(`${o.id} pledged with money in`)
    }
    expect(wrong).toEqual([])
  })

  it('every payment: gross = amount + covered fee, net = gross - fee - refunds (unknown while the fee is), a refund never above the payment', () => {
    const db = load(set)
    const wrong = db.payments.filter((p) => [p.original_amount, p.covered_fee_amount, p.gross_amount, p.transaction_fee_amount ?? 0, p.refunded_amount].some((v) => v < 0)
      || Math.abs(p.original_amount + p.covered_fee_amount - p.gross_amount) > CENT
      || (p.transaction_fee_amount == null ? p.net_amount != null
        : p.net_amount == null || Math.abs(p.gross_amount - p.transaction_fee_amount - p.refunded_amount - p.net_amount) > CENT)
      || p.refunded_amount > p.gross_amount + CENT).map((p) => p.id)
    expect(wrong).toEqual([])
  })

  it('the sponsors report counts paid and balance as orderMoney does, and each sponsor\'s paid equals its payment rows', () => {
    const db = load(set), sponsors = demoSponsors(db), payments = demoPayments(db)
    const fromOrders = new Map<string, number>(), fromReport = new Map<string, number>(), fromPayments = new Map<string, number>()
    const cur = db.orders.filter((o) => o.event_id === db.meta.current_event_id && db.sponsorship_tiers.find((t) => t.id === o.tier_id)?.tier_category !== 'complimentary')
    for (const o of cur) {
      const name = db.sponsors.find((s) => s.id === o.sponsor_id)?.organization_name ?? ''
      fromOrders.set(name, (fromOrders.get(name) ?? 0) + orderMoney(db, o.id).paid)
    }
    for (const r of sponsors) fromReport.set(r.sponsor, (fromReport.get(r.sponsor) ?? 0) + r.paid)
    for (const p of payments) fromPayments.set(p.sponsor, (fromPayments.get(p.sponsor) ?? 0) + Math.max(p.amount - p.refunded, 0))
    expect(sponsors.length).toBe(cur.length)
    expect([...fromOrders].filter(([s, v]) => Math.abs((fromReport.get(s) ?? 0) - v) > CENT)).toEqual([])
    expect([...fromReport].filter(([s, v]) => Math.abs((fromPayments.get(s) ?? 0) - v) > CENT)).toEqual([])
    expect(sponsors.filter((r) => r.balance < 0 || ((r.status === 'cancelled' || r.status === 'comp') && r.balance !== 0))).toEqual([])
  })
})

describe('recording a check in demo mode follows staff_record_payment', () => {
  const ADMIN: StaffUser = { id: 'st-test-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' }
  const pay = (db: DB, orderId: string, amount: number) => recordOfflinePayment(db, ADMIN, orderId, { method: 'check', amount, received: '2027-04-01' })
  const status = (db: DB, id: string) => db.orders.find((o) => o.id === id)?.status

  it('a cancelled order stays cancelled and a comp order stays comp (a cancelled one came back as paid before)', () => {
    const db = load('full-fixed')
    const any = db.orders.find((o) => o.status !== 'cancelled' && o.status !== 'comp')
    const comp = db.orders.find((o) => o.status === 'comp')
    expect(any && comp).toBeTruthy()
    if (!any || !comp) return
    const cancelled: DB = { ...db, orders: db.orders.map((o) => (o.id === any.id ? { ...o, status: 'cancelled' as const } : o)) }
    expect(status(pay(cancelled, any.id, 500), any.id)).toBe('cancelled')
    expect(status(pay(db, comp.id, 50), comp.id)).toBe('comp')
  })

  it('a refunded payment counts only what was kept (#170): not paid while the refund leaves money owed', () => {
    const db = load('full-fixed')
    const pledge = db.orders.find((o) => o.status === 'pledged' && o.commitment_amount >= 2000 && orderMoney(db, o.id).pays.length === 0)
    expect(pledge).toBeTruthy()
    if (!pledge) return
    const c = pledge.commitment_amount
    // Half the commitment came in and 60% of that went back: 20% of it counts.
    const refundedPay = { ...db.payments[0], id: 'pay-test-refunded', order_id: pledge.id, method: 'check' as const, original_amount: c / 2, covered_fee_amount: 0,
      gross_amount: c / 2, transaction_fee_amount: 0, refunded_amount: c * 0.3, net_amount: c * 0.2 }
    const withRefund: DB = { ...db, payments: [...db.payments, refundedPay], orders: db.orders.map((o) => (o.id === pledge.id ? { ...o, status: 'partially_paid' as const } : o)) }
    const after = pay(withRefund, pledge.id, c / 2)   // the other half: 70% counts, still owed
    expect(status(after, pledge.id)).toBe('partially_paid')
    expect(orderMoney(after, pledge.id).balance).toBeCloseTo(c * 0.3)
  })
})

describe('voiding a payment in demo mode follows staff_void_payment (#223)', () => {
  const ADMIN: StaffUser = { id: 'st-test-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' }
  const pay = (db: DB, orderId: string, amount: number) => recordOfflinePayment(db, ADMIN, orderId, { method: 'check', amount, received: '2027-04-01', check_number: '555' })
  const lastPay = (db: DB, orderId: string) => db.payments.filter((p) => p.order_id === orderId).at(-1)?.id ?? ''

  it('the only payment voided: back to pledged, nothing paid, and the log keeps the reason', () => {
    const db = load('full-fixed')
    const o = db.orders.find((x) => x.status === 'pledged' && !db.payments.some((p) => p.order_id === x.id))
    expect(o).toBeTruthy()
    if (!o) return
    const paid = pay(db, o.id, o.commitment_amount)
    expect(paid.orders.find((x) => x.id === o.id)?.status).toBe('paid')
    const voided = voidPayment(paid, ADMIN, lastPay(paid, o.id), 'Entered on the wrong order')
    expect(voided.orders.find((x) => x.id === o.id)?.status).toBe('pledged')
    expect(orderMoney(voided, o.id).paid).toBe(0)
    const log = voided.audit_log.filter((a) => a.order_id === o.id && a.action.startsWith('payment.'))
    expect(log.some((a) => a.action === 'payment.voided' && !a.guest_visible && a.summary.includes('Entered on the wrong order'))).toBe(true)
    expect(log.some((a) => a.action === 'payment.corrected' && a.guest_visible && !a.summary.includes('wrong order'))).toBe(true)
  })

  it('the same check entered twice: voiding the copy keeps the order paid once', () => {
    const db = load('full-fixed')
    const o = db.orders.find((x) => x.status === 'pledged' && !db.payments.some((p) => p.order_id === x.id))
    if (!o) throw new Error('no pledged order without payments in the full-fixed set')
    const twice = pay(pay(db, o.id, o.commitment_amount), o.id, o.commitment_amount)
    expect(orderMoney(twice, o.id).paid).toBe(2 * o.commitment_amount)
    const once = voidPayment(twice, ADMIN, lastPay(twice, o.id), 'Same check entered twice')
    expect(orderMoney(once, o.id).paid).toBe(o.commitment_amount)
    expect(once.orders.find((x) => x.id === o.id)?.status).toBe('paid')
  })

  it('refuses a Give Lively payment and a missing reason', () => {
    const db = load('full-fixed')
    const gl = db.payments.find((p) => p.processor === 'stripe')
    if (!gl) throw new Error('no Give Lively payment in the full-fixed set')
    expect(() => voidPayment(db, ADMIN, gl.id, 'x')).toThrow(/Give Lively/)
    const staffPay = db.payments.find((p) => p.processor === 'none')
    if (staffPay) expect(() => voidPayment(db, ADMIN, staffPay.id, '  ')).toThrow(/invalid_input/)
  })
})
