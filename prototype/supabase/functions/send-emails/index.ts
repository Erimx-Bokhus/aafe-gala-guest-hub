// Sends STAFF-APPROVED emails from email_log through Resend (team hard rule 4:
// drafts with approved_at null are never sent).
// Runs every minute from pg_cron (database/cron.sql). Staff can also call it
// right after an action so the email goes out immediately.
//
// Portal links and QR e-tickets: each send attempt of a portal_link, guest_list_reminder or
// qr_invitation email gets its own token (_shared/linkToken.ts). Only its SHA-256 hash is stored
// (email_mark_sent), so earlier links for that order, or codes for that seat, stop working. A retry of
// the same attempt rebuilds the same token, so the email it resends is identical (see below).
//
// Secrets: RESEND_API_KEY, EMAIL_FROM (e.g. "AAFE Gala <gala@aafe.org>", domain verified in Resend),
//          GUEST_PORTAL_URL (e.g. https://gala.aafe.org/), LINK_TOKEN_SECRET (32+ random characters,
//          e.g. openssl rand -hex 32), CRON_SECRET.
// Demo: EMAIL_REDIRECT_TO=<team inbox> sends every email there instead of the (fake) recipient.
import QRCode from 'npm:qrcode@1.5.4'
import { deadlinePassed, guestListReminderEmail, paymentReceiptEmail, portalLinkEmail, qrInvitationEmail, type EventInfo } from '../_shared/emails.ts'
import { linkSecretProblem, portalLinkToken, qrTicketCode } from '../_shared/linkToken.ts'
import { retry } from '../_shared/retry.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { admin, caller, cors, env, json } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!(await caller(req, ['gala_admin', 'relationship_manager']))) return json({ error: 'forbidden' }, 403)
  const apiKey = env('RESEND_API_KEY'), from = env('EMAIL_FROM'), portalUrl = env('GUEST_PORTAL_URL'), redirect = env('EMAIL_REDIRECT_TO')
  const links: LinkSettings = { portalUrl, secret: env('LINK_TOKEN_SECRET') }
  // Without a key nothing is sent and nothing changes; emails wait in the queue.
  const missing = notConfigured(apiKey, from, links)
  if (missing) return json({ sent: 0, message: `Email not configured (${missing}). Emails stay queued.` })

  const db = admin()
  // Claim the batch first (email_claim in backend.sql): an email another run is already sending is skipped,
  // so a scheduled run and a manual "send now" never send the same email or overwrite each other's link.
  const { data: claimed, error } = await db.rpc('email_claim', { p_limit: 25 })
  if (error) return json({ error: 'db_error', message: error.message }, 500)
  const queue = ((claimed ?? []) as EmailRow[]).sort((a, b) => a.id.localeCompare(b.id))   // email_claim's rows

  let sent = 0, failed = 0, unsaved = 0
  for (const m of queue) {
    let delivered = false
    try {
      const { subject, html, attachments, tokenHash } = await build(db, m, links)
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `${m.id}-${m.attempts}` },
        body: JSON.stringify({ from, to: [redirect || m.to_email], subject: redirect ? `[demo → ${m.to_email}] ${subject}` : subject, html, attachments }),
      })
      if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
      // The email is out. Saving that must not count as a failed send: a retry would send a second email with a
      // new link, and the link in the first one would stop working (Oct 12 audit). Try the save a few times.
      delivered = true
      await retry(async () => {
        const { error: e2 } = await db.rpc('email_mark_sent', { p_email_id: m.id, p_token_hash: tokenHash })
        if (e2) throw new Error(e2.message)
      })
      sent++
    } catch (e) {
      // A save that still fails leaves the email claimed, using no attempt. After 10 minutes the next run claims it
      // again and rebuilds the identical email: same attempt, so the same link (_shared/linkToken.ts) under the same
      // Idempotency-Key. Resend answers with the first send instead of sending a second email, and the save then
      // makes the link the sponsor already has work (Gaelen Hallenbeck's review, Nov 9).
      if (delivered) { unsaved++; continue }
      failed++
      await db.rpc('email_mark_failed', { p_email_id: m.id, p_error: e instanceof Error ? e.message : String(e) })
    }
  }
  return json({ sent, failed, unsaved })
})

