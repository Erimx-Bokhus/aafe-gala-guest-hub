// The email templates: subject and HTML for each kind of email in email_log.template.
// Plain functions of the data they're given, with no database or network calls, so send-emails
// renders them for sending and the staff app's approval screen can render the same text as a preview.
// Every value from the database is HTML-escaped here.

export interface EventInfo {
  name: string
  event_date: string          // YYYY-MM-DD
  doors_time?: string | null
  venue_name?: string | null
  venue_address?: string | null
}
export interface Rendered { subject: string; html: string }

const GALA = 'the AAFE Gala'

/** Sponsor's first email: their private link to add guest names. The link works until the day after the deadline and a
 *  reminder replaces it, so it never promises "at any time" (D6), nor a language menu the portal hides for v1 (#241). */
export function portalLinkEmail(d: { toName: string; tierName: string | null; event: EventInfo | null; deadline: string | null; link: string }): Rendered {
  const ev = d.event
  return {
    subject: `Add your guests for ${ev?.name ?? GALA}`,
    html: layout(`<p>Dear ${esc(d.toName)},</p>
        <p>Thank you for your ${esc(d.tierName ?? 'support')} for ${esc(ev?.name ?? GALA)}. Please tell us who will be sitting at your seats${d.deadline ? ` by <strong>${longDay(d.deadline)}</strong>` : ''}.</p>
        ${button(d.link, 'Add or update guest names')}
        <p>You can come back to this link to add or change names${d.deadline ? ` until ${longDay(d.deadline)}` : ''}. If we send you a reminder, use the link in that email: it replaces this one. The link is private to your organization, so please don't forward it outside your team.</p>
        <p>${esc(when(ev))}<br>${esc(ev?.venue_name ?? '')}</p>`),
  }
}

/** Reminder before the guest-list deadline, with a fresh private link (earlier links stop working). */
export function guestListReminderEmail(d: {
  toName: string; tierName: string | null; event: EventInfo | null; deadline: string | null; link: string; unnamed: number; total: number
}): Rendered {
  const ev = d.event
  const seats = `${d.unnamed} of your ${d.total} seat${d.total === 1 ? '' : 's'}`
  return {
    subject: `Reminder: ${d.unnamed} guest name${d.unnamed === 1 ? '' : 's'} still needed for ${ev?.name ?? GALA}`,
    html: layout(`<p>Dear ${esc(d.toName)},</p>
        <p>Thank you again for your ${esc(d.tierName ?? 'support')} for ${esc(ev?.name ?? GALA)}. ${esc(seats)} still need a guest name${d.deadline ? `. Please add them by <strong>${longDay(d.deadline)}</strong>` : ''}, so we can prepare name badges and seating.</p>
        ${button(d.link, 'Add guest names')}
        <p>This link replaces the one we sent before. It is private to your organization, so please don't forward it outside your team.</p>
        <p>If you're not sure yet who is coming, you can add names as they're confirmed.</p>
        <p>${esc(when(ev))}<br>${esc(ev?.venue_name ?? '')}</p>`),
  }
}

/** Confirmation of a payment staff recorded (check, ACH, or wire). Give Lively sends its own receipts. */
export function paymentReceiptEmail(d: {
  toName: string; event: EventInfo | null; amount: number; method: string; receivedAt: string; checkNumber: string | null
  commitment: number; paidToDate: number
}): Rendered {
  const ev = d.event
  const balance = Math.max(0, d.commitment - d.paidToDate)
  const how = METHOD[d.method] ?? 'payment'
  return {
    subject: `Payment received for ${ev?.name ?? GALA}`,
    html: layout(`<p>Dear ${esc(d.toName)},</p>
        <p>Thank you. We received your ${esc(how)}${d.method === 'check' && d.checkNumber ? ` (check #${esc(d.checkNumber)})` : ''} of <strong>${money(d.amount)}</strong> on ${longDay(d.receivedAt)}.</p>
        <table style="border-collapse:collapse;margin:16px 0">
          ${row('Your commitment', money(d.commitment))}
          ${row('Received to date', money(d.paidToDate))}
          ${row('Balance', balance > 0.005 ? money(balance) : 'Paid in full')}
        </table>
        <p>Please keep this email for your records. It confirms your payment; it is not a tax receipt.</p>
        <p>${esc(when(ev))}<br>${esc(ev?.venue_name ?? '')}</p>`),
  }
}

/** A guest's entry ticket: the QR code is attached as an image; the code is also printed. */
export function qrInvitationEmail(d: { firstName: string; event: EventInfo | null; code: string }): Rendered {
  const ev = d.event
  return {
    subject: `Your invitation to ${ev?.name ?? GALA}`,
    html: layout(`<p>Dear ${esc(d.firstName)},</p>
        <p>AAFE is delighted to welcome you as our guest at ${esc(ev?.name ?? GALA)}.</p>
        <p>${esc(when(ev))}<br>${esc(ev?.venue_name ?? '')}<br>${esc(ev?.venue_address ?? '')}</p>
        <p>Your entry QR code is attached. Show it at check-in, on your phone or printed.</p>
        <p style="color:#555">Entry code: <code>${esc(d.code)}</code></p>
        <p style="color:#555">This code is for you only and works until the morning after the gala.</p>`),
  }
}

const METHOD: Record<string, string> = { check: 'check', ach_direct: 'bank transfer (ACH)', wire: 'wire transfer' }

const layout = (body: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1f2937;max-width:560px">${body}<p style="margin-top:32px;color:#6b7280;font-size:13px">Asian Americans for Equality (AAFE)</p></div>`
const button = (href: string, label: string) =>
  `<p style="margin:28px 0"><a href="${esc(href)}" style="background:#C64C28;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">${esc(label)}</a></p>`
const row = (label: string, value: string) =>
  `<tr><td style="padding:4px 16px 4px 0;color:#555">${esc(label)}</td><td style="padding:4px 0;font-weight:600">${esc(value)}</td></tr>`

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c)
/** "$1,250.00" */
export const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** True once a guest-list deadline day (YYYY-MM-DD) is over in New York: a link minted now would arrive expired. */
export function deadlinePassed(deadline: string | null, now = new Date()): boolean {
  return !!deadline && deadline < now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

/** "October 21" from a date (YYYY-MM-DD) or a timestamp, read in New York time. */
export function longDay(d: string) {
  const at = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T12:00:00Z') : new Date(d)
  return at.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'America/New_York' })
}
/** "Thursday, May 13, 2027, doors 6:00 PM" */
function when(ev: EventInfo | null) {
  if (!ev) return ''
  const day = new Date(ev.event_date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })
  return ev.doors_time ? `${day}, doors ${ev.doors_time}` : day
}
