// Salesforce stand-in: what salesforce-push sends (salesforce_outbox in backend.sql, mapped by _shared/salesforce.ts),
// pushed to the stand-in org (demo_salesforce.sql, its queries read by salesforce-mock/soql.ts) and recorded
// (salesforce_mark_synced), all in PGlite. The stand-in starts with what Give Lively's own connector would have made,
// so the push shows it adds nothing twice (Gate 1, box 5). Runs with npm run test:backend. Invented data only.
import { readFileSync } from 'node:fs'
import { BATCH, EXTERNAL_ID, LOOKUP, pushAll, soqlText, summarize, toBatches, type Outbox, type PushPorts } from '../supabase/functions/_shared/salesforce.ts'
import { parseSoql } from '../supabase/functions/salesforce-mock/soql.ts'
import { isOwnStandIn, standInPorts, type Rpc } from '../supabase/functions/salesforce-mock/standin.ts'
// @ts-expect-error plain JavaScript helper
import { counter, D, openTestDb } from './test-db.mjs'
const { db, as, err } = await openTestDb()
await db.exec(readFileSync(D + 'demo_salesforce.sql', 'utf8'))
await db.exec(readFileSync(D + 'demo_salesforce.sql', 'utf8')) // re-running must be safe
const count = counter(), ok = count.ok
const q = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as any[]
const ADMIN = 'mei.ortiz@aafe-demo.example.org'

// ---- Only the edge function's service role may call these
for (const sql of ['select salesforce_outbox()', `select salesforce_mark_synced('[]')`, `select demo_salesforce_upsert('Account', '[]')`,
  `select demo_salesforce_save('create', '[]')`, `select demo_salesforce_query('Contact', '{Id}', true, '[]')`]) {
  ok(/permission denied/.test((await err('authenticated', ADMIN, sql)) ?? ''), `signed-in staff can't run: ${sql}`)
}

// ---- The gala as Give Lively's connector left it in Salesforce: its event Campaign (named after its page), its
// buyers as Contacts (Give Lively matches on Email and NPSP's three other email fields) and one as a Campaign member.
const PAGE = "AAFE's 53rd Annual Gala"
await q(`update gala_events set givelively_page_name = $1 where id = current_event_id()`, [PAGE])
const guestsWithEmail = await q(`select g.id, g.email, o.source from guests g join orders o on o.id = g.order_id
  where o.event_id = current_event_id() and o.status <> 'cancelled' and g.email <> '' order by (o.source = 'comp') desc, g.id`)
const [gA, gB, gC, gD, gE] = guestsWithEmail   // gA: a comp guest Give Lively already knows
await q(`update guests set email = $1 where id = $2`, [gD.email.toUpperCase(), gE.id])   // two guests, one inbox
const GL = { campaign: '701GLCAMPAIGN0001', a: '003GLCONTACTA0002', aOld: '003GLCONTACTA0001', b: '003GLCONTACTB0001', c: '003GLCONTACTC0002', cNew: '003GLCONTACTC0001', member: '00vGLMEMBERA00001' }
const seeded: [string, string, Record<string, unknown>, string][] = [
  [GL.campaign, 'Campaign', { Name: PAGE, Type: 'Event', give_lively__Campaign_Id__c: 'gl-camp-1' }, '2027-01-02'],
  [GL.a, 'Contact', { FirstName: 'Given', LastName: 'Byemail', Email: gA.email.toUpperCase(), npo02__NumberOfClosedOpps__c: 2 }, '2027-01-03'],
  [GL.aOld, 'Contact', { LastName: 'Fewer Gifts', npe01__WorkEmail__c: gA.email, npo02__NumberOfClosedOpps__c: 0 }, '2027-03-01'],
  [GL.b, 'Contact', { LastName: 'Alternate', npe01__AlternateEmail__c: gB.email, npo02__NumberOfClosedOpps__c: 1 }, '2027-01-04'],
  [GL.c, 'Contact', { LastName: 'Has Address', Email: gC.email, npo02__NumberOfClosedOpps__c: 1, MailingStreet: '111 Division St' }, '2027-01-05'],
  [GL.cNew, 'Contact', { LastName: 'Newer', Email: gC.email, npo02__NumberOfClosedOpps__c: 1 }, '2027-03-02'],
  [GL.member, 'CampaignMember', { CampaignId: GL.campaign, ContactId: GL.a, Status: 'Sent' }, '2027-01-03'],
]
for (const [id, sobject, fields, at] of seeded) {
  await q(`insert into demo_salesforce_records (sf_id, sobject, fields, updated_at) values ($1, $2, $3, $4)`, [id, sobject, JSON.stringify(fields), at])
}