/** A claimed email (email_claim in backend.sql). */
interface EmailRow {
  id: string; template: string; to_email: string; to_name: string | null
  order_id: string | null; payment_id: string | null; guest_id: string | null; attempts: number
}
interface Built { subject: string; html: string; attachments: { filename: string; content: string }[] | undefined; tokenHash: string | null }
/** Where sponsor links point, and the secret their tokens are derived from (_shared/linkToken.ts). */
interface LinkSettings { portalUrl: string; secret: string }

/** What's missing before emails can go out, or null when everything is set. */
function notConfigured(apiKey: string, from: string, links: LinkSettings): string | null {
  if (!apiKey || !from || !links.portalUrl) return 'RESEND_API_KEY, EMAIL_FROM, GUEST_PORTAL_URL'
  return linkSecretProblem(links.secret)
}
type OrderContext = Awaited<ReturnType<typeof orderContext>>
/** The order row orderContext reads: an order has one level and one gala, so both come back as objects. */
interface OrderForEmail {
  commitment_amount: number | null; guest_list_deadline: string | null
  sponsorship_tiers: { name: string } | null
  gala_events: (EventInfo & { guest_list_deadline: string | null }) | null
}

// Gathers what each template needs; the wording lives in _shared/emails.ts.
async function build(db: SupabaseClient, m: EmailRow, links: LinkSettings): Promise<Built> {
  const ctx = await orderContext(db, m)
  // staff_approve_email refuses these too; this catches a deadline that passed after the draft was approved.
  if ((m.template === 'portal_link' || m.template === 'guest_list_reminder') && deadlinePassed(ctx.deadline)) {
    throw new Error(`The guest-list deadline (${ctx.deadline}) has passed, so the link would arrive expired. Extend this order's deadline, then send the link again.`)
  }
  switch (m.template) {
    case 'portal_link': return await portalLink(m, ctx, links)
    case 'guest_list_reminder': return await reminder(db, m, ctx, links)
    case 'payment_receipt': return await receipt(db, m, ctx)
    case 'qr_invitation': return await qrInvitation(db, m, ctx, links.secret)
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
async function newLink(m: EmailRow, links: LinkSettings) {
  const token = await portalLinkToken(links.secret, m.id, m.attempts)
  return { token, link: `${links.portalUrl.replace(/#.*$/, '')}#/s/${token}` }
}

async function portalLink(m: EmailRow, ctx: OrderContext, links: LinkSettings): Promise<Built> {
  const { token, link } = await newLink(m, links)
  return { ...portalLinkEmail({ toName: ctx.toName, tierName: ctx.o?.sponsorship_tiers?.name ?? null, event: ctx.event, deadline: ctx.deadline, link }), tokenHash: await sha256(token), attachments: undefined }
}

async function reminder(db: SupabaseClient, m: EmailRow, ctx: OrderContext, links: LinkSettings): Promise<Built> {
  const { data: seats } = await db.from('seats').select('status').eq('order_id', m.order_id).neq('status', 'cancelled')
  const all: { status: string }[] = seats ?? []
  const unnamed = all.filter((x) => x.status === 'unnamed').length
  // Everyone named since the draft was approved: nothing to remind about, so don't send it.
  if (unnamed === 0) throw new Error('No unnamed seats left; discard this reminder')
  const { token, link } = await newLink(m, links)
  return {
    ...guestListReminderEmail({ toName: ctx.toName, tierName: ctx.o?.sponsorship_tiers?.name ?? null, event: ctx.event, deadline: ctx.deadline, link, unnamed, total: all.length }),
    tokenHash: await sha256(token), attachments: undefined,
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
    tokenHash: null, attachments: undefined,
  }
}

async function qrInvitation(db: SupabaseClient, m: EmailRow, ctx: OrderContext, secret: string): Promise<Built> {
  // This attempt's code for the guest's seat, never stored: only its hash is saved (email_mark_sent),
  // so earlier codes for that seat stop working. A retry of the same attempt rebuilds the same code.
  const { data: g } = await db.from('guests').select('first_name').eq('id', m.guest_id).single()
  if (!g) throw new Error('Guest not found')
  const code = await qrTicketCode(secret, m.id, m.attempts)
  const png: Uint8Array = await QRCode.toBuffer(code, { width: 360, margin: 2 })
  return {
    ...qrInvitationEmail({ firstName: g.first_name, event: ctx.event, code }),
    tokenHash: await sha256(code), attachments: [{ filename: 'aafe-gala-entry-qr.png', content: b64(png) }],
  }
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('')
}
