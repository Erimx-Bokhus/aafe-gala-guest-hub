// Gala-night load test (Gate 3, #149): several iPads check in a full gala at once, on a real Postgres, while the staff app
// reads the door list. Each iPad sends what it queued with staff_sync_check_ins(), as the check-in app does, on its own
// connection: some in small batches (online), two after a long offline stretch, one resending a batch it never got an
// answer for, and some guests arrive at two doors. Afterwards nothing may be lost or doubled, and the first arrival wins.
//
// Needs Docker (it starts a throwaway postgres:17, the version Supabase runs, and removes it). Not part of CI: the CI tests
// run on PGlite, which has one connection and so can't race. Invented data only (the full-fixed demo set, 553 guests).
//   node scripts/load-checkin.mjs            one run, a report, exit code 1 if an invariant fails
//   node scripts/load-checkin.mjs --keep     keep the container to look around (docker rm -f aafe-gala-load)
//   node scripts/load-checkin.mjs --seed 7   another shuffle of doors, times and batches
//   node scripts/load-checkin.mjs --two-doors 0.5   half the guests scanned at two doors (a harder race)
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildLoadSql } from './demo-data.mjs'

const D = fileURLToPath(new URL('../database/', import.meta.url))
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt }
const KEEP = process.argv.includes('--keep'), SEED = Number(arg('--seed', 1)), NAME = 'aafe-gala-load'
const IPADS = 6, TWO_DOORS = Number(arg('--two-doors', 0.12)), OFFLINE_DESKS = [5, 6], RETRY_DESK = 3

