// Sponsor links and QR e-ticket codes, one per send attempt (supabase/functions/_shared/linkToken.ts), and the retries
// Gaelen Hallenbeck found: Resend accepted an email, saving its link failed, and the retry 10 minutes later sent a
// different request under the same Idempotency-Key, which Resend refuses (409). Nov 9: a new link; Nov 10: the same
// link in an email rebuilt after the gala was renamed. The sponsor kept a link that never worked. Each attempt's
// request is now saved without its secrets and resent unchanged (_shared/emailSnapshot.ts; the database side is in
// scripts/test-emails.mjs). Runs with npm run test:backend.
import { createHash } from 'node:crypto'
import { freezeRequest, LINK_TOKEN, QR_CODE, QR_IMAGE, thawRequest } from '../supabase/functions/_shared/emailSnapshot.ts'
import { linkSecretProblem, MIN_SECRET_LENGTH, portalLinkToken, qrTicketCode } from '../supabase/functions/_shared/linkToken.ts'
// @ts-expect-error plain JavaScript helper
import { counter } from './test-db.mjs'
const count = counter(), ok = count.ok

const SECRET = 'test-only-secret-0123456789abcdef0123456789abcdef' // gitleaks:allow (an invented test value, not a credential)
const OTHER = 'another-test-secret-fedcba9876543210fedcba98765432' // gitleaks:allow (an invented test value, not a credential)

// ---- Shape and strength: the same as the random tokens they replace
const t = await portalLinkToken(SECRET, 'em_1', 0)
ok(/^[A-Za-z0-9_-]{32}$/.test(t), `a link token is 32 base64url characters, 192 bits: ${t}`)
const code = await qrTicketCode(SECRET, 'em_1', 0)
ok(/^AAFE-[0-9A-F]{32}$/.test(code), `a QR code is AAFE- and 32 uppercase hex characters, 128 bits: ${code}`)

// ---- The fix: the same attempt of the same email always rebuilds the same token
ok(await portalLinkToken(SECRET, 'em_1', 0) === t, 'a retry of the same attempt rebuilds the same link')
ok(await qrTicketCode(SECRET, 'em_1', 0) === code, 'and the same QR code')

// ---- Everything else gets its own token
const seen = new Set<string>()
for (const id of ['em_1', 'em_2', 'em_3']) for (const attempt of [0, 1, 2, 3, 4]) seen.add(await portalLinkToken(SECRET, id, attempt))
ok(seen.size === 15, `every email and every attempt gets its own link (${seen.size} of 15)`)
ok(await portalLinkToken(OTHER, 'em_1', 0) !== t, 'another secret gives another link: without the secret a link cannot be worked out')
ok(!code.includes(t.slice(0, 8).toUpperCase()) && await qrTicketCode(SECRET, 'em_1', 1) !== code, 'a QR code is not the link in another form, and a new attempt gets a new code')

// ---- A missing or weak secret stops sending, it never falls back to a guessable link
ok(linkSecretProblem('') === 'LINK_TOKEN_SECRET is not set', 'no secret: emails wait in the queue')
ok(linkSecretProblem('x'.repeat(MIN_SECRET_LENGTH - 1))?.includes(`${MIN_SECRET_LENGTH} characters`) === true, 'a short secret is refused')
ok(linkSecretProblem(SECRET) === null, 'a 32+ character secret is accepted')
const refused = async (f: () => Promise<string>) => { try { await f(); return false } catch (e) { return e instanceof Error } }
ok(await refused(() => portalLinkToken('', 'em_1', 0)) && await refused(() => qrTicketCode('short', 'em_1', 0)), 'no token is made without a usable secret')
ok(await refused(() => portalLinkToken(SECRET, '', 0)), 'no token without an email id')
ok(await refused(() => portalLinkToken(SECRET, 'em_1', -1)) && await refused(() => portalLinkToken(SECRET, 'em_1', 1.5)), 'no token for an attempt that is not a whole number')

// ---- The retry Gaelen described, against a stand-in that follows Resend's documented Idempotency-Key rules:
// the same key with the same body within 24 hours returns the first send and sends nothing; the same key with a
// different body is refused with a 409 (resend.com/docs/dashboard/emails/idempotency-keys).
function fakeResend() {
  const byKey = new Map<string, string>(), inbox: string[] = []
  const send = (key: string, body: string) => {
    const first = byKey.get(key)
    if (first === undefined) { byKey.set(key, body); inbox.push(body); return 200 }
    return first === body ? 200 : 409
  }
  return { send, inbox }
}
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
/** One email's journey: attempt 0 is accepted, its save fails, the claim lapses, and the next run tries again. */
async function journey(makeToken: () => Promise<string>) {
  const resend = fakeResend(), m = { id: 'em_42', attempts: 0 }
  let saved: string | null = null
  const run = async (saveWorks: boolean) => {
    const token = await makeToken(), body = `Name your guests: https://portal.example.org/#/s/${token}`
    const status = resend.send(`${m.id}-${m.attempts}`, body)
    if (status !== 200) { m.attempts++; return status }                 // email_mark_failed: a new attempt next run
    if (saveWorks) saved = hash(token)                                  // email_mark_sent
    return status
  }
  const first = await run(false)                                       // delivered, but the save fails
  const retry = await run(true)                                        // 10 minutes later, the database is back
  const linkInFirstEmail = resend.inbox[0].split('#/s/')[1]
  return { first, retry, emails: resend.inbox.length, firstLinkWorks: saved === hash(linkInFirstEmail) }
}
const before = await journey(async () => { const b = new Uint8Array(24); crypto.getRandomValues(b); return Buffer.from(b).toString('base64url') })
ok(before.retry === 409 && !before.firstLinkWorks, `before (a random link on every build): the retry is refused and the sponsor's link never works ${JSON.stringify(before)}`)
const after = await journey(() => portalLinkToken(SECRET, 'em_42', 0))
ok(after.first === 200 && after.retry === 200, `after: Resend accepts the retry as the same email ${JSON.stringify(after)}`)
ok(after.emails === 1, 'the sponsor gets one email, not two')
ok(after.firstLinkWorks, 'and the link in it works once the save goes through')

