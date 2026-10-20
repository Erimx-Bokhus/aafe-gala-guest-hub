// What salesforce-push sends to Salesforce (NPSP), kept apart from Deno.serve and the Supabase client so Node can
// test it (scripts/test-salesforce.mts). Give Lively's own connector already sends its online purchases: the buyer as
// a Contact (matched by email), an Opportunity, and the event's Campaign with the buyer as a member. This sends what
// Give Lively doesn't know, read from salesforce_outbox() in backend.sql: the check, ACH, wire and staff-entered
// orders with their sponsors and payments, and every named guest, comps included, as a member of the gala's Campaign.
//
// Nothing lands twice next to Give Lively's records (Gate 1, box 5):
// - the gala's Campaign is Give Lively's own when it has made one (same name), else ours;
// - a guest whose email is already on a Contact is that Contact, picked the way Give Lively picks it; it is linked,
//   never overwritten. Only guests Salesforce doesn't know become Contacts, one per email;
// - a guest already in the Campaign keeps that membership; only its status changes;
// - a comp is guests only: no Account, no Opportunity.
// - a sponsor whose name is already on one Account is that Account: linked, never overwritten (Oct 20, review of
//   #190); two or more with that name and nothing is made until staff say which;
// - a guest with no email is skipped: it could only be matched by name, so it would risk a duplicate Contact.
// Settings (optionsFrom): SALESFORCE_SEND_PAYMENTS=false stops payment records, for when NPSP makes its own;
// SALESFORCE_SEND_GUESTS=attended|none limits which guests go (AAFE and Graybox decide; default: all, as before).
// Sign-in (salesforceAccess): a connected app's client id and secret get a fresh token each run; a fixed
// SALESFORCE_TOKEN is only for the demo's stand-in, since a real token expires.
// Our own records are upserted on our ids in a custom external-ID field, so sending again updates instead of
// duplicating. Before a real connection AAFE's org would need that field (Text, External ID, Unique) on Campaign,
// Account, Opportunity, npe01__OppPayment__c and Contact, and Registered, Attended and No Show as member statuses
// on the gala's Campaign.

export const EXTERNAL_ID = 'AAFE_Gala_Id__c'
/** What staff see when salesforce-push can't run (no SALESFORCE_BASE_URL, or no way to sign in). */
export const NOT_CONNECTED = "Salesforce isn't connected: its keys aren't set in Supabase. Ask your technical partner."
/** Salesforce takes at most 200 records per sObject Collections call. */
export const BATCH = 200
/** Emails or ids per lookup query, so its URL stays well under Salesforce's limit. */
export const LOOKUP = 50
/** Where NPSP keeps a Contact's emails. Give Lively matches on all four (its Salesforce integration's documented logic). */
export const EMAIL_FIELDS = ['Email', 'npe01__HomeEmail__c', 'npe01__WorkEmail__c', 'npe01__AlternateEmail__c']

/** Why a guest with no email isn't sent: by name alone it could only be matched wrongly or duplicated. */
export const NO_EMAIL = 'Skipped: no email, so Salesforce could only get a duplicate. Match this guest to their Contact by hand.'

/** What to send, set by AAFE and Graybox (optionsFrom). The defaults send everything, as before. */
export interface PushOptions {
  /** False when NPSP creates its own payment records for a new Opportunity, so payments don't appear twice. */
  payments: boolean
  /** Which guests become Contacts and Campaign members: every named guest, only those who came, or none. */
  guests: 'all' | 'attended' | 'none'
}
export const DEFAULT_OPTIONS: PushOptions = { payments: true, guests: 'all' }
/** The options from the function's settings: SALESFORCE_SEND_PAYMENTS (true|false), SALESFORCE_SEND_GUESTS (all|attended|none). */
export function optionsFrom(get: (key: string) => string): PushOptions {
  const pay = get('SALESFORCE_SEND_PAYMENTS').trim().toLowerCase(), guests = get('SALESFORCE_SEND_GUESTS').trim().toLowerCase()
  return { payments: pay !== 'false', guests: guests === 'attended' || guests === 'none' ? guests : 'all' }
}

/** Where to send and the token to send with. Null when Salesforce isn't connected. */
export interface SfAccess { base: string; token: string }
/** Signs in to Salesforce. With a connected app (SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET) it asks for a
 *  fresh token each run (OAuth client credentials flow, on the org's My Domain URL), since access tokens expire.
 *  Without one, a fixed SALESFORCE_TOKEN: only for the demo's stand-in org. Never logs a secret. */
