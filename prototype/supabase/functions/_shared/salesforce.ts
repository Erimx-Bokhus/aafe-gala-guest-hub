// What salesforce-push sends to Salesforce (NPSP), kept apart from Deno.serve and the Supabase client so Node can
// test it (scripts/test-salesforce.mts). Give Lively's own connector already sends its online donations; this sends
// what Give Lively doesn't know, read from salesforce_outbox() in backend.sql: the gala, check, ACH, wire, comp and
// staff-entered orders with their sponsors and payments, and every named guest with their gala-night status.
//
// Records are upserted on our ids in a custom external-ID field, so sending again updates instead of duplicating.
// AAFE's org would need that field (Text, External ID, Unique) on each object below before a real connection.

export const EXTERNAL_ID = 'AAFE_Gala_Id__c'
/** Salesforce takes at most 200 records per sObject Collections call. */
export const BATCH = 200

export interface Outbox {
  campaign: { id: string; name: string; date: string } | null
  accounts: { id: string; name: string }[]
  opportunities: { id: string; account_id: string; name: string; amount: number; status: string; close_date: string }[]
  payments: { id: string; order_id: string; amount: number; date: string; method: string }[]
  contacts: { id: string; first: string | null; last: string; email: string | null; status: string }[]
}
export interface SfRecord { attributes: { type: string }; [field: string]: unknown }
/** One record's outcome, in the shape salesforce_mark_synced() reads. */
export interface SyncResult { entity: string; entity_id: string; sf_object: string; sf_id: string | null; error: string | null }
/** Salesforce's answer for one record of an sObject Collections upsert. */
export interface SfAnswer { id?: string; success: boolean; errors?: { statusCode?: string; message: string }[] }
export interface PushPorts { upsert(sobject: string, records: SfRecord[]): Promise<SfAnswer[]> }

const ref = (id: string) => ({ [EXTERNAL_ID]: id })
// NPSP's default stages. A comp is a gift with nothing owed, so it counts as won.
const STAGE: Record<string, string> = { paid: 'Closed Won', comp: 'Closed Won', cancelled: 'Closed Lost', pledged: 'Pledged', partially_paid: 'Pledged', invoice_sent: 'Pledged' }
const METHOD: Record<string, string> = { check: 'Check', ach_direct: 'ACH', wire: 'Wire' }

/** Each sObject in the order Salesforce needs it (a record's parents first), with the entity it came from. */
export function toBatches(o: Outbox): { sobject: string; entity: string; ids: string[]; records: SfRecord[] }[] {
  const rec = (type: string, id: string, fields: Record<string, unknown>): SfRecord => ({ attributes: { type }, [EXTERNAL_ID]: id, ...fields })
  const gala = o.campaign
  const batch = <T extends { id: string }>(sobject: string, entity: string, rows: T[], make: (r: T) => SfRecord) =>
    ({ sobject, entity, ids: rows.map((r) => r.id), records: rows.map(make) })
  // Campaign members carry their campaign's id, so there are none without a gala.
  const members = gala ? o.contacts.map((c) => ({ ...c, campaignId: gala.id })) : []
  return [
    batch('Campaign', 'gala', gala ? [gala] : [], (c) => rec('Campaign', c.id, { Name: c.name, StartDate: c.date, Type: 'Event', IsActive: true })),
    batch('Account', 'sponsor', o.accounts, (a) => rec('Account', a.id, { Name: a.name })),
    batch('Opportunity', 'order', o.opportunities, (p) => rec('Opportunity', p.id, {
      Name: p.name, Amount: p.amount, CloseDate: p.close_date, StageName: STAGE[p.status] ?? 'Pledged', Account: ref(p.account_id), ...(gala ? { Campaign: ref(gala.id) } : {}) })),
    batch('npe01__OppPayment__c', 'payment', o.payments, (p) => rec('npe01__OppPayment__c', p.id, {
      npe01__Opportunity__r: ref(p.order_id), npe01__Payment_Amount__c: p.amount, npe01__Payment_Date__c: p.date, npe01__Payment_Method__c: METHOD[p.method] ?? p.method, npe01__Paid__c: true })),
    // Contacts carry a name and, when there is one, an email: no phones, dietary or accessibility details.
    batch('Contact', 'guest', o.contacts, (c) => rec('Contact', c.id, { FirstName: c.first, LastName: c.last, Email: c.email })),
    batch('CampaignMember', 'guest', members, (c) => rec('CampaignMember', c.id, { Campaign: ref(c.campaignId), Contact: ref(c.id), Status: c.status })),
  ]
}

/** Sends every batch in order, 200 records a call, and returns each record's outcome (a failed call fails its records, not the run). */
export async function pushAll(o: Outbox, ports: PushPorts): Promise<SyncResult[]> {
  const results: SyncResult[] = []
  for (const b of toBatches(o)) {
    for (let i = 0; i < b.records.length; i += BATCH) {
      const records = b.records.slice(i, i + BATCH), ids = b.ids.slice(i, i + BATCH)
      let answers: SfAnswer[]
      try { answers = await ports.upsert(b.sobject, records) } catch (e) { answers = records.map(() => ({ success: false, errors: [{ message: (e as Error).message }] })) }
      ids.forEach((id, k) => {
        const a = answers[k]
        const error = a?.success ? null : (a?.errors ?? []).map((x) => (x.statusCode ? `${x.statusCode}: ${x.message}` : x.message)).join('; ') || 'No answer from Salesforce'
        results.push({ entity: b.entity, entity_id: id, sf_object: b.sobject, sf_id: a?.success ? a.id ?? null : null, error })
      })
    }
  }
  return results
}

/** What one push did, for the staff app's message. */
export function summarize(results: SyncResult[]) {
  const by: Record<string, number> = {}
  for (const r of results) if (!r.error) by[r.sf_object] = (by[r.sf_object] ?? 0) + 1
  const failed = results.filter((r) => r.error)
  return { sent: results.length - failed.length, failed: failed.length, by_object: by, first_error: failed[0]?.error ?? null }
}
