// Turns on the schedules (database/cron.sql) on one project without anyone seeing the cron secret.
//   node scripts/setup-cron.mjs <project-ref>        from prototype/, with this folder linked to that project
// 1. stops unless this folder is linked to <project-ref> (supabase/.temp/project-ref), so it can't reach the wrong one;
// 2. makes a new random CRON_SECRET and saves it in the project's function secrets;
// 3. runs database/cron.sql there with the project address and that secret filled in, from a temporary file that is
//    deleted right after, and replaces the two Vault values first so a second run doesn't fail on "already exists";
// 4. lists the scheduled jobs.
// Safe to run again: it replaces the secret, the two Vault values and the jobs instead of adding copies.
// To run a job now, in the SQL editor: select call_edge_function('send-emails');
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const proto = fileURLToPath(new URL('..', import.meta.url))
const want = process.argv[2]
if (!want || !/^[a-z0-9]{20}$/.test(want)) { console.error('Usage: node scripts/setup-cron.mjs <project-ref>   (the 20 letters in the project address)'); process.exit(1) }
const linked = readFileSync(path.join(proto, 'supabase/.temp/project-ref'), 'utf8').trim()
if (linked !== want) { console.error(`Stopped: this folder is linked to ${linked}, not ${want}. Nothing was changed.`); process.exit(1) }

// The pinned Supabase CLI is a Node script: run it with Node, no shell (the same on every OS).
const CLI = path.join(proto, 'node_modules/supabase/dist/supabase.js')
const supabase = (args, opts = {}) => execFileSync(process.execPath, [CLI, ...args], { cwd: proto, encoding: 'utf8', ...opts })
console.log(`Linked project: ${linked}`)

// Fill in cron.sql first, so a changed file stops the run before anything on the project changes.
const secret = randomBytes(32).toString('hex')
const URL_SLOT = "'https://<PROJECT-REF>.supabase.co'", SECRET_SLOT = "'<SAME VALUE AS THE CRON_SECRET FUNCTION SECRET>'"
const sql = readFileSync(path.join(proto, 'database/cron.sql'), 'utf8')
  .replace(URL_SLOT, `'https://${linked}.supabase.co'`)
  .replace(SECRET_SLOT, `'${secret}'`)
if (sql.includes(URL_SLOT) || sql.includes(SECRET_SLOT) || !sql.includes(secret)) {
  console.error('Stopped: cron.sql\'s two placeholders were not found as expected. Nothing was changed.')
  process.exit(1)
}

supabase(['secrets', 'set', `CRON_SECRET=${secret}`], { stdio: ['ignore', 'ignore', 'ignore'] })
console.log('1/3 New CRON_SECRET saved in the function secrets (not shown).')
const dir = mkdtempSync(path.join(tmpdir(), 'aafe-cron-'))
try {
  writeFileSync(path.join(dir, 'cron.sql'), `delete from vault.secrets where name in ('project_url', 'cron_secret');\n${sql}`)
  supabase(['db', 'query', '--linked', '-f', path.join(dir, 'cron.sql')], { stdio: ['ignore', 'ignore', 'ignore'] })
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log('2/3 cron.sql ran (the temporary copy with the secret is deleted).')

// The CLI's JSON is { rows: [...] } (with a note about untrusted data) or, in some versions, the rows alone.
const answer = JSON.parse(supabase(['db', 'query', '--linked', '-o', 'json', 'select jobname, schedule, active from cron.job order by jobname'],
  { stdio: ['ignore', 'pipe', 'ignore'] }))
const jobs = Array.isArray(answer) ? answer : answer.rows ?? []
console.log('3/3 Scheduled jobs:')
for (const j of jobs) console.log(`    ${String(j.jobname).padEnd(22)} ${String(j.schedule).padEnd(14)} ${j.active ? 'on' : 'OFF'}`)
console.log('Done. To send approved emails right away, in the SQL editor: select call_edge_function(\'send-emails\');')
