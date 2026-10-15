// DEMO ONLY: a fake Give Lively account (synthetic data in demo_givelively_donations).
// Behaves like Give Lively's Zapier JSON endpoints so givelively-sync runs unchanged:
//   GET  .../givelively-mock/nonprofits/<ORG_ID>/json_dataclips/validate/<API_KEY>.json -> { success: true }
//   GET  .../givelively-mock/nonprofits/<ORG_ID>/json_dataclips/<API_KEY>.json?start_time_ms=
//        -> donations modified since then, newest first; 404 if org ID or key is wrong
// Plus, to stage a live purchase during a demo (cron secret or gala_admin):
//   POST .../givelively-mock/purchase  { company, first, last, email, ticket_level, amount, method?, quantity?, donor_covers_fee? }
// Point the sync at it with GIVELIVELY_BASE_URL=https://<PROJECT-REF>.supabase.co/functions/v1/givelively-mock
import { admin, caller, cors, env, json } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = new URL(req.url)
  if (req.method === 'POST' && url.pathname.endsWith('/purchase')) return await purchase(req)
  return await dataclips(req, url)
})

/** Stages a live purchase during a demo (cron secret or gala_admin). */
async function purchase(req: Request): Promise<Response> {
  if (!(await caller(req, ['gala_admin']))) return json({ error: 'forbidden' }, 403)
  const b: Record<string, unknown> = await req.json().catch(() => ({}))
  const text = (k: string, fallback = '') => (typeof b[k] === 'string' ? b[k] : fallback)
  if (!text('email') || !text('ticket_level') || !(Number(b.amount) > 0)) return json({ error: 'invalid_input', message: 'email, ticket_level and amount are required' }, 400)
  const { data, error } = await admin().rpc('demo_givelively_purchase', {
    p_company: text('company'), p_first: text('first'), p_last: text('last'), p_email: text('email'), p_ticket_level: text('ticket_level'),
    p_amount: Number(b.amount), p_method: text('method', 'Credit Card'), p_quantity: Number(b.quantity ?? 1),
    p_donor_covers_fee: Boolean(b.donor_covers_fee), p_campaign: text('campaign', 'AAFE Gala 2027'),
  })
  return error ? json({ error: 'db_error', message: error.message }, 500) : json(data)
}

/** Give Lively's two Zapier JSON endpoints: validate the key, or the donations modified since a time. */
async function dataclips(req: Request, url: URL): Promise<Response> {
  const m = url.pathname.match(/\/nonprofits\/([^/]+)\/json_dataclips\/(validate\/)?([^/]+)\.json$/)
  if (req.method !== 'GET' || !m) return json({ error: 'not_found' }, 404)
  const [, org = '', validate, key = ''] = m
  if (decodeURIComponent(org) !== env('GIVELIVELY_ORG_ID') || decodeURIComponent(key) !== env('GIVELIVELY_API_KEY')) return json({ error: 'not_found' }, 404)
  if (validate) return json({ success: true })
  let q = admin().from('demo_givelively_donations').select('payload').order('modified_at', { ascending: false })
  const since = Number(url.searchParams.get('start_time_ms'))
  if (since > 0) q = q.gte('modified_at', new Date(since).toISOString())
  const { data, error } = await q
  return error ? json({ error: 'db_error', message: error.message }, 500) : json((data ?? []).map((r) => r.payload))
}