export async function salesforceAccess(get: (key: string) => string, fetcher: typeof fetch): Promise<SfAccess | null> {
  const base = get('SALESFORCE_BASE_URL').trim().replace(/\/$/, '')
  if (!base) return null
  const id = get('SALESFORCE_CLIENT_ID').trim(), secret = get('SALESFORCE_CLIENT_SECRET').trim()
  if (id && secret) {
    const res = await fetcher(`${base}/services/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }).toString() })
    if (!res.ok) throw new Error(`Salesforce sign-in failed (HTTP ${res.status}): check the connected app's client id and secret`)
    const t = await res.json() as { access_token?: string; instance_url?: string }
    if (!t.access_token) throw new Error('Salesforce sign-in gave no access token')
    return { base: (t.instance_url || base).replace(/\/$/, ''), token: t.access_token }
  }
  const token = get('SALESFORCE_TOKEN').trim()
  return token ? { base, token } : null
}

export interface Outbox {
  campaign: { id: string; name: string; date: string; givelively_name: string | null } | null
  accounts: { id: string; name: string }[]
  opportunities: { id: string; account_id: string; name: string; amount: number; status: string; close_date: string }[]
  payments: { id: string; order_id: string; amount: number; date: string; method: string }[]
  contacts: { id: string; first: string | null; last: string; email: string | null; status: string }[]
}
type Guest = Outbox['contacts'][number]
export interface SfRecord { attributes: { type: string }; [field: string]: unknown }
/** One record's outcome, in the shape salesforce_mark_synced() reads. */
export interface SyncResult { entity: string; entity_id: string; sf_object: string; sf_id: string | null; error: string | null }
/** Salesforce's answer for one record of an sObject Collections call. */
export interface SfAnswer { id?: string; success: boolean; errors?: { statusCode?: string; message: string }[] }
export interface PushPorts {
  /** A SOQL query's rows, every page of them. */
  query(soql: string): Promise<Record<string, unknown>[]>
  /** sObject Collections upsert, matched on our external id. */
  upsert(sobject: string, records: SfRecord[]): Promise<SfAnswer[]>
  /** sObject Collections create (POST), or update by Id (PATCH). */
  save(op: 'create' | 'update', records: SfRecord[]): Promise<SfAnswer[]>
}

/** A SOQL string literal, escaped so a name or an email can't change the query. */
export const soqlText = (s: string) => `'${s.replace(/[\\'"\n\r\t]/g, (c) => '\\' + ({ '\n': 'n', '\r': 'r', '\t': 't' }[c] ?? c))}'`
const ref = (id: string) => ({ [EXTERNAL_ID]: id })
const rec = (type: string, id: string, fields: Record<string, unknown>): SfRecord => ({ attributes: { type }, [EXTERNAL_ID]: id, ...fields })
const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
const why = (a: SfAnswer | undefined) =>
  a?.success ? null : (a?.errors ?? []).map((x) => (x.statusCode ? `${x.statusCode}: ${x.message}` : x.message)).join('; ') || 'No answer from Salesforce'
const emailKey = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '')
/** A record's Salesforce id and the reason it failed, from Salesforce's answer. */
type Outcome = [string | null, string | null]
const outcomeOf = (a: SfAnswer | undefined): Outcome => [a?.success ? a.id ?? null : null, why(a)]
/** One result per guest, in the order Salesforce got them. */
function report(results: SyncResult[], guests: Guest[], sf_object: string, outcome: Map<string, Outcome>) {
  for (const g of guests) {
    const [sf_id, error] = outcome.get(g.id) ?? [null, 'No answer from Salesforce']
    results.push({ entity: 'guest', entity_id: g.id, sf_object, sf_id, error })
  }
}
// NPSP's default stages.
const STAGE: Record<string, string> = { paid: 'Closed Won', cancelled: 'Closed Lost', pledged: 'Pledged', partially_paid: 'Pledged', invoice_sent: 'Pledged' }
const METHOD: Record<string, string> = { check: 'Check', ach_direct: 'ACH', wire: 'Wire' }

/** Opportunities (in the gala's Campaign once it has a Salesforce id) and their payments, parents first. A sponsor
 *  linked to an Account AAFE already has points at it by Id; the rest by our id. Accounts go first (pushAccounts). */
