// Sponsor pipeline (decided Oct 6): AAFE's prospect tracker as stages with an ask, a commitment, the last
// two galas' giving, and totals per stage against a goal. Runs with npm run test:backend.
import { counter, openTestDb } from './test-db.mjs'
const { db, as, err } = await openTestDb()
const count = counter(), ok = count.ok
const q = async (sql, params) => (await db.query(sql, params)).rows

const STAFF = Object.fromEntries((await q(`select role, email, name from staff_users order by email`)).map((s) => [s.role, s]))
const ADMIN = STAFF.gala_admin, RM = STAFF.relationship_manager, VOL = STAFF.check_in_volunteer
const board = async () => (await as('authenticated', RM.email, `select staff_pipeline() b`))[0].b
const save = async (p, who = RM) => (await as('authenticated', who.email, `select staff_save_prospect($1) id`, [JSON.stringify(p)]))[0].id
const saveErr = (p) => err('authenticated', RM.email, `select staff_save_prospect($1)`, [JSON.stringify(p)])
const stage = (id, s, who = RM) => as('authenticated', who.email, `select staff_set_prospect_stage($1, $2)`, [id, s])
const stageErr = (id, s) => err('authenticated', RM.email, `select staff_set_prospect_stage($1, $2)`, [id, s])
const prospect = async (id) => (await q(`select * from sponsor_prospects where id = $1`, [id]))[0]
const lastLog = async (id) => (await q(`select * from audit_log where entity = 'prospect' and entity_id = $1 order by id desc limit 1`, [id]))[0]

// ---- This gala's sponsorships are already on the board
const sponsorshipOrders = await q(`select o.id, o.status from orders o join sponsorship_tiers t on t.id = o.tier_id
  where o.event_id = current_event_id() and t.tier_category = 'sponsorship' and o.status not in ('cancelled', 'comp')`)
const linked = await q(`select order_id, stage from sponsor_prospects where event_id = current_event_id()`)
ok(sponsorshipOrders.length > 0 && sponsorshipOrders.every((o) => linked.some((p) => p.order_id === o.id)), `every sponsorship order has a prospect (${sponsorshipOrders.length})`)
ok(sponsorshipOrders.every((o) => linked.find((p) => p.order_id === o.id).stage === (['paid', 'partially_paid'].includes(o.status) ? 'payment_received' : 'closed_won')),
  'a sponsor who has paid is at payment received; a pledge is closed won')
ok((await q(`select count(*)::int n from sponsor_prospects p join orders o on o.id = p.order_id where o.tier_id = 'comp_relationship'`))[0].n === 0, 'comps are not prospects')
ok((await q(`select count(*)::int n from sponsor_prospects`))[0].n === linked.length, 'loading backend.sql twice adds nothing twice')

// ---- The board
ok((await err('authenticated', VOL.email, `select staff_pipeline()`)) === 'forbidden', 'volunteers cannot see the pipeline')
let b = await board()
ok(JSON.stringify(b.stages.map((s) => [s.stage, s.probability])) === JSON.stringify(
  [['not_started', 0], ['reached_out', 0.1], ['in_conversation', 0.5], ['closed_won', 0.9], ['payment_received', 1], ['lost', 0]]),
  "AAFE's six stages, in order, with their likelihood")
ok(b.stages.reduce((n, s) => n + s.count, 0) === b.prospects.length && b.totals.prospects === b.prospects.length, 'stage counts add up to the prospects')
ok(!/@|phone|email/i.test(JSON.stringify(b)), 'no emails or phone numbers on the board')
const sum = (xs, f) => xs.reduce((t, x) => t + Number(f(x) ?? 0), 0)
ok(Math.abs(b.totals.received - sum(b.prospects, (p) => p.received)) < 0.01, 'received total matches the prospects')
ok(Math.abs(b.totals.weighted - sum(b.prospects, (p) => p.probability * (p.commitment ?? p.ask ?? 0))) < 0.01, 'weighted total = each commitment (or ask) × its likelihood')

// Prior giving: the last two galas, from payments.
const withHistory = (await q(`select o.sponsor_id from orders o join payments p on p.order_id = o.id join gala_events e on e.id = o.event_id
  where e.year in (2025, 2026) and o.sponsor_id in (select sponsor_id from sponsor_prospects) limit 1`))[0]?.sponsor_id
ok(withHistory, '(the demo data has a sponsor who gave in an earlier year)')
const hp = b.prospects.find((p) => p.sponsor_id === withHistory)
const given2026 = Number((await q(`select coalesce(sum(p.original_amount - p.refunded_amount), 0) n from orders o join payments p on p.order_id = o.id
  where o.sponsor_id = $1 and o.event_id = 'ev-2026' and o.status <> 'cancelled'`, [withHistory]))[0].n)
ok(JSON.stringify(hp.prior_years.map((y) => y.year)) === '[2026,2025]' && Math.abs(hp.prior_years[0].given - given2026) < 0.01,
  `last two galas' giving: ${JSON.stringify(hp.prior_years)}`)

