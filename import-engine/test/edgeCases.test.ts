// Edge cases from the testing gap list: daylight-saving days, a full-size export, and an export
// that names the gala only in Internal Name. Invented data only (hard rule 1).
import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { findMissing, GalaPageNotSetError, parsePurchaseTime, prepareUpload, purchaseKey } from '../src/index.ts'
import { context, exportCsv, GALA_PAGE } from './helpers.ts'

/** The same export with some columns removed, as when AAFE picks fewer columns in Give Lively. */
function withoutColumns(csv: string, drop: string[]): string {
  const [header, ...rows] = Papa.parse<string[]>(csv, { skipEmptyLines: true }).data
  const keep = header!.map((h, i) => (drop.includes(h) ? -1 : i)).filter((i) => i >= 0)
  return Papa.unparse([keep.map((i) => header![i]!), ...rows.map((r) => keep.map((i) => r[i] ?? ''))])
}

describe('daylight-saving days (Give Lively labels every time EST or EDT)', () => {
  // 2026: clocks go back at 2:00 AM on Sunday, November 1, so 1:00–1:59 AM happens twice.
  it('the repeated 1:30 AM in November is two different moments', () => {
    expect(parsePurchaseTime('2026-11-01 01:30:00 AM EDT')).toBe('2026-11-01T05:30:00Z')
    expect(parsePurchaseTime('2026-11-01 01:30:00 AM EST')).toBe('2026-11-01T06:30:00Z')
  })

  it('two purchases by one buyer in the repeated hour stay two purchases', async () => {
    const csv = exportCsv(
      { 'Date/Time of Purchase': '2026-11-01 01:30:00 AM EDT' },
      { 'Date/Time of Purchase': '2026-11-01 01:30:00 AM EST' },
    )
    const { rows, report } = await prepareUpload(csv, context())
    expect(rows.map((r) => r.purchasedAt)).toEqual(['2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z'])
    expect(new Set(rows.map((r) => r.purchaseKey)).size).toBe(2)
    expect(report.dateRange).toEqual({ earliest: '2026-11-01T05:30:00Z', latest: '2026-11-01T06:30:00Z' })
  })

  // 2026: clocks jump from 2:00 to 3:00 AM on Sunday, March 8, so 2:30 AM never happens on the wall clock.
  it('2:30 AM on the March spring-forward day is read by its label, not rejected or guessed', () => {
    expect(parsePurchaseTime('2026-03-08 02:30:00 AM EST')).toBe('2026-03-08T07:30:00Z')
    expect(parsePurchaseTime('2026-03-08 03:30:00 AM EDT')).toBe('2026-03-08T07:30:00Z')
    expect(parsePurchaseTime('2026-03-08 01:59:59 AM EST')).toBe('2026-03-08T06:59:59Z')
  })

  it('the same moment written in either label is the same purchase, so a re-export never duplicates it', async () => {
    const a = await prepareUpload(exportCsv({ 'Date/Time of Purchase': '2026-03-08 02:30:00 AM EST' }), context())
    const b = await prepareUpload(exportCsv({ 'Date/Time of Purchase': '2026-03-08 03:30:00 AM EDT' }), context())
    expect(a.rows[0]!.purchaseKey).toBe(b.rows[0]!.purchaseKey)
    expect(a.rows[0]!.purchaseKey).toBe(await purchaseKey('grace.kim@example.org', '2026-03-08T07:30:00Z'))
  })

  it('a time with no label is refused rather than guessed (an hour off would change the purchase key)', async () => {
    const { rows, report } = await prepareUpload(exportCsv({ 'Date/Time of Purchase': '2026-11-01 01:30:00 AM' }), context())
    expect(rows).toEqual([])
    expect(report.rejected).toEqual([{ rowNumber: 2, reason: expect.stringMatching(/no time zone/) }])
  })

  it('the missing-purchase check compares moments, so the repeated hour is inside the range', () => {
    const prev = [{ purchaseKey: 'k-edt', purchasedAt: '2026-11-01T05:30:00Z' }, { purchaseKey: 'k-est', purchasedAt: '2026-11-01T06:30:00Z' }]
    expect(findMissing(prev, ['k-edt'], { earliest: '2026-11-01T05:00:00Z', latest: '2026-11-01T07:00:00Z' })).toEqual([prev[1]])
  })
})

