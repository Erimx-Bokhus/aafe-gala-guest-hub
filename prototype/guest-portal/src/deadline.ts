type DeadlineClock = {
  live: boolean
  search?: string
  now?: Date
}

// B9: after the guest-name deadline the page is read-only (AAFE time, end of the deadline day).
// Demo only (offline mode): add ?demoToday=YYYY-MM-DD before the # to preview.
export function isPastDeadline(deadline: string | null, { live, search = '', now = new Date() }: DeadlineClock) {
  if (!deadline) return false
  const demo = live ? null : new URLSearchParams(search).get('demoToday')
  const today = demo && /^\d{4}-\d{2}-\d{2}$/.test(demo)
    ? demo
    : now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  return today > deadline.slice(0, 10)
}
