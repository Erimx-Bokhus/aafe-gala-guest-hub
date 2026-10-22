import { fmtDate } from '@shared/ui'

/** Calendar date in AAFE's time zone (for date-only inputs and exports). */
export function nyDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

/** How far ahead a payment's date may be, as staff_record_payment allows (#224): a check recorded on Friday and deposited on Monday. */
export const PAYMENT_DAYS_AHEAD = 3

/** Why a payment's date can't be recorded, in the server's words, or null when it can. received and today: YYYY-MM-DD. */
export function paymentDateError(received: string, today = nyDate(new Date())): string | null {
  if (!received) return 'Enter the day the payment arrived.'
  const last = new Date(`${today}T12:00:00Z`)
  last.setUTCDate(last.getUTCDate() + PAYMENT_DAYS_AHEAD)
  return received > last.toISOString().slice(0, 10) ? `${fmtDate(received)} is more than ${PAYMENT_DAYS_AHEAD} days ahead. Enter the day the payment arrived.` : null
}