describe('a full-size export', () => {
  // AAFE's 2026 gala had about 550 guests; 2,000 purchase rows leaves room to grow.
  const N = 2000
  const start = Date.UTC(2027, 0, 5, 14, 0, 0)
  const rows = Array.from({ length: N }, (_, i) => {
    const at = new Date(start + i * 47 * 60 * 1000)   // one every 47 minutes: crosses the March DST change
    const est = at < new Date('2027-03-14T07:00:00Z')
    const local = new Date(at.getTime() + (est ? -5 : -4) * 3600 * 1000)
    const h = local.getUTCHours()
    const stamp = `${local.toISOString().slice(0, 10)} ${String(h % 12 || 12).padStart(2, '0')}:${local.toISOString().slice(14, 19)} ${h < 12 ? 'AM' : 'PM'} ${est ? 'EST' : 'EDT'}`
    return {
      'First Name': `Guest${i}`, 'Last Name': `Synthetic${i % 97}`, Email: `guest${i}@example.org`,
      'Date/Time of Purchase': stamp, 'Company/Organization Name': i % 5 === 0 ? `Example Partners ${i % 40}` : '',
      ...(i % 10 === 0 ? { 'Tier Purchased': 'Champion Sponsor', 'Total Seats': '6', 'Amount Spent': '$7,500.00', Guests: `Pat Doe${i}\nSam Roe${i}` } : {}),
    }
  })

  it('reads 2,000 rows, every one a distinct purchase, in a few seconds', async () => {
    const t0 = performance.now()
    const { rows: prepared, report } = await prepareUpload(exportCsv(...rows), context())
    const ms = performance.now() - t0
    expect(report.rowsRead).toBe(N)
    expect(report.rejected).toEqual([])
    expect(prepared).toHaveLength(N)
    expect(new Set(prepared.map((r) => r.purchaseKey)).size).toBe(N)
    expect(prepared.filter((r) => r.tierId === 'champion')).toHaveLength(N / 10)
    expect(report.dateRange?.earliest).toBe('2027-01-05T14:00:00Z')
    expect(ms).toBeLessThan(10_000)
  }, 30_000)

  it('the same file uploaded again gives the same purchase keys', async () => {
    const csv = exportCsv(...rows.slice(0, 300))
    const [a, b] = await Promise.all([prepareUpload(csv, context()), prepareUpload(csv, context())])
    expect(a.rows.map((r) => r.purchaseKey)).toEqual(b.rows.map((r) => r.purchaseKey))
  })
})

describe('an export with Internal Name and no Page Name column', () => {
  const csv = withoutColumns(exportCsv(
    { 'Internal Name': GALA_PAGE },
    { 'Internal Name': 'Year-End Appeal 2026', Email: 'other@example.org' },
    { 'Internal Name': ` ${GALA_PAGE.toUpperCase()} `, Email: 'third@example.org' },
  ), ['Page Name'])

  it('still reads the file', () => {
    expect(csv.split('\n')[0]).not.toContain('Page Name')
    expect(csv.split('\n')[0]).toContain('Internal Name')
  })

  it('imports the gala rows by Internal Name and skips the other campaign', async () => {
    const { rows, report } = await prepareUpload(csv, context())
    expect(rows.map((r) => r.buyer.email)).toEqual(['grace.kim@example.org', 'third@example.org'])
    expect(report.skippedOtherPage).toEqual([{ rowNumber: 3, pageName: 'Year-End Appeal 2026' }])
  })

  it('with no page chosen yet, lists the Internal Names so staff can pick the gala', async () => {
    const e = await prepareUpload(csv, context({ galaPageName: null })).catch((x) => x)
    expect(e).toBeInstanceOf(GalaPageNotSetError)
    expect((e as GalaPageNotSetError).pages.map((p) => p.pageName)).toContain('Year-End Appeal 2026')
  })

  it('with neither column, every row counts as the gala (an upload is one page)', async () => {
    const bare = withoutColumns(exportCsv({}, { Email: 'b@example.org' }), ['Page Name', 'Internal Name'])
    const { rows, report } = await prepareUpload(bare, context())
    expect(rows).toHaveLength(2)
    expect(report.skippedOtherPage).toEqual([])
  })
})
