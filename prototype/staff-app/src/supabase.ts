// Staff sign-in through Supabase Auth (issue #8).
// LIVE (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY set in staff-app/.env.local): staff sign in with a one-time
//   email link, and their name and role come from staff_users through staff_me() (database/backend.sql).
// DEMO (no env, e.g. OPEN-Staff-App.html): `supabase` is null and the login page offers the synthetic demo accounts.
import { createClient } from '@supabase/supabase-js'
import type { StaffUser } from '@shared/types'

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

// The signed-in person's staff_users row, or null when nobody is signed in or their email isn't on the staff list.
export async function currentStaff(): Promise<StaffUser | null> {
  if (!supabase) return null
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const { data, error } = await supabase.rpc('staff_me')
  if (error) throw error
  return (data as StaffUser | null) ?? null
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut()
}