// ---- Adding prospects
const pr = await save({ organization: 'Lantern Example Foundation', contact_name: 'Robin Ade', sector: 'foundation', ask_amount: 25000, ask_tier_id: 'gold',
  follow_up_owner_id: 'st-mei', notes: 'Met at the spring breakfast' })
let p = await prospect(pr)
ok(p.stage === 'not_started' && Number(p.ask_amount) === 25000 && p.sector === 'foundation', 'a new prospect starts at not started, with its ask')
ok((await lastLog(pr))?.action === 'prospect.created' && (await lastLog(pr)).actor === RM.name, 'adding a prospect is logged')
ok((await saveErr({ organization: ' lantern example foundation ', contact_name: 'X' })) === 'invalid_input: Lantern Example Foundation is already a sponsor: choose them from the existing sponsors instead',
  'the same organization is not added twice, and the refusal says what to do without an internal id (Gate 3)')
const lanternSponsor = p.sponsor_id
ok((await saveErr({ sponsor_id: lanternSponsor }))?.includes('already in this gala'), 'one prospect per sponsor per gala')
ok((await saveErr({ organization: 'Bad Sector Co', contact_name: 'X', sector: 'aliens' }))?.startsWith('invalid_input'), 'sector must be one of AAFE\'s six')
ok((await saveErr({ organization: 'Negative Co', contact_name: 'X', ask_amount: -5 }))?.startsWith('invalid_input'), 'the ask cannot be negative')
ok((await saveErr({ organization: 'No Contact Co' }))?.startsWith('invalid_input'), 'a new organization needs a contact')
// An individual sponsor (AAFE's Oct 20 walk-through, item 6): no organization; the contact's name is the sponsor's name.
const solo = await prospect(await save({ contact_name: 'Sam Example Individual', sector: 'individual', ask_amount: 2500 }))
ok((await q(`select organization_name from sponsors where id = $1`, [solo.sponsor_id]))[0]?.organization_name === 'Sam Example Individual',
  "an individual sponsor needs no organization: their own name is the sponsor's name")
ok((await err('authenticated', VOL.email, `select staff_save_prospect('{"organization":"V","contact_name":"V"}')`)) === 'forbidden', 'volunteers cannot add prospects')

await save({ id: pr, ask_amount: 30000, notes: 'Met at the spring breakfast' })
const edit = await lastLog(pr)
ok(edit.action === 'prospect.updated' && edit.changes?.ask_amount?.to === 30000 && Object.keys(edit.changes).length === 1, 'an edit logs only what changed, old and new')

// ---- Stages, by hand
await stage(pr, 'reached_out')
await stage(pr, 'in_conversation')
const moved = await lastLog(pr)
ok(moved.action === 'prospect.stage' && moved.from_state === 'reached_out' && moved.to_state === 'in_conversation'
  && moved.summary === 'Lantern Example Foundation: Reached out → In conversation.', `stage changes are logged: ${moved.summary}`)
ok((await stageErr(pr, 'payment_received'))?.startsWith('invalid_transition'), 'payment received comes from recording a payment, not by hand')
ok((await stageErr(pr, 'won'))?.startsWith('invalid_input'), 'unknown stage refused')
ok((await err('authenticated', VOL.email, `select staff_set_prospect_stage($1, 'lost')`, [pr])) === 'forbidden', 'volunteers cannot move prospects')

// ---- A pledge closes it; a payment moves it to payment received, by itself
const ord = (await as('authenticated', RM.email, `select staff_add_pledge('Lantern Example Foundation', 'Robin Ade', 'robin@lantern.example.org', 'gold', 'check') id`))[0].id
p = await prospect(pr)
ok(p.order_id === ord && p.stage === 'closed_won', 'recording the pledge links it to the prospect (same organization) and moves it to closed won')
ok((await q(`select count(*)::int n from sponsor_prospects p join sponsors s on s.id = p.sponsor_id where s.organization_name = 'Lantern Example Foundation'`))[0].n === 1,
  'no second prospect for the new sponsor record')
const auto = await lastLog(pr)
ok(auto.actor_type === 'system' && auto.to_state === 'closed_won' && auto.summary.includes('pledge'), 'the automatic move is logged')
b = await board()
ok(b.prospects.find((x) => x.id === pr).commitment === 25000, 'the board shows the commitment from the pledge')

await as('authenticated', RM.email, `select staff_record_payment($1, 'check', 10000, '2026-10-06', '5521')`, [ord])
p = await prospect(pr)
ok(p.stage === 'payment_received', 'recording a payment moves it to payment received')
ok((await lastLog(pr)).summary.includes('payment recorded'), 'that move is logged too')
b = await board()
const row = b.prospects.find((x) => x.id === pr)
ok(row.received === 10000 && row.balance === 15000 && row.tier.startsWith('Gold'), 'the board shows what was received and what is still owed')
ok((await stageErr(pr, 'lost'))?.startsWith('invalid_transition'), 'a sponsor who paid stays at payment received')

