// Sends STAFF-APPROVED emails from email_log through Resend (team hard rule 4:
// drafts with approved_at null are never sent).
// Runs every minute from pg_cron (database/cron.sql). Staff can also call it
// right after an action so the email goes out immediately.
//
// Portal links and QR e-tickets: each send attempt of a portal_link, guest_list_reminder or
// qr_invitation email gets its own token (_shared/linkToken.ts). Only its SHA-256 hash is stored
// (email_mark_sent), so earlier links for that order, or codes for that seat, stop working.
//
// Retries: each attempt's request is saved before it goes out, with its link or QR code taken out
// (_shared/emailSnapshot.ts, email_save_snapshot). A retry of the same attempt resends that request
// unchanged, so Resend recognizes it (see below). It's kept in a table staff can't read and deleted
// as soon as the attempt is over: sent, failed, cancelled, or its address changed or deleted.
//
// Secrets: RESEND_API_KEY, EMAIL_FROM (e.g. "AAFE Gala <gala@aafe.org>", domain verified in Resend),
//          GUEST_PORTAL_URL (e.g. https://gala.aafe.org/), LINK_TOKEN_SECRET (32+ random characters,
//          e.g. openssl rand -hex 32), CRON_SECRET.
// Demo: EMAIL_REDIRECT_TO=<team inbox> sends every email there instead of the (fake) recipient.
import QRCode from 'npm:qrcode@1.5.4'
import { deadlinePassed, guestListReminderEmail, paymentReceiptEmail, portalLinkEmail, qrInvitationEmail, type EventInfo } from '../_shared/emails.ts'
import { freezeRequest, LINK_TOKEN, QR_CODE, QR_IMAGE, thawRequest, type Secret } from '../_shared/emailSnapshot.ts'
import { linkSecretProblem, portalLinkToken, qrTicketCode } from '../_shared/linkToken.ts'
import { retry } from '../_shared/retry.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { admin, caller, cors, env, json } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!(await caller(req, ['gala_admin', 'relationship_manager']))) return json({ error: 'forbidden' }, 403)
  const apiKey = env('RESEND_API_KEY'), redirect = env('EMAIL_REDIRECT_TO')
  const links: LinkSettings = { portalUrl: env('GUEST_PORTAL_URL'), secret: env('LINK_TOKEN_SECRET') }
  const mail: MailSettings = { from: env('EMAIL_FROM'), redirect }
  // Without a key nothing is sent and nothing changes; emails wait in the queue.
  const missing = notConfigured(apiKey, mail.from, links)
  if (missing) return json({ sent: 0, message: `Email not configured (${missing}). Emails stay queued.` })

  const db = admin()
  // Claim the batch first (email_claim in backend.sql): an email another run is already sending is skipped,
  // so a scheduled run and a manual "send now" never send the same email or overwrite each other's link.
  const { data: claimed, error } = await db.rpc('email_claim', { p_limit: 25 })
  if (error) return json({ error: 'db_error', message: error.message }, 500)
  const queue = ((claimed ?? []) as EmailRow[]).sort((a, b) => a.id.localeCompare(b.id))   // email_claim's rows
  const snapshotError = await attachSnapshots(db, queue)
  if (snapshotError) return json({ error: 'db_error', message: snapshotError }, 500)

  let sent = 0, failed = 0, unsaved = 0
  for (const m of queue) {
    let delivered = false
    try {
      const secrets = await attemptSecrets(m, links)
      const body = await requestBody(db, m, links, mail, secrets)
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `${m.id}-${m.attempts}` },
        body,
      })
      if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
      // The email is out. Saving that must not count as a failed send: a retry would send a second email with a
      // new link, and the link in the first one would stop working (Oct 12 audit). Try the save a few times.
      delivered = true
      const tokenHash = secrets.token ? await sha256(secrets.token) : null
      await retry(async () => {
        const { error: e2 } = await db.rpc('email_mark_sent', { p_email_id: m.id, p_token_hash: tokenHash })
        if (e2) throw new Error(e2.message)
      })
      sent++
    } catch (e) {
      // A save that still fails leaves the email claimed, using no attempt. After 10 minutes the next run claims it
      // again and resends this attempt's saved request: the same link (_shared/linkToken.ts) in the same email under
      // the same Idempotency-Key, even if the gala or the order changed since. Resend answers with the first send
      // instead of sending a second email, and the save then makes the link the sponsor already has work
      // (Gaelen Hallenbeck's review, Nov 9 and 10).
      if (delivered) { unsaved++; continue }
      failed++
      await db.rpc('email_mark_failed', { p_email_id: m.id, p_error: e instanceof Error ? e.message : String(e) })
    }
  }
  return json({ sent, failed, unsaved })
})

