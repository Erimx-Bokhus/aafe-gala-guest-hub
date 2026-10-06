import { normEmail } from './normalize.ts'

/**
 * Purchase key (spec section 2): SHA-256 of "<buyer email, trimmed and lower-cased>|<purchase time in UTC,
 * to the second>". The tier is left out on purpose, so a tier renamed mid-campaign doesn't turn a past
 * purchase into a new one. The CSV upload and the JSON sync both use this function, so they recognize
 * each other's purchases.
 *
 * Uses Web Crypto, so it runs the same in Node, Deno (Supabase Edge Functions), and the browser.
 */
export async function purchaseKey(email: string, purchasedAtUtc: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${normEmail(email)}|${purchasedAtUtc}`)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