// ---- Orders without a prospect, and orders that don't count
await db.exec(`insert into sponsors (id, organization_name, primary_contact_name, primary_contact_email) values ('sp-gl-test', 'Bright Example Co', 'Lee Bright', 'lee@bright.example.org');
  insert into orders (id, event_id, sponsor_id, tier_id, source, commitment_amount, status) values ('ord-gl-test', current_event_id(), 'sp-gl-test', 'silver', 'givelively', 15000, 'paid');`)
ok((await q(`select stage from sponsor_prospects where order_id = 'ord-gl-test'`))[0]?.stage === 'payment_received', 'a sponsorship bought on Give Lively joins the board at payment received')
await db.exec(`insert into sponsors (id, organization_name, primary_contact_name, primary_contact_email) values ('sp-tix-test', 'Ticket Buyer', 'Tix Buyer', 'tix@example.org');
  insert into orders (id, event_id, sponsor_id, tier_id, source, commitment_amount, status) values ('ord-tix-test', current_event_id(), 'sp-tix-test', 'community_ticket', 'givelively', 1000, 'paid');`)
ok((await q(`select count(*)::int n from sponsor_prospects where sponsor_id = 'sp-tix-test'`))[0].n === 0, "a ticket buyer who isn't a prospect stays off the board")
const ind = await save({ organization: 'Casey Example', contact_name: 'Casey Example', sector: 'individual', ask_amount: 2000 })
const indSponsor = (await prospect(ind)).sponsor_id
await db.exec(`insert into orders (id, event_id, sponsor_id, tier_id, source, commitment_amount, status) values ('ord-ad-test', current_event_id(), '${indSponsor}', 'full_page_ad', 'check', 2500, 'pledged')`)
ok((await prospect(ind)).order_id === null, 'an ad (an add-on) is not the prospect\'s order')
await db.exec(`insert into orders (id, event_id, sponsor_id, tier_id, source, commitment_amount, status) values ('ord-ind-test', current_event_id(), '${indSponsor}', 'corporate_ticket', 'givelively', 2000, 'paid')`)
ok((await prospect(ind)).order_id === 'ord-ind-test' && (await prospect(ind)).stage === 'payment_received', 'a ticket bought by a prospect counts for them')

// Lost, then they come back with a pledge.
const lost = await save({ organization: 'Returning Example Corp', contact_name: 'Pat Return', sector: 'corporate', ask_amount: 10000 })
await stage(lost, 'lost')
const lostOrder = (await as('authenticated', RM.email, `select staff_add_pledge('Returning Example Corp', 'Pat Return', 'pat@returning.example.org', 'bronze', 'wire') id`))[0].id
ok((await prospect(lost)).stage === 'closed_won' && (await prospect(lost)).order_id === lostOrder, 'a lost prospect who pledges after all is closed won')

// Linking a pledge recorded under a different name.
const renamed = await save({ organization: 'Harbor Light Example Trust', contact_name: 'Jamie Light', ask_amount: 5000 })
const otherName = (await as('authenticated', RM.email, `select staff_add_pledge('HLE Trust', 'Jamie Light', 'jamie@hle.example.org', 'champion', 'check') id`))[0].id
const autoMade = (await q(`select id from sponsor_prospects where order_id = $1`, [otherName]))[0]
ok(autoMade, '(a pledge under a different name gets its own prospect)')
ok((await saveErr({ id: renamed, order_id: otherName }))?.includes('another prospect'), 'an order on another prospect is not taken silently')
const freeOrder = (await q(`insert into orders (id, event_id, sponsor_id, tier_id, source, commitment_amount, status)
  values ('ord-free-test', current_event_id(), 'sp-gl-test', 'full_page_ad', 'check', 1000, 'pledged') returning id`))[0].id
await save({ id: renamed, order_id: freeOrder })
ok((await prospect(renamed)).order_id === freeOrder && (await prospect(renamed)).stage === 'closed_won', 'staff can link a pledge by hand, and the stage follows')
ok((await saveErr({ id: renamed, order_id: 'ord-nope' }))?.startsWith('not_found'), 'linking an unknown order is refused')

// ---- The goal
ok((await err('authenticated', RM.email, `select staff_set_sponsorship_goal(500000)`)) === 'forbidden', 'only gala admins set the goal')
await as('authenticated', ADMIN.email, `select staff_set_sponsorship_goal(500000)`)
b = await board()
ok(Number(b.goal) === 500000, 'the board shows the goal')
ok((await q(`select summary from audit_log where action = 'gala.goal_set' order by id desc limit 1`))[0].summary === 'Sponsorship goal set to $500,000.00.', 'setting the goal is logged')
ok((await err('authenticated', ADMIN.email, `select staff_set_sponsorship_goal(-1)`))?.startsWith('invalid_input'), 'a negative goal is refused')
ok(Math.abs(b.totals.committed - sum(b.prospects.filter((x) => ['closed_won', 'payment_received'].includes(x.stage)), (x) => x.commitment)) < 0.01,
  'committed = commitments of closed won and paid sponsors')

console.log(`pipeline: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
