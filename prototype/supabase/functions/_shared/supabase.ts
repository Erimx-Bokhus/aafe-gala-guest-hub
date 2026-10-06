import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

export const env = (k: string) => Deno.env.get(k) ?? ''

/** Service-role client: bypasses RLS. Use only inside edge functions. */
export const admin = (): SupabaseClient => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/**
 * Allowed callers: pg_cron (x-cron-secret header) or a logged-in staff member with one of `roles`.
 * Returns a label for the audit log, or null if not allowed.
 */
export async function caller(req: Request, roles: string[]): Promise<string | null> {
  const secret = env('CRON_SECRET')
  if (secret && req.headers.get('x-cron-secret') === secret) return 'schedule'
  const auth = req.headers.get('Authorization')
  if (!auth) return null
  const user = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data } = await user.rpc('staff_me')
  return data && roles.includes(data.role) ? data.name : null
}
