// Community Tickets (Gate 1b, #147): a gala can have more than one Give Lively page. AAFE sells discounted tickets to
// partners on a private "Community Tickets" page with its own export (Oct 14 call). Invented data only (hard rule 1).
// Runs with npm run test:backend.
import { counter, openTestDb } from './test-db.mjs'
const { db, as, err } = await openTestDb()
const count = counter(), ok = count.ok
const one = async (sql, params) => (await db.query(sql, params)).rows[0]
const ADMIN = (await one(`select email from staff_users where role = 'gala_admin' limit 1`)).email
const RM = (await one(`select email from staff_users where role = 'relationship_manager' limit 1`)).email
const admin = (sql, params) => as('authenticated', ADMIN, sql, params)
const pages = async () => (await as('service_role', null, `select sync_gala_pages() p`))[0].p.join(' | ')
const sync = async (rows) => (await as('service_role', null, `select gl_import($1, 'Give Lively sync') r`, [JSON.stringify(rows)]))[0].r
const order = (txn) => one(`select tier_id, status, commitment_amount::float c, givelively_page, internal_notes from orders where givelively_order_ref = $1`, [txn])
const MAIN = "AAFE's 52nd Annual Gala", COMMUNITY = "AAFE's 52nd Annual Gala (Community Tickets)"
const purchase = (n, over = {}) => ({ txn: `GL-CT-${n}`, date: '2026-10-15T15:00:00Z', first: 'Mina', last: 'Park', email: `mina${n}@example.org`,
  company: '', campaign: COMMUNITY, ticket_level: 'Ticket', method: 'Credit Card', status: 'succeeded', original: 250, gross: 250, fee: 0, refunded: 0, ...over })

await admin(`select staff_set_gala_page($1)`, [MAIN])
await admin(`select staff_set_tier_mapping('Ticket', 'corporate_ticket')`) // the main page's $500 ticket

// A gala keeps a list of pages; gala admins add or remove them, logged. Adding one makes the sync look back once.
ok((await err('authenticated', RM, `select staff_add_gala_page($1)`, [COMMUNITY])) === 'forbidden', 'only a gala admin adds a page')
await db.exec(`update givelively_sync_state set cursor_ms = 1760000000000 where id = 1`)
await admin(`select staff_add_gala_page($1)`, [COMMUNITY])
ok(await pages() === `${MAIN} | ${COMMUNITY}`, `the sync reads both pages (${await pages()})`)
ok((await one(`select cursor_ms from givelively_sync_state where id = 1`)).cursor_ms === null, 'adding a page makes the sync look back once')
ok((await err('authenticated', ADMIN, `select staff_add_gala_page($1)`, [` ${COMMUNITY.toUpperCase()} `]))?.startsWith('invalid_input'), 'a page is added once')
ok((await err('authenticated', ADMIN, `select staff_add_gala_page($1)`, [MAIN]))?.startsWith('invalid_input'), 'the main page is not added twice')
ok(!!(await one(`select 1 from audit_log where action = 'gala.page_added' and to_state = $1`, [COMMUNITY])), 'adding a page is logged')

// A community "Ticket" never lands on the main page's $500 Ticket level: it waits for a mapping made for its page.
let res = await sync([purchase(1)])
ok(res.created === 0 && res.unknown_tier === 1, `"Ticket" on the community page isn't taken from the main page's mapping: ${JSON.stringify(res)}`)
ok((await one(`select details ->> 'tier_purchased' t from import_review where reason = 'unknown_tier' and status = 'open' and details ->> 'page' = $1`, [COMMUNITY]))?.t === 'Ticket',
  'its review names the page')
ok((await err('authenticated', ADMIN, `select staff_set_tier_mapping('Ticket', 'community_ticket', 'Spring Appeal')`))?.startsWith('not_found'),
  "a mapping is only for one of this gala's pages")
await admin(`select staff_set_tier_mapping('Ticket', 'community_ticket', $1)`, [COMMUNITY])
ok((await one(`select tier_id from tier_mappings where page_key = '' and name_key = 'ticket'`)).tier_id === 'corporate_ticket', "the main page's mapping is unchanged")
ok((await one(`select count(*)::int n from import_review where reason = 'unknown_tier' and status = 'open' and details ->> 'page' = $1`, [COMMUNITY])).n === 0,
  "mapping the page closes its review")

// Committed at what was paid: a community purchase imports and is paid in full.
res = await sync([purchase(1)])
const c = await order('GL-CT-1')
ok(res.created === 1 && c.tier_id === 'community_ticket' && c.status === 'paid' && c.c === 250 && c.givelively_page === COMMUNITY,
  `a community purchase imports, paid in full, with its page: ${JSON.stringify(c)}`)
// A $250 purchase on a $500 level (a discount code on the main page) is paid, labeled discounted, not "partly paid".
res = await sync([purchase(2, { campaign: MAIN })])
const d = await order('GL-CT-2')
ok(d.tier_id === 'corporate_ticket' && d.status === 'paid' && d.c === 250 && d.internal_notes.includes('Discounted: paid $250.00, $500.00'),
  `a discounted purchase is paid in full and labeled: ${JSON.stringify(d)}`)

// The look-back re-imports what was already there: nothing twice.
res = await sync([purchase(1), purchase(2, { campaign: MAIN })])
ok(res.created === 0 && res.skipped === 2, `importing again adds nothing: ${JSON.stringify(res)}`)
ok((await one(`select count(*)::int n from orders where givelively_order_ref like 'GL-CT-%'`)).n === 2, 'each purchase once')

// Removing a page: logged; what was imported from it stays; the sync stops reading it.
ok((await err('authenticated', RM, `select staff_remove_gala_page($1)`, [COMMUNITY])) === 'forbidden', 'only a gala admin removes a page')
await admin(`select staff_remove_gala_page($1)`, [COMMUNITY.toLowerCase()])
ok(await pages() === MAIN, 'the removed page is no longer synced')
ok((await err('authenticated', ADMIN, `select staff_remove_gala_page($1)`, [COMMUNITY]))?.startsWith('not_found'), 'removing a page twice says so')
ok(!!(await order('GL-CT-1')) && !!(await one(`select 1 from audit_log where action = 'gala.page_removed'`)), 'the removal is logged and its purchases stay')

console.log(`community tickets: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