export function toBatches(o: Outbox, campaignId: string | null, linked: Map<string, string> = new Map(), opts: PushOptions = DEFAULT_OPTIONS):
  { sobject: string; entity: string; ids: string[]; records: SfRecord[] }[] {
  const batch = <T extends { id: string }>(sobject: string, entity: string, rows: T[], make: (r: T) => SfRecord) =>
    ({ sobject, entity, ids: rows.map((r) => r.id), records: rows.map(make) })
  const account = (id: string) => (linked.has(id) ? { AccountId: linked.get(id) } : { Account: ref(id) })
  return [
    batch('Opportunity', 'order', o.opportunities, (p) => rec('Opportunity', p.id, {
      Name: p.name, Amount: p.amount, CloseDate: p.close_date, StageName: STAGE[p.status] ?? 'Pledged', ...account(p.account_id), ...(campaignId ? { CampaignId: campaignId } : {}) })),
    ...(opts.payments ? [batch('npe01__OppPayment__c', 'payment', o.payments, (p) => rec('npe01__OppPayment__c', p.id, {
      npe01__Opportunity__r: ref(p.order_id), npe01__Payment_Amount__c: p.amount, npe01__Payment_Date__c: p.date, npe01__Payment_Method__c: METHOD[p.method] ?? p.method, npe01__Paid__c: true }))] : []),
  ]
}

/** Each sponsor's Account: ours if we made it; else the one Account AAFE already has with that name, linked and never
 *  overwritten; else a new one of ours. Two or more with that name and none of ours: nothing is made, and the result
 *  says what to do. If Salesforce can't be asked, nothing is made (it may exist). Returns sponsor -> linked Account id. */
async function pushAccounts(accounts: Outbox['accounts'], ports: PushPorts, results: SyncResult[]): Promise<Map<string, string>> {
  const linked = new Map<string, string>()
  if (!accounts.length) return linked
  const done = (id: string, sf_id: string | null, error: string | null) => results.push({ entity: 'sponsor', entity_id: id, sf_object: 'Account', sf_id, error })
  let rows: Record<string, unknown>[]
  try { rows = await find(ports, 'Account', ['Id', 'Name', EXTERNAL_ID], (list) => `Name IN ${list}`, [...new Set(accounts.map((a) => a.name))]) }
  catch (e) { for (const a of accounts) done(a.id, null, message(e)); return linked }
  const fresh: Outbox['accounts'] = []
  for (const a of accounts) {
    const same = rows.filter((r) => String(r.Name ?? '').trim().toLowerCase() === a.name.trim().toLowerCase())
    const theirs = same.filter((r) => !r[EXTERNAL_ID])
    if (same.some((r) => r[EXTERNAL_ID] === a.id) || !theirs.length) fresh.push(a)
    else if (theirs.length === 1) { linked.set(a.id, String(theirs[0].Id)); done(a.id, String(theirs[0].Id), null) }
    else done(a.id, null, `${theirs.length} Accounts in Salesforce are named "${a.name}": put ${a.id} in the ${EXTERNAL_ID} field of this sponsor's one`)
  }
  const answers = await write(fresh.map((a) => rec('Account', a.id, { Name: a.name })), (r) => ports.upsert('Account', r))
  fresh.forEach((a, k) => done(a.id, ...outcomeOf(answers[k])))
  return linked
}

/** Writes records 200 a call; a call that fails outright fails each of its records with the reason. */
async function write(records: SfRecord[], call: (records: SfRecord[]) => Promise<SfAnswer[]>): Promise<(SfAnswer | undefined)[]> {
  const out: (SfAnswer | undefined)[] = []
  for (let i = 0; i < records.length; i += BATCH) {
    const part = records.slice(i, i + BATCH)
    try { const a = await call(part); out.push(...part.map((_, k) => a[k])) } catch (e) { out.push(...part.map(() => ({ success: false, errors: [{ message: message(e) }] }))) }
  }
  return out
}

/** Rows of `sobject` whose condition holds for some of `values`, asked LOOKUP values at a time. */
async function find(ports: PushPorts, sobject: string, fields: string[], where: (list: string) => string, values: string[]) {
  const rows: Record<string, unknown>[] = []
  for (let i = 0; i < values.length; i += LOOKUP) {
    rows.push(...await ports.query(`SELECT ${fields.join(', ')} FROM ${sobject} WHERE ${where(`(${values.slice(i, i + LOOKUP).map(soqlText).join(', ')})`)}`))
  }
  return rows
}

/** The gala's Campaign id: ours if we made it, else Give Lively's (Give Lively names it after its page, cut to 80
 *  characters), else a new one of ours. Null, with the reason in the results, when it can't be told or sent. */