/** A claimed email (email_claim in backend.sql), with its saved request when it has one (email_snapshots). */
interface EmailRow {
  id: string; template: string; to_email: string; to_name: string | null
  order_id: string | null; payment_id: string | null; guest_id: string | null; attempts: number
  send_snapshot: string | null; send_snapshot_attempt: number | null
}
/** A row from email_snapshots: the request saved for one attempt of a claimed email. */
interface SavedRequest { email_id: string; attempt: number; snapshot: string }

/** Puts each claimed email's saved request on it, if an earlier run already sent this attempt. They're kept apart from
 *  email_log, which staff can read, and only this worker reads them (email_snapshots in backend.sql). The error, or null. */
async function attachSnapshots(db: SupabaseClient, queue: EmailRow[]): Promise<string | null> {
  if (!queue.length) return null
  const { data, error } = await db.rpc('email_snapshots', { p_ids: queue.map((m) => m.id) })
  if (error) return error.message
  const byId = new Map(((data ?? []) as SavedRequest[]).map((s) => [s.email_id, s]))
  for (const m of queue) {
    const s = byId.get(m.id)
    m.send_snapshot = s?.snapshot ?? null
    m.send_snapshot_attempt = s?.attempt ?? null
  }
  return null
}
interface Built { subject: string; html: string; attachments: { filename: string; content: string }[] | undefined }
/** Where sponsor links point, and the secret their tokens are derived from (_shared/linkToken.ts). */
interface LinkSettings { portalUrl: string; secret: string }
/** Who emails come from, and the demo inbox that receives them all instead (empty when off). */
interface MailSettings { from: string; redirect: string }
/** What this attempt's email carries that is never stored: its link token or QR code, and the QR image. */
interface AttemptSecrets { token: string | null; qrImage: string | null }

/** What's missing before emails can go out, or null when everything is set. */
function notConfigured(apiKey: string, from: string, links: LinkSettings): string | null {
  if (!apiKey || !from || !links.portalUrl) return 'RESEND_API_KEY, EMAIL_FROM, GUEST_PORTAL_URL'
  return linkSecretProblem(links.secret)
}

/** This attempt's link token, or its QR code and image. The same attempt of the same email always gets the same ones. */
async function attemptSecrets(m: EmailRow, links: LinkSettings): Promise<AttemptSecrets> {
  if (m.template === 'portal_link' || m.template === 'guest_list_reminder') {
    return { token: await portalLinkToken(links.secret, m.id, m.attempts), qrImage: null }
  }
  if (m.template === 'qr_invitation') {
    const code = await qrTicketCode(links.secret, m.id, m.attempts)
    const png: Uint8Array = await QRCode.toBuffer(code, { width: 360, margin: 2 })
    return { token: code, qrImage: b64(png) }
  }
  return { token: null, qrImage: null }
}

/** The placeholders that stand in for this attempt's secrets in the saved request (_shared/emailSnapshot.ts). */
function placeholders(m: EmailRow, s: AttemptSecrets): Secret[] {
  if (m.template === 'qr_invitation' && s.token && s.qrImage) return [{ placeholder: QR_IMAGE, value: s.qrImage }, { placeholder: QR_CODE, value: s.token }]
  if (s.token) return [{ placeholder: LINK_TOKEN, value: s.token }]
  return []
}

/** This attempt's request to Resend: the one saved before its first send, unchanged, or built now and saved before it goes out. */
async function requestBody(db: SupabaseClient, m: EmailRow, links: LinkSettings, mail: MailSettings, s: AttemptSecrets): Promise<string> {
  if (m.send_snapshot !== null && m.send_snapshot_attempt === m.attempts) {
    refuseExpiredLink(m, await orderContext(db, m))
    return thawRequest(m.send_snapshot, placeholders(m, s))
  }
  const { subject, html, attachments } = await build(db, m, links, s)
  const body = JSON.stringify({ from: mail.from, to: [mail.redirect || m.to_email], subject: mail.redirect ? `[demo → ${m.to_email}] ${subject}` : subject, html, attachments })
  // Saved before it goes out: a retry must find it even if this run stops right after Resend accepts it.
  const { data: saved, error } = await db.rpc('email_save_snapshot', { p_email_id: m.id, p_attempt: m.attempts, p_snapshot: freezeRequest(body, placeholders(m, s)) })
  if (error) throw new Error(`Could not save the email before sending it: ${error.message}`)
  if (saved !== true) throw new Error('The email changed before it could be sent (cancelled, sent or retried elsewhere)')
  return body
}

type OrderContext = Awaited<ReturnType<typeof orderContext>>
/** The order row orderContext reads: an order has one level and one gala, so both come back as objects. */
interface OrderForEmail {
  commitment_amount: number | null; guest_list_deadline: string | null
  sponsorship_tiers: { name: string } | null
  gala_events: (EventInfo & { guest_list_deadline: string | null }) | null
}

