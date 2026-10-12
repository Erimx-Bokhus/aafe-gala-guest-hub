// Sends AAFE's Salesforce (NPSP) what Give Lively doesn't know: the gala, check, ACH, wire, comp and staff-entered
// orders with their sponsors and payments, and every named guest with their gala-night status. What goes and how it
// maps: salesforce_outbox() in backend.sql and _shared/salesforce.ts (tested in scripts/test-salesforce.mts).
// A gala admin runs it from the staff app ("Sync now"); a schedule could too (cron secret).
//
// Settings: SALESFORCE_BASE_URL (the org's instance URL; in the demo, the salesforce-mock function) and
// SALESFORCE_TOKEN (an access token). Not set: does nothing and says so. The demo never talks to a real org.
import { EXTERNAL_ID, pushAll, summarize, type SfAnswer, type SfRecord } from '../_shared/salesforce.ts'
import { admin, caller, cors, env, json } from '../_shared/supabase.ts'

const API = 'v61.0'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const who = await caller(req, ['gala_admin'])
  if (!who) return json({ error: 'forbidden' }, 403)

  const base = env('SALESFORCE_BASE_URL').replace(/\/$/, ''), token = env('SALESFORCE_TOKEN')
  if (!base || !token) return json({ error: 'not_configured', message: 'Set SALESFORCE_BASE_URL and SALESFORCE_TOKEN.' }, 500)

  const db = admin()
  const { data: outbox, error } = await db.rpc('salesforce_outbox')
  if (error) return json({ error: 'db_error', message: error.message }, 500)

  // One sObject Collections upsert per batch (Salesforce REST API), matched on our ids. Never log the token.
  const results = await pushAll(outbox, {
    upsert: async (sobject: string, records: SfRecord[]) => {
      const res = await fetch(`${base}/services/data/${API}/composite/sobjects/${sobject}/${EXTERNAL_ID}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ allOrNone: false, records }),
      })
      if (!res.ok) throw new Error(`Salesforce returned HTTP ${res.status}`)
      return (await res.json()) as SfAnswer[]
    },
  })

  const actor = who === 'schedule' ? 'Salesforce sync' : `Salesforce sync (${who})`
  const { error: e2 } = await db.rpc('salesforce_mark_synced', { p_results: results, p_actor: actor })
  if (e2) return json({ error: 'db_error', message: e2.message }, 500)
  return json(summarize(results))
})
