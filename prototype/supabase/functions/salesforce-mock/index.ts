// DEMO ONLY: a stand-in Salesforce org; the records land in demo_salesforce_records (database/demo_salesforce.sql).
// Answers the one call salesforce-push makes, the way Salesforce's REST API does:
//   PATCH .../salesforce-mock/services/data/v61.0/composite/sobjects/<sObject>/AAFE_Gala_Id__c
//   Authorization: Bearer <SALESFORCE_TOKEN>    body: { allOrNone: false, records: [...] }  (at most 200)
//   -> [{ id, success, created, errors }], one per record, in order
// Point salesforce-push at it with SALESFORCE_BASE_URL=https://<PROJECT-REF>.supabase.co/functions/v1/salesforce-mock
import { admin, cors, env, json } from '../_shared/supabase.ts'

const SOBJECTS = new Set(['Campaign', 'Account', 'Opportunity', 'npe01__OppPayment__c', 'Contact', 'CampaignMember'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const token = env('SALESFORCE_TOKEN')
  if (!token || req.headers.get('Authorization') !== `Bearer ${token}`) return json([{ errorCode: 'INVALID_SESSION_ID', message: 'Session expired or invalid' }], 401)

  const m = new URL(req.url).pathname.match(/\/services\/data\/v[\d.]+\/composite\/sobjects\/(\w+)\/AAFE_Gala_Id__c$/)
  if (req.method !== 'PATCH' || !m || !SOBJECTS.has(m[1])) return json([{ errorCode: 'NOT_FOUND', message: 'The requested resource does not exist' }], 404)
  const body = await req.json().catch(() => null)
  if (!Array.isArray(body?.records) || body.records.length < 1 || body.records.length > 200) {
    return json([{ errorCode: 'INVALID_FIELD', message: 'records: between 1 and 200' }], 400)
  }
  const { data, error } = await admin().rpc('demo_salesforce_upsert', { p_sobject: m[1], p_records: body.records })
  return error ? json([{ errorCode: 'UNKNOWN_EXCEPTION', message: error.message }], 500) : json(data)
})