async function pushCampaign(c: NonNullable<Outbox['campaign']>, ports: PushPorts, results: SyncResult[]): Promise<string | null> {
  const done = (sf_id: string | null, error: string | null) => { results.push({ entity: 'gala', entity_id: c.id, sf_object: 'Campaign', sf_id, error }); return error ? null : sf_id }
  const name = (c.givelively_name || c.name).slice(0, 80)
  let rows: Record<string, unknown>[]
  try { rows = await ports.query(`SELECT Id, ${EXTERNAL_ID} FROM Campaign WHERE ${EXTERNAL_ID} = ${soqlText(c.id)} OR Name = ${soqlText(name)}`) } catch (e) { return done(null, message(e)) }
  // A same-named Campaign that carries another gala's id is that gala's, not Give Lively's.
  const theirs = rows.filter((r) => !r[EXTERNAL_ID])
  if (!rows.some((r) => r[EXTERNAL_ID] === c.id) && theirs.length === 1) return done(String(theirs[0].Id), null)
  if (!rows.some((r) => r[EXTERNAL_ID] === c.id) && theirs.length > 1) {
    return done(null, `${theirs.length} Campaigns in Salesforce are named "${name}": put ${c.id} in the ${EXTERNAL_ID} field of the gala's one`)
  }
  const [a] = await write([rec('Campaign', c.id, { Name: c.name, StartDate: c.date, Type: 'Event', IsActive: true })], (r) => ports.upsert('Campaign', r))
  return done(...outcomeOf(a))
}

/** Salesforce's Contacts with these emails: each email -> the Contact Give Lively would pick (most gifts, then one
 *  with a mailing address, then the latest updated). */
async function contactsByEmail(emails: string[], ports: PushPorts): Promise<Map<string, string>> {
  const rows = await find(ports, 'Contact', ['Id', ...EMAIL_FIELDS, 'npo02__NumberOfClosedOpps__c', 'MailingStreet', 'LastModifiedDate'],
    (list) => EMAIL_FIELDS.map((f) => `${f} IN ${list}`).join(' OR '), emails)
  rows.sort((a, b) => Number(b.npo02__NumberOfClosedOpps__c ?? 0) - Number(a.npo02__NumberOfClosedOpps__c ?? 0)
    || Number(Boolean(b.MailingStreet)) - Number(Boolean(a.MailingStreet)) || String(b.LastModifiedDate ?? '').localeCompare(String(a.LastModifiedDate ?? '')))
  const known = new Map<string, string>()
  for (const r of rows) for (const e of EMAIL_FIELDS.map((f) => emailKey(r[f]))) if (e && !known.has(e)) known.set(e, String(r.Id))
  return known
}

/** Each guest's Contact id: a guest whose email Salesforce knows is linked to that Contact; the rest become
 *  Contacts, one per email. */
async function pushContacts(guests: Guest[], ports: PushPorts, results: SyncResult[]): Promise<Map<string, string>> {
  const outcome = new Map<string, Outcome>()
  let known = new Map<string, string>(), lookupFailed: string | null = null
  try { known = await contactsByEmail([...new Set(guests.map((g) => emailKey(g.email)).filter(Boolean))], ports) } catch (e) { lookupFailed = message(e) }

  // ponytail: a linked Contact is AAFE's record and keeps its fields; a name staff fix later is fixed in Salesforce too.
  const groups = new Map<string, Guest[]>()   // a new Contact (by email) -> its guests
  for (const g of guests) {
    const e = emailKey(g.email)
    if (!e) outcome.set(g.id, [null, NO_EMAIL])   // by name alone it could only be a duplicate
    else if (lookupFailed) outcome.set(g.id, [null, lookupFailed])   // never create one that may already exist
    else if (e && known.has(e)) outcome.set(g.id, [known.get(e) ?? null, null])
    else groups.set(e, [...(groups.get(e) ?? []), g])
  }
  const leads = [...groups.values()].map((gs) => gs[0])
  const answers = await write(leads.map((g) => rec('Contact', g.id, { FirstName: g.first, LastName: g.last, Email: g.email })), (r) => ports.upsert('Contact', r))
  ;[...groups.values()].forEach((gs, k) => { for (const g of gs) outcome.set(g.id, outcomeOf(answers[k])) })
  report(results, guests, 'Contact', outcome)
  return new Map([...outcome].flatMap(([g, [sf_id, error]]) => (sf_id && !error ? [[g, sf_id] as const] : [])))
}

