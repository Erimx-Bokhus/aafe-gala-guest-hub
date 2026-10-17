/** Calendar date in AAFE's time zone (for date-only inputs and exports). */
export function nyDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}