// ---- What gets sent
const guest = (await q(`select g.id from guests g join orders o on o.id = g.order_id
  where o.event_id = current_event_id() and o.status <> 'cancelled' and o.source <> 'comp' order by g.id limit 1`))[0].id
await as('authenticated', ADMIN, `select staff_check_in($1, 'search')`, [guest])
const outbox = async (): Promise<Outbox> => (await as('service_role', null, 'select salesforce_outbox() o'))[0].o
const o1 = await outbox()
const ids = async (sql: string) => new Set((await q(sql)).map((r) => r.id))
const glOrders = await ids(`select id from orders where event_id = current_event_id() and source = 'givelively'`)
const comps = await ids(`select id from orders where event_id = current_event_id() and (source = 'comp' or status = 'comp')`)
const compOnly = await ids(`select sponsor_id id from orders where event_id = current_event_id() group by 1 having bool_and(source = 'comp' or status = 'comp')`)
const stripe = await ids(`select id from payments where processor = 'stripe'`)
ok(glOrders.size > 0 && o1.opportunities.length > 0 && !o1.opportunities.some((x) => glOrders.has(x.id)), "Give Lively's orders are left to its own connector")
ok(comps.size > 0 && !o1.opportunities.some((x) => comps.has(x.id)) && compOnly.size > 0 && !o1.accounts.some((a) => compOnly.has(a.id)),
  'a comp is no Opportunity, and a sponsor with only comps is no Account')
ok(o1.payments.length > 0 && !o1.payments.some((x) => stripe.has(x.id)), 'only the checks, ACH and wires staff recorded')
ok(o1.accounts.every((a) => o1.opportunities.some((x) => x.account_id === a.id)), 'an Account only for a sponsor with an order this sends')
const named = (await q(`select count(*)::int n from guests g join orders o on o.id = g.order_id where o.event_id = current_event_id() and o.status <> 'cancelled'`))[0].n
ok(o1.contacts.length === named && o1.contacts.some((c) => c.id === gA.id), `every named guest, comps' and Give Lively buyers' guests included (${named})`)
const att = new Map((await q(`select g.id, g.attendance_status a from guests g join orders o on o.id = g.order_id where o.event_id = current_event_id()`)).map((r) => [r.id, r.a]))
const LABEL: Record<string, string> = { checked_in: 'Attended', no_show: 'No Show', expected: 'Registered' }
ok(o1.contacts.find((c) => c.id === guest)?.status === 'Attended' && o1.contacts.every((c) => c.status === LABEL[att.get(c.id)]), 'a checked-in guest is Attended, the rest by their status')
ok(!/phone|dietary|accessib/i.test(JSON.stringify(o1)), 'no phones, dietary or accessibility details')
ok(o1.contacts.every((c) => c.last), 'every Contact has a LastName, which Salesforce requires')
ok(o1.campaign?.givelively_name === PAGE, "the gala carries its Give Lively page's name")

// ---- The shape Salesforce takes
const batches = toBatches(o1, GL.campaign)
ok(batches.map((b) => b.sobject).join() === 'Account,Opportunity,npe01__OppPayment__c', 'parents are sent before the records that point to them')
ok(batches.every((b) => b.records.every((r) => r.attributes.type === b.sobject && typeof r[EXTERNAL_ID] === 'string')), 'every record names its type and carries our id')
const paid = o1.opportunities.find((x) => x.status === 'paid')
ok(!paid || batches[1].records.find((r) => r[EXTERNAL_ID] === paid.id)?.StageName === 'Closed Won', 'a paid order is Closed Won')

