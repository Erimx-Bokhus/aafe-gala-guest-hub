// A send attempt's exact request to Resend, saved before it goes out (email_save_snapshot in backend.sql) so a retry of
// the same attempt resends it unchanged. Kept apart from Deno.serve so Node can test it (scripts/test-link-token.mts).
//
// Why: Resend accepts one request per Idempotency-Key. If it accepted an email but saving that failed, the next run
// tries the same attempt again under the same key. Rebuilt from the database, the email could differ by then (staff
// renamed the gala, a seat was named, the payment was edited), and Resend refuses a different request under a used
// key (409), so the link the sponsor already has would never start working (Gaelen Hallenbeck's review, Nov 10).
// Resent from the snapshot, it is the identical request, and Resend answers with the first send instead.
//
// What it never holds (team hard rule 6): the link token, the QR code and the QR image. Each is replaced by a
// placeholder before saving, and put back on a retry from the same derivation (_shared/linkToken.ts).

/** One value the email carries that must not be stored, and the placeholder that stands in for it. */
export interface Secret { placeholder: string; value: string }

export const LINK_TOKEN = '{{aafe:link_token}}'
export const QR_CODE = '{{aafe:qr_code}}'
export const QR_IMAGE = '{{aafe:qr_image}}'
const PLACEHOLDER = /\{\{aafe:[a-z_]+\}\}/

/** The request as it can be stored: every secret replaced by its placeholder. Refuses rather than store one. */
export function freezeRequest(body: string, secrets: Secret[]): string {
  if (PLACEHOLDER.test(body)) throw new Error('The email already contains placeholder text, so it cannot be saved safely')
  let frozen = body
  for (const s of secrets) {
    if (!s.value) throw new Error(`Nothing to replace with ${s.placeholder}`)
    if (!frozen.includes(s.value)) throw new Error(`The email does not contain the value for ${s.placeholder}`)
    frozen = frozen.split(s.value).join(s.placeholder)
  }
  for (const s of secrets) if (frozen.includes(s.value)) throw new Error(`The value for ${s.placeholder} is still in the email`)
  return frozen
}

/** The stored request with this attempt's secrets put back: the request exactly as it was first sent. */
export function thawRequest(frozen: string, secrets: Secret[]): string {
  let body = frozen
  for (const s of secrets) {
    if (!s.value) throw new Error(`Nothing to put back for ${s.placeholder}`)
    if (!body.includes(s.placeholder)) throw new Error(`The saved email has no ${s.placeholder}`)
    body = body.split(s.placeholder).join(s.value)
  }
  if (PLACEHOLDER.test(body)) throw new Error('The saved email has a placeholder this attempt cannot fill')
  return body
}