// ---- A throwaway Postgres with the Supabase stand-ins the test database uses (scripts/test-db.mjs)
const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8', maxBuffer: 1 << 28 })
const psqlIn = (sql) => execFileSync('docker', ['exec', '-i', NAME, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-At'],
  { input: sql, encoding: 'utf8', maxBuffer: 1 << 28 })
try { docker('rm', '-f', NAME) } catch { /* not running */ }
docker('run', '-d', '--name', NAME, '-e', 'POSTGRES_PASSWORD=load-test-only', 'postgres:17')
for (let i = 0; ; i++) {
  try { docker('exec', NAME, 'pg_isready', '-U', 'postgres', '-q'); psqlIn('select 1'); break }
  catch { if (i > 60) throw new Error('postgres did not start'); execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},500)']) }
}
psqlIn(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;`)
const backend = readFileSync(D + 'backend.sql', 'utf8')
psqlIn(readFileSync(D + 'schema.sql', 'utf8'))
psqlIn(readFileSync(D + 'seed.sql', 'utf8'))
psqlIn(backend)
psqlIn(buildLoadSql('full-fixed'))
psqlIn(backend)

// ---- The plan: who arrives at which door, when, and how each iPad batches its syncs
const rows = (sql) => psqlIn(sql).trim().split('\n').filter(Boolean)
const guests = rows(`select g.id from guests g join orders o on o.id = g.order_id
  where o.event_id = current_event_id() and o.status <> 'cancelled' and g.attendance_status <> 'checked_in' order by g.id`)
const staff = Object.fromEntries(rows(`select role || '|' || email from staff_users order by email`).map((r) => r.split('|')))
const who = (desk) => (desk % 3 === 0 ? staff.relationship_manager : desk % 3 === 1 ? staff.check_in_volunteer : staff.gala_admin)
let seed = SEED
const rand = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
const shuffled = [...guests].sort(() => rand() - 0.5)
const start = Date.now() - 130 * 60_000                       // doors opened about two hours ago
const arrivals = new Map(Array.from({ length: IPADS }, (_, i) => [i + 1, []]))
const firstAt = new Map()                                     // guest -> the earliest arrival planned, which must win
let twoDoors = 0
shuffled.forEach((g, i) => {
  const desk = (i % IPADS) + 1, at = start + Math.floor((i / shuffled.length) * 120 * 60_000 + rand() * 60_000)
  arrivals.get(desk).push({ g, at })
  firstAt.set(g, at)
  if (rand() < TWO_DOORS) {                                    // scanned again at another door, up to 8 minutes either side
    const other = ((desk + Math.floor(rand() * (IPADS - 1))) % IPADS) + 1, at2 = at + Math.floor((rand() - 0.5) * 16 * 60_000)
    arrivals.get(other).push({ g, at: at2 })
    firstAt.set(g, Math.min(at, at2))
    twoDoors++
  }
})
const sql = (desk, batches, email) => [
  `select set_config('request.jwt.claims', '${JSON.stringify({ email })}', false) \\g /dev/null`, 'set role authenticated;', '\\timing on',
  ...batches.map((b) => `select staff_sync_check_ins($j$${JSON.stringify(b)}$j$::jsonb);`)].join('\n')
const files = {}, sent = {}
for (const [desk, list] of arrivals) {
  list.sort((a, b) => a.at - b.at)
  const items = list.map((a, k) => ({ client_id: `ipad${desk}-${k}`, kind: 'guest', guest_id: a.g, method: k % 3 ? 'search' : 'qr',
    at: new Date(a.at).toISOString(), device: `Door ${desk}` }))
  const batches = []
  let k = 0
  if (OFFLINE_DESKS.includes(desk)) { batches.push(items.slice(0, Math.floor(items.length * 0.4))); k = batches[0].length }
  while (k < items.length) { const n = 1 + Math.floor(rand() * 8); batches.push(items.slice(k, k + n)); k += n }
  if (desk === RETRY_DESK) batches.splice(4, 0, batches[3])  // the answer to batch 4 was lost: the iPad sends it again
  files[`ipad${desk}`] = sql(desk, batches, who(desk))
  sent[`ipad${desk}`] = batches.length
  if (desk === RETRY_DESK) files.retry = sql(desk, [batches[3]], who(desk))   // ...and once more at the same moment
}
files.staffapp = [`select set_config('request.jwt.claims', '${JSON.stringify({ email: staff.gala_admin })}', false) \\g /dev/null`,
  'set role authenticated;', '\\timing on',
  ...Array.from({ length: 40 }, () => 'select jsonb_array_length(staff_checkin_snapshot() -> \'guests\'); select count(*) from checkin_list();')].join('\n')

// ---- Every iPad and the staff app at once, each on its own connection
const dir = mkdtempSync(join(tmpdir(), 'aafe-load-'))
for (const [f, text] of Object.entries(files)) writeFileSync(join(dir, `${f}.sql`), text)
docker('exec', NAME, 'mkdir', '-p', '/load')
for (const f of Object.keys(files)) docker('cp', join(dir, `${f}.sql`), `${NAME}:/load/${f}.sql`)
const run = (f) => new Promise((resolve) => {
  const p = spawn('docker', ['exec', NAME, 'psql', '-U', 'postgres', '-At', '-f', `/load/${f}.sql`])
  let out = '', err = ''
  p.stdout.on('data', (d) => { out += d }); p.stderr.on('data', (d) => { err += d })
  p.on('close', () => resolve({ f, out, err }))
})
const t0 = Date.now()
const results = await Promise.all(Object.keys(files).map(run))
const wall = Date.now() - t0

// ---- What each iPad was told, and how long the syncs took
const status = { checked_in: 0, conflict: 0, already_synced: 0, error: 0 }, errors = [], times = []
for (const r of results) {
  for (const line of r.out.split('\n')) {
    const ms = line.match(/^Time: ([\d.]+) ms/)
    if (ms) { if (r.f !== 'staffapp') times.push(Number(ms[1])); continue }
    if (!line.startsWith('[')) continue
    for (const x of JSON.parse(line)) { status[x.status]++; if (x.status === 'error') errors.push(`${r.f}: ${x.error}`) }
  }
  if (r.err.trim()) errors.push(`${r.f} (whole call failed): ${r.err.trim().split('\n')[0]}`)
}
times.sort((a, b) => a - b)
const pct = (p) => times[Math.min(times.length - 1, Math.floor(p * times.length))] ?? 0

// ---- The invariants: nothing lost, nothing doubled, the first arrival stands, seats follow, one conflict per second arrival
const db = Object.fromEntries(rows(`select g.id || '|' || count(c.id) || '|' || coalesce(extract(epoch from min(c.checked_in_at)) * 1000, 0)::bigint
    || '|' || g.attendance_status || '|' || coalesce(bool_and(s.status = 'checked_in'), true)
  from guests g left join check_ins c on c.guest_id = g.id left join seats s on s.guest_id = g.id
  where g.id = any(array[${guests.map((g) => `'${g}'`).join(',')}]) group by g.id, g.attendance_status`).map((r) => {
  const [id, n, at, att, seats] = r.split('|'); return [id, { n: Number(n), at: Number(at), att, seats: seats === 'true' }]
}))
const lost = guests.filter((g) => db[g].n === 0 || db[g].att !== 'checked_in')
const doubled = guests.filter((g) => db[g].n > 1)
const notFirst = guests.filter((g) => db[g].n === 1 && db[g].at !== firstAt.get(g))
const seatsOff = guests.filter((g) => !db[g].seats)
const conflicts = Number(rows(`select count(*) from audit_log where action = 'checkin.conflict'`)[0])
const checks = [
  [errors.length === 0, `no item refused and no call failed (${errors.length})`],
  [lost.length === 0, `no check-in lost: all ${guests.length} guests checked in (${lost.length} missing)`],
  [doubled.length === 0, `no guest checked in twice (${doubled.length})`],
  [notFirst.length === 0, `the first arrival stands for every guest (${notFirst.length} wrong)`],
  [seatsOff.length === 0, `every checked-in guest's seat says checked in (${seatsOff.length} off)`],
  [conflicts === twoDoors, `one conflict recorded per second arrival (${conflicts} recorded, ${twoDoors} planned)`],
]
console.log(`Load test, seed ${SEED}: ${IPADS} iPads + the staff app, ${guests.length} guests, ${twoDoors} scanned at two doors, ` +
  `${Object.values(sent).reduce((a, b) => a + b, 0) + 1} syncs (two after an offline stretch, one resent twice)`)
console.log(`Answers: ${JSON.stringify(status)} · wall ${(wall / 1000).toFixed(1)} s · sync time median ${pct(0.5)} ms, 95th ${pct(0.95)} ms, max ${times.at(-1)} ms`)
for (const [ok, msg] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}: ${msg}`)
for (const e of [...new Set(errors)].slice(0, 10)) console.log(`  ${e}`)
if (!KEEP) docker('rm', '-f', NAME)
if (checks.some(([ok]) => !ok)) process.exitCode = 1
