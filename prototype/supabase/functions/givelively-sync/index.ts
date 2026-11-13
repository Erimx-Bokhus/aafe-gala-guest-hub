// Polls Give Lively's Zapier JSON endpoint and imports new gala purchases.
// Runs every 15 minutes from pg_cron (database/cron.sql); a gala_admin can also
// trigger it from the staff app ("Pull now").
//
// Secrets: GIVELIVELY_ORG_ID, GIVELIVELY_API_KEY (Nonprofit Admin Portal -> Zapier API key), CRON_SECRET.
// Which donations are gala sales: the current gala's Give Lively pages (gala_events.givelively_page_name, e.g.
// "AAFE's 52nd Annual Gala", and givelively_other_pages, e.g. its Community Tickets page), set by staff in the staff app. Not set -> the sync does nothing and says so. Demo: GIVELIVELY_BASE_URL points at the givelively-mock function instead of Give Lively.
import { canAdvance, NOT_CONNECTED, pollFailure, pollStart, SAVE_FAILURE, syncDonations, withoutKey } from '../_shared/givelively-sync.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { admin, caller, cors, env, json } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const who = await caller(req, ['gala_admin'])
  if (!who) return json({ error: 'forbidden' }, 403)

  const org = env('GIVELIVELY_ORG_ID'), key = env('GIVELIVELY_API_KEY')
  if (!org || !key) return json({ error: 'not_configured', message: NOT_CONNECTED }, 500)   // GIVELIVELY_ORG_ID, GIVELIVELY_API_KEY

  const db = admin()
  // The gala being run now (current_event_id, in the database), never the newest open year: next year's gala in
  // planning must not take the sync over.
  const { data: pages, error: pageError } = await db.rpc('sync_gala_pages')
  if (pageError) return json({ error: 'db_error', message: pageError.message }, 500)
  const campaigns = (Array.isArray(pages) ? pages : []).filter((p): p is string => typeof p === 'string' && p.trim() !== '').map((p) => p.trim())
  if (!campaigns.length) return json({ error: 'not_configured', message: "Set this gala's Give Lively page name in the staff app first." }, 500)
  return await runSync(db, { org, key, campaigns, actor: who === 'schedule' ? 'Give Lively sync' : `Give Lively sync (${who})` })
})

/**
 * One poll: the donations Give Lively changed since the last one, imported one by one, and the cursor moved on, unless
 * a donation could be neither imported nor recorded: then the cursor stays and the next poll reads it again.
 */
async function runSync(db: SupabaseClient, o: { org: string; key: string; campaigns: string[]; actor: string }): Promise<Response> {
  const { org, key, campaigns, actor } = o
  const startedAt = Date.now()
  const { data: state } = await db.from('givelively_sync_state').select('cursor_ms').eq('id', 1).single()
  const base = (env('GIVELIVELY_BASE_URL') || 'https://secure.givelively.org').replace(/\/$/, '')
  const url = new URL(`${base}/nonprofits/${encodeURIComponent(org)}/json_dataclips/${encodeURIComponent(key)}.json`)
  const start = pollStart(state?.cursor_ms)
  if (start) url.searchParams.set('start_time_ms', String(start))

  // Staff get what to do; the raw detail is kept for the technical partner in givelively_sync_state.last_error.
  const fail = async (status: number | null, detail: string) => {
    await db.from('givelively_sync_state').update({ last_run_at: new Date().toISOString(), last_status: 'error', last_error: detail }).eq('id', 1)
    return json({ error: 'givelively_error', message: pollFailure(status) }, 502)
  }

  let donations: unknown[]
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    // 404 = bad org ID or API key (per Give Lively docs). Never log the URL: it contains the key.
    if (res.status === 404) return await fail(404, 'Give Lively rejected the org ID or API key (404).')
    if (!res.ok) return await fail(res.status, `Give Lively returned HTTP ${res.status}.`)
    const body = await res.json()
    donations = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : []
  } catch (e) {
    return await fail(null, `Could not reach Give Lively: ${withoutKey(e instanceof Error ? e.message : String(e), key)}`)
  }

  // Per-donation rules: _shared/givelively-sync.ts (tested in scripts/test-givelively-sync.mts).
  const counts = await syncDonations(donations, campaigns, {
    importRow: async (row) => {
      const { data, error } = await db.rpc('gl_import', { p_rows: [row], p_actor: actor })
      return { data, error: error?.message ?? null }
    },
    saveRaw: async (rec) => {
      const { error } = await db.from('givelively_raw').upsert(rec)
      return { error: error?.message ?? null }
    },
  })

  if (!canAdvance(counts)) {
    // No cursor_ms in this update: the cursor stays where it was, so the next poll reads these donations again.
    const detail = `${counts.lost} donation(s) could be neither imported nor recorded in givelively_raw; the cursor was not moved.`
    const { error } = await db.from('givelively_sync_state').update({ last_run_at: new Date().toISOString(), last_status: 'error', last_error: detail, last_counts: counts }).eq('id', 1)
    return json({ error: 'givelively_not_saved', message: SAVE_FAILURE, counts, status_saved: !error }, 500)
  }
  await db.from('givelively_sync_state').update({ cursor_ms: startedAt, last_run_at: new Date().toISOString(), last_status: 'ok', last_error: null, last_counts: counts }).eq('id', 1)
  return json(counts)
}
