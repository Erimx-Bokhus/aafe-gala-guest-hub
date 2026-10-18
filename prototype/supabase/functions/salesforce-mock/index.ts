// DEMO ONLY: a stand-in Salesforce org; the records land in demo_salesforce_records (database/demo_salesforce.sql).
// Answers the calls salesforce-push makes, the way Salesforce's REST API does (Authorization: Bearer <SALESFORCE_TOKEN>):
//   GET   .../salesforce-mock/services/data/v61.0/query?q=<SOQL>      -> { totalSize, done, records }  (soql.ts reads it)
//   PATCH .../composite/sobjects/<sObject>/AAFE_Gala_Id__c            upsert on our id   } body { allOrNone: false,
//   POST  .../composite/sobjects   create;   PATCH .../composite/sobjects   update by Id  }   records: [...] } (1 to 200)
//   -> [{ id, success, created, errors }], one per record, in order
// Point salesforce-push at it with SALESFORCE_BASE_URL=https://<PROJECT-REF>.supabase.co/functions/v1/salesforce-mock
import { admin, cors, env, json } from '../_shared/supabase.ts'
import { parseSoql } from './soql.ts'

const SOBJECTS = new Set(['Campaign', 'Account', 'Opportunity', 'npe01__OppPayment__c', 'Contact', 'CampaignMember'])
const notFound = () => json([{ errorCode: 'NOT_FOUND', message: 'The requested resource does not exist' }], 404)
const answer = ({ data, error }: { data: unknown; error: { message: string } | null }, wrap = (d: unknown) => d) =>
  error ? json([{ errorCode: 'UNKNOWN_EXCEPTION', message: error.message }], 500) : json(wrap(data))

/** GET .../query?q=<SOQL>, in the shapes salesforce-push sends. */
async function query(url: URL) {
  let q
  try { q = parseSoql(url.searchParams.get('q') ?? '') } catch (e) { return json([{ errorCode: 'MALFORMED_QUERY', message: (e as Error).message }], 400) }
  if (!SOBJECTS.has(q.sobject)) return json([{ errorCode: 'INVALID_TYPE', message: `sObject type '${q.sobject}' is not supported` }], 400)
  return answer(await admin().rpc('demo_salesforce_query', { p_sobject: q.sobject, p_fields: q.fields, p_any: q.any, p_conds: q.conds }),
    (d) => ({ totalSize: (d as unknown[]).length, done: true, records: d }))
}

/** An sObject Collections upsert on our id (upsertOn: the sObject), or a create (POST) or update (PATCH). */
async function write(req: Request, upsertOn: string | undefined) {
  const body = await req.json().catch(() => null)
  if (!Array.isArray(body?.records) || body.records.length < 1 || body.records.length > 200) {
    return json([{ errorCode: 'INVALID_FIELD', message: 'records: between 1 and 200' }], 400)
  }
  return answer(upsertOn
    ? await admin().rpc('demo_salesforce_upsert', { p_sobject: upsertOn, p_records: body.records })
    : await admin().rpc('demo_salesforce_save', { p_op: req.method === 'POST' ? 'create' : 'update', p_records: body.records }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const token = env('SALESFORCE_TOKEN')
  if (!token || req.headers.get('Authorization') !== `Bearer ${token}`) return json([{ errorCode: 'INVALID_SESSION_ID', message: 'Session expired or invalid' }], 401)

  const url = new URL(req.url)
  const path = url.pathname.match(/\/services\/data\/v[\d.]+\/(query|composite\/sobjects)(?:\/(\w+)\/AAFE_Gala_Id__c)?$/)
  if (!path) return notFound()

  if (path[1] === 'query') return req.method === 'GET' ? query(url) : notFound()
  const upsertOn = path[2]
  if (upsertOn ? req.method !== 'PATCH' || !SOBJECTS.has(upsertOn) : req.method !== 'POST' && req.method !== 'PATCH') return notFound()
  return write(req, upsertOn)
})
