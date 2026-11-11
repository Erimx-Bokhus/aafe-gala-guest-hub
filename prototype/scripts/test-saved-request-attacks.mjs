// Attack tests for the saved request (email_send_snapshots, #282), Nov 11: every way we could think of to read, change,
// keep or leak a saved request that holds a recipient's address. Each check is an attack that must fail. Written after
// GreyBox's second review (Nov 10) found the first version readable by staff and kept after contact deletion.
// Runs with npm run test:backend, or on its own: node scripts/test-saved-request-attacks.mjs. Invented data only.
import { counter, openTestDb } from './test-db.mjs'

const { db, as, err } = await openTestDb()
const count = counter(), ok = count.ok
const q = async (sql, params) => (await db.query(sql, params)).rows

const ADMIN = 'mei.ortiz@aafe-demo.example.org', RM = 'daniel.seo@aafe-demo.example.org'
const VOL = (await q(`select email from staff_users where role = 'check_in_volunteer'`))[0].email
const TARGET = 'leak.target@example.org'
const SAVED = `{"to":["${TARGET}"],"subject":"Add your guests","html":"#/s/{{aafe:link_token}}"}`

// An approved sponsor email, part-way through sending: its request is saved, with the recipient's address in it.
const id = (await q(`select enqueue_email('portal_link', $1, 'Leak Target', 'ord-acme', null, 'test', 'test') id`, [TARGET]))[0].id
const att = (await q(`select attempts from email_log where id = $1`, [id]))[0].attempts
ok((await as('service_role', null, `select email_save_snapshot($1, $2, $3) ok`, [id, att, SAVED]))[0].ok === true,
  'set-up: a saved request that holds an address')

// ---- Every caller the apps have, against every way in
const callers = [['anon', null, 'the public key'], ['authenticated', ADMIN, 'a gala admin'],
  ['authenticated', RM, 'a relationship manager'], ['authenticated', VOL, 'a check-in volunteer']]
for (const [role, who, label] of callers) {
  ok(!!(await err(role, who, `select * from email_send_snapshots`)), `${label} cannot read the table`)
  ok(!!(await err(role, who, `select * from email_snapshots(array[$1]::text[])`, [id])), `${label} cannot call the worker's read function`)
  ok(!!(await err(role, who, `select email_save_snapshot($1, $2, 'x')`, [id, att])), `${label} cannot overwrite a saved request`)
  ok(!!(await err(role, who, `delete from email_send_snapshots`)), `${label} cannot delete saved requests`)
  ok(!!(await err(role, who, `insert into email_send_snapshots (email_id, attempt, snapshot) values ($1, 99, 'x')`, [id])),
    `${label} cannot plant a fake saved request`)
  for (const fn of ['staff_email_queue()', 'staff_sync(null, null)']) {
    const out = await as(role, who, `select ${fn} r`).catch(() => null)
    ok(!out || !JSON.stringify(out).includes('{{aafe:'), `${label} gets no saved request from ${fn}`)
  }
}

// ---- No function a signed-in admin can call without arguments hands one back
const fns = (await q(`select p.oid::regprocedure::text f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.pronargs = 0 and p.prorettype <> 'void'::regtype
    and has_function_privilege('authenticated', p.oid, 'execute')`)).map((r) => r.f)
const leaks = []
for (const f of fns) {
  const out = await as('authenticated', ADMIN, `select ${f} r`).catch(() => null)
  if (out && JSON.stringify(out).includes('{{aafe:')) leaks.push(f)
}
ok(fns.length > 0 && leaks.length === 0, `none of the ${fns.length} functions a gala admin can call without arguments returns it ${leaks.join(', ')}`)

// ---- It doesn't outlive its attempt: a cancelled order cancels the email, and the saved copy goes with it
await q(`update email_log set status = 'cancelled' where order_id = 'ord-acme' and status = 'queued'`)
ok((await q(`select count(*)::int n from email_send_snapshots where email_id = $1`, [id]))[0].n === 0, 'cancelling the email deletes it')
ok((await q(`select count(*)::int n from email_send_snapshots where snapshot like '%' || $1 || '%'`, [TARGET]))[0].n === 0,
  'the address is left in no saved request')

console.log(`saved-request attacks: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
