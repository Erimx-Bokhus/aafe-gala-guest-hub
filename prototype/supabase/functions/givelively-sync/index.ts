// Polls Give Lively's Zapier JSON endpoint and imports new gala purchases.
// Runs every 15 minutes from pg_cron (database/cron.sql); a gala_admin can also
// trigger it from the staff app ("Pull now").
//
// Secrets: GIVELIVELY_ORG_ID, GIVELIVELY_API_KEY (Nonprofit Admin Portal -> Zapier API key), CRON_SECRET.
// Which donations are gala sales: the current gala's Give Lively page name (gala_events.givelively_page_name,
// e.g. "AAFE's 52nd Annual Gala"), set by staff in the staff app. Not set -> the sync does nothing and says so. Demo: GIVELIVELY_BASE_URL points at the givelively-mock function instead of Give Lively.
import { pollStart, syncDonations } from '../_shared/givelively-sync.ts'
import { admin, caller, cors, env, json } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const who = await caller(req, ['gala_admin'])
  if (!who) return json({ error: 'forbidden' }, 403)

  const org = env('GIVELIVELY_ORG_ID'), key = env('GIVELIVELY_API_KEY')
  if (!org || !key) return json({ error: 'not_configured', message: 'Set GIVELIVELY_ORG_ID and GIVELIVELY_API_KEY.' }, 500)

  const db = admin()
  const { data: gala } = await db.from('gala_events').select('givelively_page_name').neq('status', 'closed').order('year', { ascending: false }).limit(1).maybeSingle()
  const pageName = gala?.givelively_page_name?.trim()
  if (!pageName) return json({ error: 'not_configured', message: "Set this gala's Give Lively page name in the staff app first." }, 500)
  const campaigns = [pageName]
  const startedAt = Date.now()
  const { data: state } = await db.from('givelively_sync_state').select('cursor_ms').eq('id', 1).single()
  const base = (env('GIVELIVELY_BASE_URL') || 'https://secure.givelively.org').replace(/\/$/, '')
  const url = new URL(`${base}/nonprofits/${encodeURIComponent(org)}/json_dataclips/${encodeURIComponent(key)}.json`)
  const start = pollStart(state?.cursor_ms)
  if (start) url.searchParams.set('start_time_ms', String(start))

  const fail = async (message: string, status = 502) => {
    await db.from('givelively_sync_state').update({ last_run_at: new Date().toISOString(), last_status: 'error', last_error: message }).eq('id', 1)
    return json({ error: 'givelively_error', message }, status)
  }

  let donations: unknown[]
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    // 404 = bad org ID or API key (per Give Lively docs). Never log the URL: it contains the key.
    if (res.status === 404) return await fail('Give Lively rejected the org ID or API key (404).')
    if (!res.ok) return await fail(`Give Lively returned HTTP ${res.status}.`)
    const body = await res.json()
    donations = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : []
  } catch (e) {
    return await fail(`Could not reach Give Lively: ${(e as Error).message}`)
  }

  const actor = who === 'schedule' ? 'Give Lively sync' : `Give Lively sync (${who})`
  // Per-donation rules: _shared/givelively-sync.ts (tested in scripts/test-givelively-sync.mts).
  const counts = await syncDonations(donations, campaigns, {
    importRow: async (row) => {
      const { data, error } = await db.rpc('gl_import', { p_rows: [row], p_actor: actor })
      return { data, error: error?.message ?? null }
    },
    saveRaw: async (rec) => { await db.from('givelively_raw').upsert(rec) },
  })

  await db.from('givelively_sync_state').update({ cursor_ms: startedAt, last_run_at: new Date().toISOString(), last_status: 'ok', last_error: null, last_counts: counts }).eq('id', 1)
  return json(counts)
})
