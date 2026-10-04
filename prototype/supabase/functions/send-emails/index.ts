// Sends STAFF-APPROVED emails from email_log through Resend (team hard rule 4:
// drafts with approved_at null are never sent).
// Runs every minute from pg_cron (database/cron.sql). Staff can also call it
// right after an action so the email goes out immediately.
//
// Portal links: a fresh token is minted for every portal_link email. Only its
// SHA-256 hash is stored (email_mark_sent), so earlier links for that order stop working.
//
// Secrets: RESEND_API_KEY, EMAIL_FROM (e.g. "AAFE Gala <gala@aafe.org>", domain verified in Resend),
//          GUEST_PORTAL_URL (e.g. https://gala.aafe.org/), CRON_SECRET.
// Demo: EMAIL_REDIRECT_TO=<team inbox> sends every email there instead of the (fake) recipient.
import QRCode from 'npm:qrcode@1.5.4'
import { admin, caller, cors, env, json } from '../_shared/supabase.ts'

const MAX_ATTEMPTS = 5

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!(await caller(req, ['gala_admin', 'relationship_manager']))) return json({ error: 'forbidden' }, 403)
  const apiKey = env('RESEND_API_KEY'), from = env('EMAIL_FROM'), portalUrl = env('GUEST_PORTAL_URL'), redirect = env('EMAIL_REDIRECT_TO')
  // Without a key nothing is sent and nothing changes; emails wait in the queue.
  if (!apiKey || !from || !portalUrl) return json({ sent: 0, message: 'Email not configured (RESEND_API_KEY, EMAIL_FROM, GUEST_PORTAL_URL). Emails stay queued.' })

  const db = admin()
  const { data: queue, error } = await db.from('email_log').select('*').eq('status', 'queued').not('approved_at', 'is', null).lt('attempts', MAX_ATTEMPTS).order('id').limit(25)
  if (error) return json({ error: 'db_error', message: error.message }, 500)

  let sent = 0, failed = 0
  for (const m of queue ?? []) {
    try {
      const { subject, html, attachments, tokenHash } = await build(db, m, portalUrl)
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `${m.id}-${m.attempts}` },
        body: JSON.stringify({ from, to: [redirect || m.to_email], subject: redirect ? `[demo → ${m.to_email}] ${subject}` : subject, html, attachments }),
      })
      if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
      const { error: e2 } = await db.rpc('email_mark_sent', { p_email_id: m.id, p_portal_token_hash: tokenHash })
      if (e2) throw new Error(e2.message)
      sent++
    } catch (e) {
      failed++
      await db.rpc('email_mark_failed', { p_email_id: m.id, p_error: (e as Error).message })
    }
  }
  return json({ sent, failed })
})

// deno-lint-ignore no-explicit-any
async function build(db: any, m: any, portalUrl: string) {
  const { data: o } = m.order_id
    ? await db.from('orders').select('guest_list_deadline, sponsorship_tiers(name), gala_events(name, event_date, doors_time, venue_name, venue_address)').eq('id', m.order_id).single()
    : { data: null }
  const ev = o?.gala_events
  const when = ev ? `${new Date(ev.event_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, doors ${ev.doors_time}` : ''
  const name = esc(m.to_name ?? '')

  if (m.template === 'portal_link') {
    const token = randomToken()
    const link = `${portalUrl.replace(/#.*$/, '')}#/s/${token}`
    const deadline = o?.guest_list_deadline ? new Date(o.guest_list_deadline + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : null
    return {
      subject: `Add your guests for ${ev?.name ?? 'the AAFE Gala'}`,
      tokenHash: await sha256(token),
      attachments: undefined,
      html: layout(`<p>Dear ${name},</p>
        <p>Thank you for your ${esc(o?.sponsorship_tiers?.name ?? 'support')} for ${esc(ev?.name ?? 'the AAFE Gala')}. Please tell us who will be sitting at your seats${deadline ? ` by <strong>${deadline}</strong>` : ''}.</p>
        <p style="margin:28px 0"><a href="${link}" style="background:#C64C28;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Add or update guest names</a></p>
        <p>You can return to this link at any time to make changes. It is private to your organization, so please don't forward it outside your team.</p>
        <p style="color:#555">English · 中文 · Español — choose your language on the page.</p>
        <p>${esc(when)}<br>${esc(ev?.venue_name ?? '')}</p>`),
    }
  }

  if (m.template === 'qr_invitation') {
    const { data: g } = await db.from('guests').select('first_name, qr_token').eq('id', m.guest_id).single()
    if (!g?.qr_token) throw new Error('Guest has no QR code')
    const png: Uint8Array = await QRCode.toBuffer(g.qr_token, { width: 360, margin: 2 })
    return {
      subject: `Your invitation to ${ev?.name ?? 'the AAFE Gala'}`,
      tokenHash: null,
      attachments: [{ filename: 'aafe-gala-entry-qr.png', content: b64(png) }],
      html: layout(`<p>Dear ${esc(g.first_name)},</p>
        <p>AAFE is delighted to welcome you as our guest at ${esc(ev?.name ?? 'the AAFE Gala')}.</p>
        <p>${esc(when)}<br>${esc(ev?.venue_name ?? '')}<br>${esc(ev?.venue_address ?? '')}</p>
        <p>Your entry QR code is attached. Show it at check-in, on your phone or printed.</p>
        <p style="color:#555">Entry code: <code>${esc(g.qr_token)}</code></p>`),
    }
  }
  throw new Error(`No template for "${m.template}" yet`)
}

const layout = (body: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1f2937;max-width:560px">${body}<p style="margin-top:32px;color:#6b7280;font-size:13px">Asian Americans for Equality (AAFE)</p></div>`
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(24)) // 192 bits
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('')
}
