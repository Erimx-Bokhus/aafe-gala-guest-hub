// Reading amounts, counts, and purchase times from the Give Lively export (spec section 1).
// Each parser returns null for a blank cell and throws ValueError for one it can't read.

export class ValueError extends Error {}

/** "$1,000.00 " → 1000. Blank → null. Parentheses or a leading minus mean negative. */
export function parseAmount(raw: string | null | undefined): number | null {
  const s = (raw ?? '').trim()
  if (s === '' || s === '-') return null
  const m = /^(\()?\s*(-)?\s*\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?\s*(\))?$/.exec(s)
  if (!m || Boolean(m[1]) !== Boolean(m[5])) throw new ValueError(`unreadable amount "${s}"`)
  const value = Number(m[3]!.replace(/,/g, '') + (m[4] ?? ''))
  return m[1] || m[2] ? -value : value
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
  if (!m[11]) throw new ValueError(`date has no time zone "${s}"`)
  const year = Number(m[1] ?? m[6])
  const month = Number(m[2] ?? m[4])
  const day = Number(m[3] ?? m[5])
  let hour = Number(m[7])
  const minute = Number(m[8])
  const second = Number(m[9] ?? 0)
  const ampm = m[10]?.toUpperCase()
  const zone = m[11]!.toUpperCase()

  if (ampm) {
    if (hour < 1 || hour > 12) throw new ValueError(`unreadable date "${s}"`)
    hour = (hour % 12) + (ampm === 'PM' ? 12 : 0)
  }
  let offsetMinutes: number
  if (/^[+-]/.test(zone)) {
    const z = /^([+-])(\d{2}):?(\d{2})$/.exec(zone)!
    offsetMinutes = (z[1] === '-' ? -1 : 1) * (Number(z[2]) * 60 + Number(z[3]))
  } else if (zone in ZONES) {
    offsetMinutes = ZONES[zone]! * 60
  } else {
    throw new ValueError(`unknown time zone "${zone}" in "${s}"`)
  }

  const local = Date.UTC(year, month - 1, day, hour, minute, second)
  const check = new Date(local)
  if (
    check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day ||
    hour > 23 || minute > 59 || second > 59
  ) {
    throw new ValueError(`unreadable date "${s}"`)
  }
  return new Date(local - offsetMinutes * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}
