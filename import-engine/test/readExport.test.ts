import { readFileSync } from 'node:fs'
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
      tierName: 'Ticket', quantity: 1, seats: 1, gross: 1000, refunded: 0, company: 'Harbor Health', guestText: 'me',
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

  it('stops on a quote that never closes, instead of losing every row after it (Oct 12 audit)', async () => {
    const csv = 'Email,Amount Spent,Date/Time of Purchase,Tier Purchased,Last Name,First Name\n' +
      'sam.lee@example.org,$500.00,2027-03-01 10:00:00 AM EST,Ticket,Lee,Sam\n' +
      'ana.ruiz@example.org,$500.00,2027-03-02 10:00:00 AM EST,"Ticket,Ruiz,Ana\n' +
      'bo.chen@example.org,$500.00,2027-03-03 10:00:00 AM EST,Ticket,Chen,Bo\n'
    await expect(readExport(csv)).rejects.toThrow(ExportFormatError)
    await expect(readExport(csv)).rejects.toThrow(/row 3 has a quote \(\"\) that never closes/)
  })

  // Gate 3: each refusal says what to do, and ends without a period (the staff app adds one: "This file can't be imported: ….").
  it('says what to do about an empty file, missing columns or an unclosed quote', async () => {
    const reason = (csv: string) => readExport(csv).then(() => '', (e: unknown) => (e instanceof ExportFormatError ? e.message : 'not a format error'))
    expect(await reason('')).toBe('the file is empty. Download the attendee export from Give Lively again')
    expect(await reason('First Name,Last Name,Email\nA,B,c@example.org\n'))
      .toBe("missing columns: Tier Purchased, Amount Spent, Date/Time of Purchase. Check that this is Give Lively's attendee export")
    const unclosed = await reason('Email,Amount Spent,Date/Time of Purchase,Tier Purchased,Last Name,First Name\n' +
      'ana.ruiz@example.org,$500.00,2027-03-02 10:00:00 AM EST,"Ticket,Ruiz,Ana\n')
    expect(unclosed).toMatch(/can't be read\. Export the file from Give Lively again and upload it without opening it$/)
  })

  it('rejects a row the CSV reader stumbled on (a stray quote), and keeps the rest (Oct 12 audit)', async () => {
    const [head, a, b, c] = exportCsv({}, { Email: 'sam.lee@example.org' }, { Email: 'ana.ruiz@example.org' }).split('\n')
    const { rows, rejected } = await readExport([head, a, b!.replace('Ticket', '"Ticket'), c].join('\n'))
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 4])
    expect(rejected).toMatchObject([{ rowNumber: 3, reason: expect.stringMatching(/^couldn't read this row/) }])
  })

  it('rejects a row with more or fewer columns than the header, and keeps the rest (Oct 12 audit)', async () => {
    const [head, a, b, c] = exportCsv({}, { Email: 'sam.lee@example.org' }, { Email: 'ana.ruiz@example.org' }).split('\n')
    const shifted = b!.replace('Ticket', 'Ticket,Extra')          // a comma outside quotes: every value after it moves right
    const short = c!.split(',').slice(0, 10).join(',')            // a row cut off by a line break
    const { rows, rejected } = await readExport([head, a, shifted, short].join('\n'))
    expect(rows.map((r) => r.rowNumber)).toEqual([2])
    expect(rejected.map((r) => r.rowNumber)).toEqual([3, 4])
    expect(rejected[0]!.reason).toMatch(new RegExp(`has ${HEADERS.length + 1} columns but the header has ${HEADERS.length}`))
    expect(rejected[1]!.reason).toMatch(new RegExp(`has \\d+ columns but the header has ${HEADERS.length}`))
  })

  it('reads a file that mixes Windows and plain line breaks without running rows together', async () => {
    const [head, a, b] = exportCsv({}, { Email: 'sam.lee@example.org' }).split(/\r?\n/)
    const { rows, rejected } = await readExport(`${head}\r\n${a}\n${b}\r\n`)
    expect(rejected).toEqual([])
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 3])
  })

  it('case 25: never keeps the phone number', async () => {
    const { rows } = await readExport(exportCsv({}))
    expect(JSON.stringify(rows)).not.toContain('555-0101')
    expect(Object.keys(rows[0]!.raw)).not.toContain('Phone Number')
    expect(rows[0]!.raw['City']).toBe('')
  })

  it('reads a multi-line guest list inside one quoted cell', async () => {
    const { rows } = await readExport(exportCsv({ Guests: 'Jane Doe jane@example.org\nSam Lee sam@example.org' }, { Email: 'b@example.org' }))
    expect(rows[0]!.guestText).toBe('Jane Doe jane@example.org\nSam Lee sam@example.org')
    expect(rows[1]!.rowNumber).toBe(3)
  })
})

// Opening the export in Excel and saving it damages non-English names (Oct 15 round-trip test with Excel 16; the
// files in fixtures/excel-saved were made by its roundtrip.ps1 from the invented gala-2026 export).
describe('readExport: names damaged by a spreadsheet save', () => {
  const fixture = (name: string) => new TextDecoder().decode(readFileSync(new URL(`./fixtures/excel-saved/${name}`, import.meta.url)))   // as the browser reads an upload

  it('stops on the replacement character, naming the rows and the fix', async () => {
    const csv = exportCsv({ 'First Name': 'Ren��e' }, { Email: 'b@example.org', 'Last Name': '���ng' })
    await expect(readExport(csv)).rejects.toThrow(ExportFormatError)
    await expect(readExport(csv)).rejects.toThrow(/names in this file are damaged \(row 2: "Ren��e", row 3: "���ng"\)\. That happens when the export is opened and saved in Excel/)
  })

  it('stops on UTF-8 read as Windows-1252 ("RenÃ©"), and on stray control characters', async () => {
    await expect(readExport(exportCsv({ 'First Name': 'RenÃ©' }))).rejects.toThrow(/damaged \(row 2: "RenÃ©"\)/)
    await expect(readExport(exportCsv({ Guests: 'O’Brien\nâ€™Ana' }))).rejects.toThrow(/damaged/)
    await expect(readExport(exportCsv({ Guests: 'Mei \u0010Wu' }))).rejects.toThrow(/damaged/)
  })

  it('counts the rest after three examples', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ Email: `g${i}@example.org`, 'Last Name': `Ng�${i}` }))
    await expect(readExport(exportCsv(...rows))).rejects.toThrow(/row 4: "Ng�2", and 2 more rows\)/)
  })

  it('accepts real accented, Vietnamese, Chinese and Korean names, and tabs and line breaks in a guest list', async () => {
    const { rows, rejected } = await readExport(exportCsv(
      { 'First Name': 'Renée', 'Last Name': 'Đặng', Guests: '王建國\nJosé Núñez\t(guest)' },
      { Email: 'b@example.org', 'First Name': '민준', 'Last Name': 'O’Brien', 'Company/Organization Name': 'Société Générale' },
    ))
    expect(rejected).toEqual([])
    expect(rows.map((r) => `${r.buyer.first} ${r.buyer.last}`)).toEqual(['Renée Đặng', '민준 O’Brien'])
  })

  it('stops on the real Excel-saved export (no byte-order mark), and reads one Excel saved correctly', async () => {
    await expect(readExport(fixture('no-bom-saved-csv-utf8.csv'))).rejects.toThrow(/names in this file are damaged .*and \d+ more rows/)
    const clean = await readExport(new TextDecoder().decode(readFileSync(new URL('./fixtures/gala-2026/givelively-export.csv', import.meta.url))))
    const saved = await readExport(fixture('bom-saved-csv-utf8.csv'))
    expect(saved.rows.map((r) => [r.buyer.first, r.buyer.last, r.guestText])).toEqual(clean.rows.map((r) => [r.buyer.first, r.buyer.last, r.guestText]))
    expect(saved.rejected).toEqual(clean.rejected)
  })
})