/** Each guest as a member of the gala's Campaign: a Contact already in it (Give Lively adds its buyers) keeps its
 *  membership and gets the gala-night status; the rest are added. Two guests on one Contact are one member. */
async function pushMembers(campaignId: string | null, guests: Guest[], contactOf: Map<string, string>, ports: PushPorts, results: SyncResult[]) {
  const outcome = new Map<string, Outcome>()
  const byContact = new Map<string, Guest[]>()
  for (const g of guests) {
    const contact = contactOf.get(g.id)
    if (!emailKey(g.email)) outcome.set(g.id, [null, NO_EMAIL])
    else if (!campaignId) outcome.set(g.id, [null, "The gala's Campaign isn't in Salesforce yet"])
    else if (!contact) outcome.set(g.id, [null, "This guest's Contact isn't in Salesforce yet"])
    else byContact.set(contact, [...(byContact.get(contact) ?? []), g])
  }
  if (campaignId && byContact.size) {
    let member = new Map<string, string>()   // Contact id -> its CampaignMember id
    let lookupFailed: string | null = null
    try {
      const rows = await find(ports, 'CampaignMember', ['Id', 'ContactId'], (list) => `CampaignId = ${soqlText(campaignId)} AND ContactId IN ${list}`, [...byContact.keys()])
      member = new Map(rows.map((r) => [String(r.ContactId), String(r.Id)]))
    } catch (e) { lookupFailed = message(e) }
    const status = (gs: Guest[]) => (gs.some((g) => g.status === 'Attended') ? 'Attended' : gs[0].status)
    const entries = [...byContact.entries()]
    const old = entries.filter(([c]) => member.has(c)), fresh = entries.filter(([c]) => !member.has(c))
    const settle = (list: [string, Guest[]][], answers: (SfAnswer | undefined)[]) => list.forEach(([, gs], k) => {
      for (const g of gs) outcome.set(g.id, lookupFailed ? [null, lookupFailed] : outcomeOf(answers[k]))
    })
    if (!lookupFailed) {
      // A member's Campaign and Contact can't change, so an update sends only its status.
      settle(old, await write(old.map(([c, gs]) => ({ attributes: { type: 'CampaignMember' }, Id: member.get(c), Status: status(gs) })), (r) => ports.save('update', r)))
      settle(fresh, await write(fresh.map(([c, gs]) => ({ attributes: { type: 'CampaignMember' }, CampaignId: campaignId, ContactId: c, Status: status(gs) })), (r) => ports.save('create', r)))
    } else settle(entries, [])
  }
  report(results, guests, 'CampaignMember', outcome)
}

/** Sends the gala, then sponsors, orders and payments, then guests and their memberships, and returns each record's
 *  outcome (a failed call fails its records, not the run). */
export async function pushAll(o: Outbox, ports: PushPorts, opts: PushOptions = DEFAULT_OPTIONS): Promise<SyncResult[]> {
  const results: SyncResult[] = []
  const campaignId = o.campaign ? await pushCampaign(o.campaign, ports, results) : null
  const linked = await pushAccounts(o.accounts, ports, results)
  for (const b of toBatches(o, campaignId, linked, opts)) {
    const answers = await write(b.records, (r) => ports.upsert(b.sobject, r))
    b.ids.forEach((id, k) => { const [sf_id, error] = outcomeOf(answers[k]); results.push({ entity: b.entity, entity_id: id, sf_object: b.sobject, sf_id, error }) })
  }
  const guests = opts.guests === 'none' ? [] : opts.guests === 'attended' ? o.contacts.filter((g) => g.status === 'Attended') : o.contacts
  const contactOf = await pushContacts(guests, ports, results)
  // Campaign members carry their campaign's id, so there are none without a gala.
  if (o.campaign) await pushMembers(campaignId, guests, contactOf, ports, results)
  return results
}

/** What one push did, for the staff app's message. */
export function summarize(results: SyncResult[]) {
  const by: Record<string, number> = {}
  for (const r of results) if (!r.error) by[r.sf_object] = (by[r.sf_object] ?? 0) + 1
  const skipped = results.filter((r) => r.error === NO_EMAIL).length
  const failed = results.filter((r) => r.error && r.error !== NO_EMAIL)
  return { sent: results.length - failed.length - skipped, failed: failed.length, skipped, by_object: by, first_error: failed[0]?.error ?? null }
}
