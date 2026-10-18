// Sends AAFE's Salesforce (NPSP) what Give Lively doesn't know: the check, ACH, wire and staff-entered orders with
// their sponsors and payments, and every named guest, comps included, with their gala-night status, without
// duplicating what Give Lively's own connector made. What goes and how it maps: salesforce_outbox() in backend.sql
// and _shared/salesforce.ts (tested in scripts/test-salesforce.mts).
// A gala admin runs it from the staff app ("Sync now"); a schedule could too (cron secret).
//
// Settings: SALESFORCE_BASE_URL (the org's instance URL; in the demo, the salesforce-mock function) and
// SALESFORCE_TOKEN (an access token). Not set: does nothing and says so. The demo never talks to a real org.
import { EXTERNAL_ID, NOT_CONNECTED, pushAll, summarize, type SfAnswer, type SfRecord } from '../_shared/salesforce.ts'
import { admin, caller, cors, env, json } from '../_shared/supabase.ts'

const API = 'v61.0'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const who = await caller(req, ['gala_admin'])
  if (!who) return json({ error: 'forbidden' }, 403)

  const base = env('SALESFORCE_BASE_URL').replace(/\/$/, ''), token = env('SALESFORCE_TOKEN')
  if (!base || !token) return json({ error: 'not_configured', message: NOT_CONNECTED }, 500)

  const db = admin()
  const { data: outbox, error } = await db.rpc('salesforce_outbox')
  if (error) return json({ error: 'db_error', message: error.message }, 500)

  // Salesforce's REST API: SOQL queries and sObject Collections calls. Never log the token.
  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
    if (!res.ok) throw new Error(`Salesforce returned HTTP ${res.status}`)
    return await res.json()
  }
  const send = (method: string, path: string, records: SfRecord[]) =>
    call(`/services/data/${API}/composite/sobjects${path}`, { method, body: JSON.stringify({ allOrNone: false, records }) }) as Promise<SfAnswer[]>
  const results = await pushAll(outbox, {
    query: async (soql: string) => {
      let page = await call(`/services/data/${API}/query?q=${encodeURIComponent(soql)}`)
      const rows = [...page.records]
      // A big answer comes in pages; nextRecordsUrl is a path on the same instance.
      while (!page.done && page.nextRecordsUrl) { page = await call(page.nextRecordsUrl); rows.push(...page.records) }
      return rows
    },
    upsert: (sobject: string, records: SfRecord[]) => send('PATCH', `/${sobject}/${EXTERNAL_ID}`, records),
    save: (op: 'create' | 'update', records: SfRecord[]) => send(op === 'create' ? 'POST' : 'PATCH', '', records),
  })

  const actor = who === 'schedule' ? 'Salesforce sync' : `Salesforce sync (${who})`
  const { error: e2 } = await db.rpc('salesforce_mark_synced', { p_results: results, p_actor: actor })
  if (e2) return json({ error: 'db_error', message: e2.message }, 500)
  return json(summarize(results))
})
