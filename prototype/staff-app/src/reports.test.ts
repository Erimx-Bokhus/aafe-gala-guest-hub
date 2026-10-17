// Reports (decided Oct 14) in demo mode: the same rows as staff_report_* (scripts/test-reports.mjs checks the database),
// laid out as spreadsheet columns AAFE charts itself.
import { describe, expect, it } from 'vitest'
import { loadDB } from '@shared/data'
import { DIETARY_OPTIONS } from '@shared/guestNeeds'
import type { DB, StaffUser } from '@shared/types'
import { demoApi } from './api'
import { attendanceCsv, demoAttendance, demoNeeds, demoPayments, demoSponsors, needsCsv, ny, sponsorsCsv } from './reports'

const staff = (role: StaffUser['role']): StaffUser => ({ id: `st-${role}`, name: `Test ${role}`, email: `${role}@aafe-demo.example.org`, role })
function demo(user: StaffUser) { let data: DB = loadDB(); return { api: demoApi(user, (fn) => { data = fn(data) }, () => data), db: () => data } }

describe('reports', () => {
  const db = loadDB()
  const cur = db.meta.current_event_id
  const live = db.orders.filter((o) => o.event_id === cur && o.status !== 'cancelled')
  const guests = db.guests.filter((g) => live.some((o) => o.id === g.order_id))

  it('who came: one row per guest and walk-in, with sponsor, level and check-in', () => {
    const rows = demoAttendance(db)
    const walkIns = db.check_ins.filter((c) => c.event_id === cur && !c.guest_id).length
    expect(rows).toHaveLength(guests.length + walkIns)
    expect(rows.filter((r) => r.came)).toHaveLength(db.check_ins.filter((c) => c.event_id === cur).length)
    const csv = attendanceCsv(rows)
    expect(csv[1]).toContain('Came')
    expect(csv[1]).toContain('Sponsor or buyer')
    expect(csv[2].length).toBe(csv[1].length)
  })

  it("who came has guests' emails, so only gala admins can download it", async () => {
    await expect(demo(staff('relationship_manager')).api.reportAttendance()).rejects.toThrow('forbidden')
    const { api, db: after } = demo(staff('gala_admin'))
    expect((await api.reportAttendance()).length).toBeGreaterThan(0)
    expect(after().audit_log.at(-1)?.action).toBe('export.report_attendance')
  })

  it('sponsors and money: paid adds up and balance never goes below zero; money stays numbers', () => {
    const rows = demoSponsors(db)
    const paid = db.payments.filter((p) => db.orders.some((o) => o.id === p.order_id && o.event_id === cur)).reduce((t, p) => t + Math.max(p.original_amount - p.refunded_amount, 0), 0)
    expect(rows.reduce((t, r) => t + r.paid, 0)).toBeCloseTo(paid, 2)
    expect(rows.every((r) => r.balance === (['cancelled', 'comp'].includes(r.status) ? 0 : Math.max(r.committed - r.paid, 0)))).toBe(true)
    expect(typeof sponsorsCsv(rows)[2][9]).toBe('number')
  })

  it('a refunded, cancelled purchase shows nothing paid and nothing owed', () => {
    const pay = db.payments.find((p) => db.orders.some((o) => o.id === p.order_id && o.event_id === cur && o.status === 'paid'))!
    const refunded: DB = { ...db, orders: db.orders.map((o) => o.id === pay.order_id ? { ...o, status: 'cancelled' } : o),
      payments: db.payments.map((p) => p.order_id === pay.order_id ? { ...p, refunded_amount: p.original_amount + 11.3 } : p) }
    const row = demoSponsors(refunded).find((r) => r.status === 'cancelled' && r.committed === db.orders.find((o) => o.id === pay.order_id)!.commitment_amount)!
    expect(row.paid).toBe(0)
    expect(row.balance).toBe(0)
  })

  it('food and access: one column per choice, so a spreadsheet counts each in one click', () => {
    const csv = needsCsv(demoNeeds(db))
    const head = csv[1] as string[]
    for (const o of DIETARY_OPTIONS) expect(head).toContain(o)
    const vegan = head.indexOf('Vegan')
    const veganGuests = guests.filter((g) => (g.dietary_needs ?? '').split(/\s*,\s*/).includes('Vegan')).length
    expect(csv.slice(2).filter((r) => r[vegan] === 'Yes')).toHaveLength(veganGuests)
    expect(csv.slice(2).some((r) => r[head.indexOf('Food answered')] === 'Not answered')).toBe(true)
  })

  it('payments: every payment on this gala, in date order', () => {
    const rows = demoPayments(db)
    expect(rows).toHaveLength(db.payments.filter((p) => live.concat(db.orders.filter((o) => o.event_id === cur && o.status === 'cancelled')).some((o) => o.id === p.order_id)).length)
    expect([...rows].sort((a, b) => a.received.localeCompare(b.received)).map((r) => r.received)).toEqual(rows.map((r) => r.received))
  })

  it('payment report totals still match the underlying payment ledger', () => {
    const rows = demoPayments(db)
    const payments = db.payments.filter((p) => db.orders.some((o) => o.event_id === cur && o.id === p.order_id))
    expect(rows.reduce((sum, r) => sum + r.amount, 0)).toBeCloseTo(payments.reduce((sum, p) => sum + p.original_amount, 0), 2)
    expect(rows.reduce((sum, r) => sum + r.refunded, 0)).toBeCloseTo(payments.reduce((sum, p) => sum + p.refunded_amount, 0), 2)
    expect(rows.reduce((sum, r) => sum + r.net, 0)).toBeCloseTo(payments.reduce((sum, p) => sum + p.net_amount, 0), 2)
  })

  it('times read as New York time, 24-hour, so they sort, like the database', () => {
    expect(ny('2027-05-20T23:04:00Z')).toBe('2027-05-20 19:04')
    expect(ny('2027-05-21T04:30:00Z')).toBe('2027-05-21 00:30')
  })
})
