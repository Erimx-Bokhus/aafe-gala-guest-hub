// Sponsor guest-list links and QR e-ticket codes (team hard rule 6), one per send attempt of one email, kept apart from
// Deno.serve so Node can test them (scripts/test-link-token.mts).
//
// A token is derived, not drawn at random: HMAC-SHA-256 of the email's id and attempt number under LINK_TOKEN_SECRET,
// a server-only secret of at least 32 characters. Without the secret it is just as unguessable as a random token, it
// keeps its size (192 bits for a link, 128 for a QR code), and still only its SHA-256 hash is stored (email_mark_sent).
//
// What deriving adds: a retry of the same attempt rebuilds the same link. If Resend accepted an email but saving its
// link failed, the next run sends the identical email under the same Idempotency-Key, and Resend answers with the first
// send instead of sending again. The save then goes through, and the link the sponsor already has starts working. With
// a random token the retry carried a new link, Resend refused it (409: same key, different body), and the sponsor was
// left holding a link that never worked (Gaelen Hallenbeck's review, Nov 9).
// A new attempt (a failed send counts one, email_mark_failed) gets a new token, as before.

export const MIN_SECRET_LENGTH = 32

/** Why LINK_TOKEN_SECRET can't be used, or null when it can. */
export function linkSecretProblem(secret: string): string | null {
  if (!secret) return 'LINK_TOKEN_SECRET is not set'
  if (secret.length < MIN_SECRET_LENGTH) return `LINK_TOKEN_SECRET must be at least ${MIN_SECRET_LENGTH} characters`
  return null
}

/** The 32 bytes behind one token: what it is for, which email, which attempt. */
async function attemptBytes(secret: string, purpose: 'portal' | 'qr', emailId: string, attempt: number): Promise<Uint8Array> {
  const problem = linkSecretProblem(secret)
  if (problem) throw new Error(problem)
  if (!emailId) throw new Error('A link needs the id of the email it goes in')
  if (!Number.isInteger(attempt) || attempt < 0) throw new Error(`A link needs a whole attempt number, not ${String(attempt)}`)
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${purpose}\n${emailId}\n${attempt}`)))
}

/** The token in a sponsor's guest-list link: 24 bytes (192 bits) in base64url, the same shape as before. */
export async function portalLinkToken(secret: string, emailId: string, attempt: number): Promise<string> {
  const b = (await attemptBytes(secret, 'portal', emailId, attempt)).slice(0, 24)
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A QR e-ticket code: 'AAFE-' + 32 uppercase hex characters (128 bits), the format check-in reads. */
export async function qrTicketCode(secret: string, emailId: string, attempt: number): Promise<string> {
  const b = (await attemptBytes(secret, 'qr', emailId, attempt)).slice(0, 16)
  return 'AAFE-' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase()
}
