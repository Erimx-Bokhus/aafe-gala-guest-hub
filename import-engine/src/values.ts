// Reading amounts, counts, and purchase times from the Give Lively export (spec section 1).
// Each parser returns null for a blank cell and throws ValueError for one it can't read.

import { must } from './must.ts'

export class ValueError extends Error {}

/**
 * "$1,000.00 " → 1000. Blank → null. Parentheses or a leading minus mean negative. A dash alone ("-", "$ -") is
 * zero: that's how a spreadsheet's accounting format shows $0, e.g. after the export is opened and saved in Excel
 * (Oct 12 audit: it was read as blank, so a $0 row was rejected as "missing Amount Spent").
 */
export function parseAmount(raw: string | null | undefined): number | null {
  const s = (raw ?? '').trim()
  if (s === '') return null
  if (/^\$?\s*-\s*$/.test(s)) return 0
  const m = /^(\()?\s*(-)?\s*\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?\s*(\))?$/.exec(s)
  if (!m || Boolean(m[1]) !== Boolean(m[5])) throw new ValueError(`unreadable amount "${s}"`)
  const value = Number(must(m[3], 'the amount pattern always captures its digits').replace(/,/g, '') + (m[4] ?? ''))
  return m[1] || m[2] ? -value : value
}

/**
 * "Transaction Fee Covered": a dollar amount, or TRUE/FALSE (yes/no) in exports that only say whether the
 * donor covered the fee. A yes/no gives no amount, so → null, like a blank cell, instead of rejecting the row.
 */
export function parseCoveredFee(raw: string | null | undefined): number | null {
  return /^\s*(true|false|yes|no)\s*$/i.test(raw ?? '') ? null : parseAmount(raw)
}

/** A whole number of tickets or seats. Blank → null. */
export function parseCount(raw: string | null | undefined): number | null {
  const s = (raw ?? '').trim()
  if (s === '') return null
  if (!/^\d+$/.test(s)) throw new ValueError(`unreadable number "${s}"`)
  return Number(s)
}

// Hours from UTC. Give Lively labels New York times EST or EDT; the others are accepted in case an
// export is made from another account or re-saved.
const ZONES: Record<string, number> = {
  UTC: 0, GMT: 0, Z: 0,
  EST: -5, EDT: -4, CST: -6, CDT: -5, MST: -7, MDT: -6, PST: -8, PDT: -7,
}

const DATE_TIME =
  /^(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})\/(\d{1,2})\/(\d{4}))[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\s*([A-Z]{1,4}|[+-]\d{2}:?\d{2})?$/i

/**
 * "2026-02-05 05:14:46 PM EST" → "2026-02-05T22:14:46Z" (UTC, to the second).
 * Also reads "2/5/2026 17:14:46 EST" and numeric offsets ("-05:00"). A time without a zone is
 * rejected: guessing EST or EDT could shift the purchase key by an hour.
 */
export function parsePurchaseTime(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim()
  if (s === '') return null
  const m = DATE_TIME.exec(s)
  if (!m) throw new ValueError(`unreadable date "${s}"`)
  const zone = m[11]?.toUpperCase()
  if (!zone) throw new ValueError(`date has no time zone "${s}"`)
  const t = {
    year: Number(m[1] ?? m[6]), month: Number(m[2] ?? m[4]), day: Number(m[3] ?? m[5]),
    hour: to24Hour(Number(m[7]), m[10], s), minute: Number(m[8]), second: Number(m[9] ?? 0),
  }
  const offsetMinutes = zoneOffsetMinutes(zone, s)
  const local = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second)
  if (!isRealTime(local, t)) throw new ValueError(`unreadable date "${s}"`)
  return new Date(local - offsetMinutes * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** An hour with AM or PM (1–12) as 0–23; without either, the hour as written. */
function to24Hour(hour: number, ampm: string | undefined, s: string): number {
  if (!ampm) return hour
  if (hour < 1 || hour > 12) throw new ValueError(`unreadable date "${s}"`)
  return (hour % 12) + (ampm.toUpperCase() === 'PM' ? 12 : 0)
}

/** "+05:30", "-0400", or a zone name in ZONES, as minutes east of UTC. */
function zoneOffsetMinutes(zone: string, s: string): number {
  const z = /^([+-])(\d{2}):?(\d{2})$/.exec(zone)
  if (z) return (z[1] === '-' ? -1 : 1) * (Number(z[2]) * 60 + Number(z[3]))
  const hours = ZONES[zone]
  if (hours === undefined) throw new ValueError(`unknown time zone "${zone}" in "${s}"`)
  return hours * 60
}

/** The date exists (no February 30) and the time is within the day. */
function isRealTime(local: number, t: { year: number; month: number; day: number; hour: number; minute: number; second: number }): boolean {
  const d = new Date(local)
  return d.getUTCFullYear() === t.year && d.getUTCMonth() === t.month - 1 && d.getUTCDate() === t.day &&
    t.hour <= 23 && t.minute <= 59 && t.second <= 59
}