/** staff_approve_email refuses these too; this catches a deadline that passed after the draft was approved. */
function refuseExpiredLink(m: EmailRow, ctx: OrderContext) {
  if ((m.template === 'portal_link' || m.template === 'guest_list_reminder') && deadlinePassed(ctx.deadline)) {
    throw new Error(`The guest-list deadline (${ctx.deadline}) has passed, so the link would arrive expired. Extend this order's deadline, then send the link again.`)
  }
}

// Gathers what each template needs; the wording lives in _shared/emails.ts.
async function build(db: SupabaseClient, m: EmailRow, links: LinkSettings, s: AttemptSecrets): Promise<Built> {
  const ctx = await orderContext(db, m)
  refuseExpiredLink(m, ctx)
  switch (m.template) {
    case 'portal_link': return portalLink(ctx, linkTo(links, s))
    case 'guest_list_reminder': return await reminder(db, m, ctx, linkTo(links, s))
    case 'payment_receipt': return await receipt(db, m, ctx)
    case 'qr_invitation': return await qrInvitation(db, m, ctx, s)
    default: throw new Error(`No template for "${m.template}" yet`)
  }
}

/** The email's order, its gala, and the guest-list deadline (the order's own, else the gala's). */
async function orderContext(db: SupabaseClient, m: EmailRow) {
  const { data: o } = m.order_id
    ? await db.from('orders').select('commitment_amount, guest_list_deadline, sponsorship_tiers(name), gala_events(name, event_date, doors_time, venue_name, venue_address, guest_list_deadline)').eq('id', m.order_id).single<OrderForEmail>()
    : { data: null }
  const event = o?.gala_events ?? null
  return { o, event, deadline: o?.guest_list_deadline ?? event?.guest_list_deadline ?? null, toName: m.to_name ?? '' }
}

/** This attempt's private link: the token goes in the email, only its hash is stored. */
function linkTo(links: LinkSettings, s: AttemptSecrets): string {
  if (!s.token) throw new Error('A guest-list email needs its link token')
  return `${links.portalUrl.replace(/#.*$/, '')}#/s/${s.token}`
}

function portalLink(ctx: OrderContext, link: string): Built {
  return { ...portalLinkEmail({ toName: ctx.toName, tierName: ctx.o?.sponsorship_tiers?.name ?? null, event: ctx.event, deadline: ctx.deadline, link }), attachments: undefined }
}

async function reminder(db: SupabaseClient, m: EmailRow, ctx: OrderContext, link: string): Promise<Built> {
  const { data: seats } = await db.from('seats').select('status').eq('order_id', m.order_id).neq('status', 'cancelled')
  const all: { status: string }[] = seats ?? []
  const unnamed = all.filter((x) => x.status === 'unnamed').length
  // Everyone named since the draft was approved: nothing to remind about, so don't send it.
  if (unnamed === 0) throw new Error('No unnamed seats left; discard this reminder')
  return {
    ...guestListReminderEmail({ toName: ctx.toName, tierName: ctx.o?.sponsorship_tiers?.name ?? null, event: ctx.event, deadline: ctx.deadline, link, unnamed, total: all.length }),
    attachments: undefined,
  }
}

async function receipt(db: SupabaseClient, m: EmailRow, ctx: OrderContext): Promise<Built> {
  const { data: p } = await db.from('payments').select('gross_amount, method, received_at, check_number').eq('id', m.payment_id).single()
  if (!p) throw new Error('Payment not found')
  const { data: all } = await db.from('payments').select('original_amount, refunded_amount').eq('order_id', m.order_id)
  // Per payment, never below 0 (coding standard S5): a full Give Lively refund returns the donor-covered fee too.
  const paidToDate = ((all ?? []) as { original_amount: number; refunded_amount: number }[])
    .reduce((t, x) => t + Math.max(Number(x.original_amount) - Number(x.refunded_amount), 0), 0)
  return {
    ...paymentReceiptEmail({ toName: ctx.toName, event: ctx.event, amount: Number(p.gross_amount), method: p.method, receivedAt: p.received_at, checkNumber: p.check_number,
      commitment: Number(ctx.o?.commitment_amount ?? 0), paidToDate }),
    attachments: undefined,
  }
}

async function qrInvitation(db: SupabaseClient, m: EmailRow, ctx: OrderContext, s: AttemptSecrets): Promise<Built> {
  // This attempt's code for the guest's seat, never stored: only its hash is saved (email_mark_sent),
  // so earlier codes for that seat stop working.
  const { data: g } = await db.from('guests').select('first_name').eq('id', m.guest_id).single()
  if (!g) throw new Error('Guest not found')
  if (!s.token || !s.qrImage) throw new Error('A QR invitation needs its code and image')
  return {
    ...qrInvitationEmail({ firstName: g.first_name, event: ctx.event, code: s.token }),
    attachments: [{ filename: 'aafe-gala-entry-qr.png', content: s.qrImage }],
  }
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('')
}
