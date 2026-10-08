import { describe, expect, it } from 'vitest'
import { ExportFormatError, readExport } from '../src/index.ts'
import { exportCsv, HEADERS } from './helpers.ts'

describe('readExport', () => {
  it('reads one purchase per row, in UTC, with amounts as numbers', async () => {
    const { rows, rejected, dateRange } = await readExport(exportCsv({ Guests: 'me', 'Company/Organization Name': 'Harbor Health' }))
    expect(rejected).toEqual([])
    expect(rows).toHaveLength(1)
    const r = rows[0]!
    expect(r).toMatchObject({
      rowNumber: 2, purchasedAt: '2027-02-05T22:14:46Z', buyer: { first: 'Grace', last: 'Kim', email: 'grace.kim@example.org' },
      tierName: 'Ticket', quantity: 1, seats: 1, gross: 1000, refunded: 0, company: 'Harbor Health',
      pageName: "AAFE's 52nd Annual Gala",
    })
    expect(r.purchaseKey).toMatch(/^[0-9a-f]{64}$/)
    expect(dateRange).toEqual({ earliest: '2027-02-05T22:14:46Z', latest: '2027-02-05T22:14:46Z' })
  })

  it('finds columns by name, whatever their order and spacing', async () => {
    const csv = 'email , AMOUNT SPENT,date/time of purchase,tier purchased,Last Name,first name\n' +
      'sam.lee@example.org,$500.00,2027-03-01 10:00:00 AM EST,Ticket,Lee,Sam\n'
    const { rows } = await readExport(csv)
    expect(rows[0]).toMatchObject({ buyer: { first: 'Sam', last: 'Lee', email: 'sam.lee@example.org' }, gross: 500 })
  })

  it('stops on a missing required column', async () => {
    await expect(readExport('First Name,Last Name,Email\nA,B,c@example.org\n')).rejects.toThrow(ExportFormatError)
    await expect(readExport('First Name,Last Name,Email\nA,B,c@example.org\n')).rejects.toThrow(/Tier Purchased, Amount Spent, Date\/Time of Purchase/)
  })

  it('strips a byte-order mark', async () => {
    const { rows } = await readExport('﻿' + exportCsv({}))
    expect(rows).toHaveLength(1)
  })

  it('case 4: rejects a second row with the same purchase key', async () => {
    const { rows, rejected } = await readExport(exportCsv({}, {}))
    expect(rows).toHaveLength(1)
    expect(rejected).toEqual([{ rowNumber: 3, reason: 'duplicate of row 2 (same buyer email and purchase time)' }])
  })

  it('case 5: ignores fully blank rows without reporting them', async () => {
    const csv = exportCsv({}) + '\n' + ','.repeat(HEADERS.length - 1) + '\n\n'
    const { rows, rejected } = await readExport(csv)
    expect(rows).toHaveLength(1)
    expect(rejected).toEqual([])
  })

  it('case 23: rejects a row missing a required field and keeps the rest', async () => {
    const { rows, rejected } = await readExport(exportCsv({ Email: '' }, { Email: 'sam.lee@example.org' }))
    expect(rows).toHaveLength(1)
    expect(rejected).toEqual([{ rowNumber: 2, reason: 'missing Email' }])
  })

  it('rejects unreadable amounts, dates, and emails with a reason', async () => {
    const { rejected } = await readExport(exportCsv(
      { 'Amount Spent': 'lots' },
      { Email: 'b@example.org', 'Date/Time of Purchase': '2027-02-05 05:14:46 PM' },
      { Email: 'not-an-email' },
    ))
    expect(rejected).toEqual([
      { rowNumber: 2, reason: 'unreadable amount "lots"' },
      { rowNumber: 3, reason: 'date has no time zone "2027-02-05 05:14:46 PM"' },
      { rowNumber: 4, reason: 'unreadable email' },
    ])
  })

  it('case 25: never keeps the phone number', async () => {
    const { rows } = await readExport(exportCsv({}))
    expect(JSON.stringify(rows)).not.toContain('555-0101')
    expect(Object.keys(rows[0]!.raw)).not.toContain('Phone Number')
    expect(rows[0]!.raw['City']).toBe('')
  })

  it('never keeps the guest list a buyer types (decided Oct 7), even across lines in one quoted cell', async () => {
    const { rows } = await readExport(exportCsv({ Guests: 'Jane Doe jane@example.org\nSam Lee sam@example.org' }, { Email: 'b@example.org' }))
    expect(JSON.stringify(rows)).not.toMatch(/Jane Doe|jane@example\.org|Sam Lee/)
    expect(Object.keys(rows[0]!.raw).some((h) => h.startsWith('Please list'))).toBe(false)
    expect(rows[1]!.rowNumber).toBe(3)
  })
})