// ---- Push to the stand-in org, then record what it said
const svc = async (sql: string, params: unknown[]) => (await as('service_role', null, sql, params))[0].r
// The push's own stand-in ports (salesforce-mock/standin.ts, what salesforce-push uses in the demo), each database
// function called by name as the service role, as supabase-js's rpc() does.
const rpc: Rpc = (fn, args) => {
  const names = Object.keys(args)
  const cast = (v: unknown, i: number) => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? `array(select jsonb_array_elements_text($${i}::jsonb))`
    : typeof v === 'boolean' ? `$${i}::boolean` : typeof v === 'object' ? `$${i}::jsonb` : `$${i}`)
  return svc(`select ${fn}(${names.map((k, i) => `${k} => ${cast(args[k], i + 1)}`).join(', ')}) r`,
    names.map((k) => (typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k])))
}
const ports: PushPorts = standInPorts(rpc)
ok(isOwnStandIn('https://x.supabase.co/functions/v1/salesforce-mock/', 'https://x.supabase.co') && !isOwnStandIn('https://x.supabase.co/functions/v1/salesforce-mock', 'https://y.supabase.co')
  && !isOwnStandIn('https://aafe.my.salesforce.com', 'https://x.supabase.co') && !isOwnStandIn('https://x.supabase.co/functions/v1/salesforce-mock', ''),
  "the push reaches the stand-in directly only when it is this project's own; any other address, a real org included, over HTTP")
const steps: string[] = []
const traced: PushPorts = {
  query: (soql) => { steps.push(`query ${parseSoql(soql).sobject}`); return ports.query(soql) },
  upsert: (sobject, records) => { steps.push(`upsert ${sobject}`); return ports.upsert(sobject, records) },
  save: (op, records) => { steps.push(`${op} ${records[0]?.attributes.type}`); return ports.save(op, records) },
}
const mark = async (results: unknown) => (await as('service_role', null, 'select salesforce_mark_synced($1::jsonb) m', [JSON.stringify(results)]))[0].m
const sf = async (sobject: string) => q(`select sf_id, external_id, fields from demo_salesforce_records where sobject = $1 order by sf_id`, [sobject])
const r1 = await pushAll(o1, traced)
const s1 = summarize(r1)
ok(s1.failed === 0 && s1.sent === 1 + o1.accounts.length + o1.opportunities.length + o1.payments.length + 2 * o1.contacts.length, `everything lands: ${JSON.stringify(s1.by_object)}`)
ok([...new Set(steps)].join() === 'query Campaign,upsert Account,upsert Opportunity,upsert npe01__OppPayment__c,query Contact,upsert Contact,query CampaignMember,update CampaignMember,create CampaignMember',
  'the gala first, then sponsors, orders and payments, then guests (looked up before any is made) and their memberships')
const m1 = await mark(r1)
ok(m1.synced === r1.length && m1.failed === 0, 'every answer is recorded')
const acct = (await q(`select salesforce_account_id from sponsors where id = $1`, [o1.accounts[0].id]))[0].salesforce_account_id
ok(/^001MOCK/.test(acct), 'the sponsor keeps its Salesforce Account id')
ok(/^006MOCK/.test((await q(`select salesforce_opportunity_id from orders where id = $1`, [o1.opportunities[0].id]))[0].salesforce_opportunity_id), 'the order keeps its Opportunity id')
ok((await q(`select count(*)::int n from salesforce_sync where sf_object = 'CampaignMember' and status = 'synced'`))[0].n === o1.contacts.length, 'one synced CampaignMember row per guest')
ok((await q(`select count(*)::int n from audit_log where action = 'salesforce.synced'`))[0].n === 1, 'one change-log line for the run')

// ---- Nothing twice next to Give Lively's records
const result = (id: string, sobject: string) => r1.find((x) => x.entity_id === id && x.sf_object === sobject)?.sf_id
ok((await sf('Campaign')).length === 1 && result(o1.campaign?.id ?? '', 'Campaign') === GL.campaign, "the gala's Campaign is Give Lively's own: no second one")
ok((await sf('Opportunity')).every((x) => x.fields.CampaignId === GL.campaign) && (await sf('Opportunity')).length === o1.opportunities.length, "each order's Opportunity is in it")
ok(result(gA.id, 'Contact') === GL.a, "a guest Give Lively knows is its Contact: the email matched whatever its case, the one with more gifts chosen")
ok(result(gB.id, 'Contact') === GL.b, "an email in NPSP's Alternate Email field matches too")
ok(result(gC.id, 'Contact') === GL.c, 'gifts tied: the Contact with a mailing address wins over the newer one, as Give Lively picks')
const shared = result(gD.id, 'Contact')
const emailsOf = (x: any) => ['Email', 'npe01__HomeEmail__c', 'npe01__WorkEmail__c', 'npe01__AlternateEmail__c'].map((f) => String(x.fields[f] ?? '').toLowerCase()).filter(Boolean)
ok(Boolean(shared) && result(gE.id, 'Contact') === shared && (await sf('Contact')).filter((x) => emailsOf(x).includes(gD.email.toLowerCase())).length === 1,
  'two guests sharing an inbox are one new Contact')
