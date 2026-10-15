// Staff sign-in through Supabase Auth (issue #8), shared by the staff app and the iPad check-in app.
// LIVE (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY set in the app's .env.local): staff sign in from one email that
//   carries both a link and a 6-digit code, and their name and role come from staff_users through staff_me()
//   (database/backend.sql).
// DEMO (no env, e.g. OPEN-Staff-App.html): `supabase` is null and the login page offers the synthetic demo accounts.
import { createClient, type EmailOtpType } from '@supabase/supabase-js'
import type { Role, StaffUser } from '@shared/types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// PKCE puts the sign-in code in the query string (?code=...), so it doesn't collide with the app's #/ routes.
export const supabase = url && key
  ? createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } })
  : null

// Emails a one-time sign-in link. shouldCreateUser: false, so only staff an admin invited in Supabase can sign in;
// with sign-up also turned off in the dashboard (prototype/docs/BACKEND.md, Setup step 2) nobody can add themselves.
export async function sendSignInLink(email: string): Promise<void> {
  if (!supabase) throw new Error('not_configured')
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + window.location.pathname },
  })
  if (error) throw error
}

// The same email also shows a 6-digit code (the Magic Link template's {{ .Token }}, BACKEND.md Setup step 2).
// Typing it signs in on this page even when the link would open somewhere else: the iPad's Home Screen app keeps
// its own storage apart from Safari, and a PKCE link only works in the browser that asked for it.
export async function verifySignInCode(email: string, code: string): Promise<void> {
  if (!supabase) throw new Error('not_configured')
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.replace(/\s/g, ''), type: 'email' })
  if (error) throw error
}

// A one-time sign-in link made with Supabase's admin tools (`?token_hash=…&type=…`, no email sent), for testing a
// role on the hosted apps. Signs in on this page, then takes the token out of the address. False when there's none.
export async function signInFromLink(): Promise<boolean> {
  if (!supabase) return false
  const q = new URLSearchParams(window.location.search)
  const tokenHash = q.get('token_hash')
  if (!tokenHash) return false
  const type = OTP_TYPES.find((t) => t === q.get('type')) ?? 'magiclink'   // only a type Supabase knows; it came in the address
  q.delete('token_hash'); q.delete('type')
  window.history.replaceState(null, '', window.location.pathname + (q.size ? `?${q}` : '') + window.location.hash)
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error) throw error
  return true
}

// The signed-in person's staff_users row, or null when nobody is signed in or their email isn't on the staff list.
export async function currentStaff(): Promise<StaffUser | null> {
  if (!supabase) return null
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const res: { data: unknown; error: Error | null } = await supabase.rpc('staff_me')
  if (res.error) throw res.error
  return asStaffUser(res.data)
}

const OTP_TYPES: readonly EmailOtpType[] = ['magiclink', 'signup', 'invite', 'recovery', 'email_change', 'email']
const ROLES: readonly Role[] = ['gala_admin', 'relationship_manager', 'check_in_volunteer']
const isRole = (r: unknown): r is Role => ROLES.some((x) => x === r)

/**
 * The staff record staff_me() returned, checked before the app trusts it: the role decides what a person can do, so
 * anything that isn't a known role with text fields stops the sign-in instead of being guessed at (R9).
 */
export function asStaffUser(data: unknown): StaffUser | null {
  if (data == null) return null
  if (typeof data !== 'object') throw new Error('staff_me returned an unexpected answer')
  const r: Record<string, unknown> = { ...data }
  if (typeof r.id !== 'string' || typeof r.name !== 'string' || typeof r.email !== 'string' || !isRole(r.role)) {
    throw new Error('staff_me returned an unexpected staff record')
  }
  return { id: r.id, name: r.name, email: r.email, role: r.role }
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut()
}