// ---- Gaelen's second case (Nov 10): the same journey, but staff rename the gala before the retry. Rebuilt, the retry
// carries the same link in a different email, and Resend refuses it too. send-emails now saves each attempt's request
// before sending it (email_save_snapshot: once per attempt, cleared when the email is sent or the attempt fails) and
// resends that on a retry of the same attempt. Everything below follows those rules.
const linkIn = (body: string) => /#\/s\/([A-Za-z0-9_-]+)/.exec(body)?.[1] ?? ''
async function renamedJourney(resendSaved: boolean) {
  const resend = fakeResend(), m = { id: 'em_43', attempts: 0 }, stored: string[] = []
  let title = 'AAFE Gala 2027', saved: string | null = null, snapshot: { attempt: number; body: string } | null = null
  const run = async (saveWorks: boolean) => {
    const token = await portalLinkToken(SECRET, m.id, m.attempts), secrets = [{ placeholder: LINK_TOKEN, value: token }]
    let body: string
    if (resendSaved && snapshot?.attempt === m.attempts) body = thawRequest(snapshot.body, secrets)
    else {
      body = JSON.stringify({ subject: `Add your guests for ${title}`, html: `<a href="https://portal.example.org/#/s/${token}">Name your guests</a>` })
      if (resendSaved) { snapshot = { attempt: m.attempts, body: freezeRequest(body, secrets) }; stored.push(snapshot.body) }
    }
    const status = resend.send(`${m.id}-${m.attempts}`, body)
    if (status !== 200) { m.attempts++; snapshot = null; return status }  // email_mark_failed
    if (saveWorks) { saved = hash(token); snapshot = null }                // email_mark_sent
    return status
  }
  const first = await run(false)                                        // delivered, but the save fails
  title = 'AAFE 53rd Annual Gala'                                      // staff rename the gala
  const retry = await run(true)                                        // 10 minutes later
  return { first, retry, emails: resend.inbox.length, firstLinkWorks: saved === hash(linkIn(resend.inbox[0])), stored }
}
const rebuilt = await renamedJourney(false)
ok(rebuilt.retry === 409 && !rebuilt.firstLinkWorks, `before (the email rebuilt on the retry): the renamed gala makes it a different email, Resend refuses it, and the sponsor's link never works ${JSON.stringify({ ...rebuilt, stored: undefined })}`)
const resent = await renamedJourney(true)
ok(resent.first === 200 && resent.retry === 200 && resent.emails === 1, 'after: the retry resends the saved request, Resend recognizes it, and the sponsor gets one email')
ok(resent.firstLinkWorks, 'and the link in it works once the save goes through')
const t43 = await portalLinkToken(SECRET, 'em_43', 0)
ok(resent.stored.length === 1 && !resent.stored[0].includes(t43) && resent.stored[0].includes(LINK_TOKEN),
  'what the database keeps has a placeholder where the link was, never the link (hard rule 6)')

// The QR invitation: its code is in the email and in the attached image; neither is kept.
const qr = await qrTicketCode(SECRET, 'em_44', 0), image = Buffer.from(`png bytes that encode ${qr}`).toString('base64')
const qrSecrets = [{ placeholder: QR_IMAGE, value: image }, { placeholder: QR_CODE, value: qr }]
const qrBody = JSON.stringify({ subject: 'Your entry pass', html: `<p>${qr}</p>`, attachments: [{ filename: 'aafe-gala-entry-qr.png', content: image }] })
const qrFrozen = freezeRequest(qrBody, qrSecrets)
ok(!qrFrozen.includes(qr) && !qrFrozen.includes(image) && qrFrozen.includes(QR_CODE) && qrFrozen.includes(QR_IMAGE), 'a saved QR invitation keeps neither the code nor the image')
ok(thawRequest(qrFrozen, qrSecrets) === qrBody, 'and a retry puts both back: the identical request')

// Refusals: never store a secret, never send a half-filled email.
const throws = (f: () => unknown) => { try { f(); return false } catch (e) { return e instanceof Error } }
ok(throws(() => freezeRequest('{"html":"no link here"}', [{ placeholder: LINK_TOKEN, value: t43 }])), 'an email without its link is not saved')
ok(throws(() => freezeRequest(`{"html":"${t43} {{aafe:link_token}}"}`, [{ placeholder: LINK_TOKEN, value: t43 }])),
  'an email that already contains placeholder text (a name typed as one, say) is not saved: putting the link back would go wrong')
ok(throws(() => thawRequest('{"html":"no placeholder"}', [{ placeholder: LINK_TOKEN, value: t43 }])), 'a saved request without the placeholder is not sent')
ok(throws(() => thawRequest(qrFrozen, [{ placeholder: QR_CODE, value: qr }])), 'nor one with a placeholder this attempt cannot fill')
ok(throws(() => thawRequest(qrFrozen, [{ placeholder: QR_IMAGE, value: '' }, { placeholder: QR_CODE, value: qr }])), 'nor one filled with nothing')

console.log(`link tokens: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