const known = new Set([gA, gB, gC].map((g) => g.email.toLowerCase()))
const madeByUs = (await sf('Contact')).filter((x) => x.external_id)
ok(madeByUs.length === new Set(o1.contacts.map((c) => c.email?.toLowerCase() || c.id)).size - known.size && !madeByUs.some((x) => emailsOf(x).some((e) => known.has(e))),
  `a new Contact only for a guest Salesforce doesn't know, one per email (${madeByUs.length})`)
let untouched = true
for (const [id, s, f] of seeded) if (s === 'Contact') untouched &&= (await q(`select fields = $2::jsonb same from demo_salesforce_records where sf_id = $1`, [id, JSON.stringify(f)]))[0]?.same === true
ok(untouched, "Give Lively's Contacts are linked, never overwritten")
const members = await sf('CampaignMember')
ok(new Set(members.map((x) => x.fields.ContactId)).size === members.length && members.every((x) => x.fields.CampaignId === GL.campaign), 'one membership per Contact, all in the gala Campaign')
const glMember = members.find((x) => x.sf_id === GL.member)
ok(result(gA.id, 'CampaignMember') === GL.member && glMember?.fields.Status === 'Registered', "Give Lively's member keeps its membership and gets the gala-night status (the comp guest)")
ok(result(gD.id, 'CampaignMember') === result(gE.id, 'CampaignMember'), 'two guests on one Contact are one member')

// ---- Sending again updates, never duplicates
const records = async () => (await q(`select count(*)::int n from demo_salesforce_records`))[0].n
const before = await records()
await as('authenticated', ADMIN, `select staff_check_in($1, 'search')`, [gA.id])
const r2 = await pushAll(await outbox(), ports)
await mark(r2)
ok(await records() === before, 'a second push adds no records in Salesforce')
ok(r2.every((x, i) => x.sf_id === r1[i].sf_id), 'each record keeps its Salesforce id')
ok((await sf('CampaignMember')).find((x) => x.sf_id === GL.member)?.fields.Status === 'Attended', 'a guest who arrives since is Attended on the same membership')
ok((await q(`select count(*)::int n from salesforce_sync where entity = 'guest' and sf_object = 'Contact'`))[0].n === o1.contacts.length, 'and no duplicate sync rows')

// ---- When it can't tell, it makes nothing
await q(`insert into demo_salesforce_records (sf_id, sobject, fields) values ('701GLCAMPAIGN0002', 'Campaign', $1)`, [JSON.stringify({ Name: PAGE })])
const r4 = await pushAll(await outbox(), ports)
const gala4 = r4.find((x) => x.sf_object === 'Campaign')
ok(/2 Campaigns in Salesforce are named "AAFE's 53rd Annual Gala": put ev-2027 in the AAFE_Gala_Id__c field/.test(gala4?.error ?? '') && (await sf('Campaign')).length === 2,
  'two Campaigns with the gala page\'s name: the gala fails with what to do, and no third is made')
