// Polls Give Lively's Zapier JSON endpoint and imports new gala purchases.
// Runs every 15 minutes from pg_cron (database/cron.sql); a gala_admin can also
// trigger it from the staff app ("Pull now").
//
// Secrets: GIVELIVELY_ORG_ID, GIVELIVELY_API_KEY (Nonprofit Admin Portal -> Zapier API key),
//          GIVELIVELY_CAMPAIGNS (comma-separated campaign names that are gala sales, e.g. "AAFE Gala 2027"),
//          CRON_SECRET. Demo: GIVELIVELY_BASE_URL points at the givelively-mock function instead of Give Lively.
import { classify, normalize } from '../_shared/givelively.ts'
import { admin, caller, cors, env, json } from '../_shared/supabase.ts'

const OVERLAP_MS = 10 * 60 * 1000 // re-read the last 10 minutes; imports are idempotent

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const who = await caller(req, ['gala_admin'])
  if (!who) return json({ error: 'forbidden' }, 403)

  const org = env('GIVELIVELY_ORG_ID'), key = env('GIVELIVELY_API_KEY')
  const campaigns = env('GIVELIVELY_CAMPAIGNS').split(',').map((s) => s.trim()).filter(Boolean)
  if (!org || !key || !campaigns.length) return json({ error: 'not_configured', message: 'Set GIVELIVELY_ORG_ID, GIVELIVELY_API_KEY and GIVELIVELY_CAMPAIGNS.' }, 500)

  const db = admin()
  const startedAt = Date.now()
  const { data: state } = await db.from('givelively_sync_state').select('cursor_ms').eq('id', 1).single()
  const base = (env('GIVELIVELY_BASE_URL') || 'https://secure.givelively.org').replace(/\/$/, '')
  const url = new URL(`${base}/nonprofits/${encodeURIComponent(org)}/json_dataclips/${encodeURIComponent(key)}.json`)
  if (state?.cursor_ms) url.searchParams.set('start_time_ms', String(state.cursor_ms - OVERLAP_MS))

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

  const counts: Record<string, number> = { seen: donations.length, created: 0, updated: 0, skipped: 0, needs_review: 0, not_gala: 0, not_settled: 0, unmapped: 0 }
  const actor = who === 'schedule' ? 'Give Lively sync' : `Give Lively sync (${who})`
  for (const raw of donations) {
    const row = normalize(raw)
    const verdict = classify(row, campaigns)
    let status = verdict as string, note: string | null = null
    if (verdict === 'import') {
      const { data, error } = await db.rpc('gl_import', { p_rows: [row], p_actor: actor })
      if (error) { status = 'unmapped'; note = error.message }
      else {
        for (const k of ['created', 'updated', 'skipped', 'needs_review']) counts[k] += data[k]
        status = data.created ? 'imported' : data.updated ? 'updated' : 'skipped'
        if (data.needs_review) note = 'Imported; flagged for review in Payments.'
      }
    } else counts[verdict]++
    // Unmapped rows have no reliable ID; key them by content so they are still recorded once.
    const id = row.txn || `unmapped-${await sha256(JSON.stringify(raw))}`
    if (status !== 'not_gala') {
      await db.from('givelively_raw').upsert({ transaction_id: id, payload: raw, last_seen_at: new Date().toISOString(), import_status: status === 'not_settled' ? 'skipped' : status, import_note: note ?? (status === 'not_settled' ? `Status "${row.status}"; will import once settled.` : null) })
    }
  }

  await db.from('givelively_sync_state').update({ cursor_ms: startedAt, last_run_at: new Date().toISOString(), last_status: 'ok', last_error: null, last_counts: counts }).eq('id', 1)
  return json(counts)
})

async function sha256(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24)
}