ok(r4.filter((x) => x.sf_object === 'CampaignMember').every((x) => /Campaign isn't in Salesforce yet/.test(x.error ?? '')), 'and its members wait for it')
await q(`update demo_salesforce_records set fields = fields || jsonb_build_object($1::text, 'ev-2026') where sf_id = '701GLCAMPAIGN0002'`, [EXTERNAL_ID])
ok((await pushAll(await outbox(), ports)).find((x) => x.sf_object === 'Campaign')?.sf_id === GL.campaign, "a same-named Campaign carrying another gala's id isn't this gala's")
const contactsBefore = (await sf('Contact')).length
const noLookup: PushPorts = { ...ports, query: (soql) => (parseSoql(soql).sobject === 'Contact' ? Promise.reject(new Error('HTTP 503')) : ports.query(soql)) }
const r5 = await pushAll(await outbox(), noLookup)
ok(r5.filter((x) => x.sf_object === 'Contact').every((x) => x.error === 'HTTP 503') && (await sf('Contact')).length === contactsBefore,
  "Salesforce can't be asked about the emails: no Contact is made, so none is a duplicate")

// ---- Failures stay with their records
const lone = await pushAll({ campaign: null, accounts: [], opportunities: [], contacts: [],
  payments: [{ id: 'pay-orphan', order_id: 'ord-not-sent', amount: 100, date: '2027-01-15', method: 'check' }] }, ports)
ok(/INVALID_FIELD/.test(lone[0].error ?? ''), "a payment whose Opportunity Salesforce doesn't have fails, as in Salesforce")
await mark(lone)
ok((await q(`select status, error_message from salesforce_sync where entity_id = 'pay-orphan'`))[0]?.status === 'error', 'and is recorded as an error, with the reason')
const flaky: PushPorts = { ...ports, upsert: (sobject, recs) => (sobject === 'Account' ? Promise.reject(new Error('HTTP 503')) : ports.upsert(sobject, recs)) }
const r3 = await pushAll(await outbox(), flaky)
ok(r3.filter((x) => x.sf_object === 'Account').every((x) => x.error === 'HTTP 503') && r3.filter((x) => x.sf_object !== 'Account').every((x) => !x.error),
  'a call that fails outright fails its own records, and the rest still go')
const twice = await svc(`select demo_salesforce_save('create', $1::jsonb) r`, [JSON.stringify([{ attributes: { type: 'CampaignMember' }, CampaignId: GL.campaign, ContactId: GL.a, Status: 'Sent' }])])
ok(twice[0].errors[0].statusCode === 'DUPLICATE_VALUE', 'the stand-in refuses a second membership, as Salesforce does')
const moved = await svc(`select demo_salesforce_save('update', $1::jsonb) r`, [JSON.stringify([{ attributes: { type: 'CampaignMember' }, Id: GL.member, ContactId: GL.b }])])
ok(moved[0].errors[0].statusCode === 'INVALID_FIELD_FOR_INSERT_UPDATE', "and a member's Contact can't change")

// ---- Salesforce takes 200 records a call; lookups ask 50 values at a time
const calls: string[] = []
let n = 0
const many = [...Array.from({ length: 450 }, (_, i) => ({ id: `g-batch-${i}`, first: 'Test', last: `Guest ${i}`, email: null, status: 'Registered' })),
  ...Array.from({ length: 120 }, (_, i) => ({ id: `g-mail-${i}`, first: 'Test', last: `Mail ${i}`, email: `guest${i}@example.org`, status: 'Registered' }))]
await pushAll({ ...o1, contacts: many }, {
  query: async (soql) => { const p = parseSoql(soql); calls.push(`query ${p.sobject} ${p.conds.at(-1)?.values.length}`); return p.sobject === 'Campaign' ? [{ Id: GL.campaign, [EXTERNAL_ID]: null }] : [] },
  upsert: async (sobject, recs) => { calls.push(`upsert ${sobject} ${recs.length}`); return recs.map(() => ({ success: true, id: `x${n++}` })) },
  save: async (op, recs) => { calls.push(`${op} ${recs.length}`); return recs.map(() => ({ success: true, id: `m${n++}` })) },
})
const of = (prefix: string) => calls.filter((c) => c.startsWith(prefix)).map((c) => c.split(' ').at(-1)).join()
ok(BATCH === 200 && of('upsert Contact') === '200,200,170' && of('create') === '200,200,170', '570 Contacts and their memberships go in three calls each')
ok(LOOKUP === 50 && of('query Contact') === '50,50,20' && calls.filter((c) => c.startsWith('query CampaignMember')).length === 12, 'their emails are asked 50 at a time, and so are their memberships')

// ---- A name or an email can't change a query
const odd = `AAFE's "Gala" \\ x' OR Name != 'y\n`
const p = parseSoql(`SELECT Id FROM Campaign WHERE Name = ${soqlText(odd)} OR ${EXTERNAL_ID} IN (${soqlText('a')}, ${soqlText("b'c")})`)
ok(p.sobject === 'Campaign' && p.any && p.conds.length === 2 && p.conds[0].values[0] === odd && p.conds[1].values.join('|') === "a|b'c", 'quotes, backslashes and line breaks stay inside the value')
ok([`SELECT Id FROM Contact WHERE Email = 'a' AND Name = 'b' OR Id = 'c'`, `SELECT Id FROM Contact WHERE Email != 'a'`, `SELECT Id FROM Contact`]
  .every((s) => { try { parseSoql(s); return false } catch (e) { return /MALFORMED_QUERY/.test((e as Error).message) } }), 'the stand-in refuses any other query')

console.log(`salesforce: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
