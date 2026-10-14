// npm run db:load -- <set>   Replaces the demo data in the linked Supabase project with one labeled set:
//   small          today's 48 guests
//   full-as-sent   553 guests in Natalie's shape, as she sent it
//   full-fixed     the same 553 guests with the team's fixes
// It refuses if the database holds a gala that isn't marked synthetic, keeps the staff list (test sign-in
// emails survive) and each gala's Give Lively page name (Pull now needs it), clears the demo tables, loads the set, then re-runs backend.sql so sponsor links and QR
// codes are stored as hashes. Run from prototype/ after `npx supabase link`.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SETS, buildLoadSql } from './demo-data.mjs'

// The pinned Supabase CLI is a Node script, so run it with Node: no shell and no npx, the same on every OS
// (a shell with an argument list is deprecated, DEP0190).
const CLI = fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url))

const set = process.argv[2]
if (!SETS[set]) {
  console.error(`Usage: npm run db:load -- <set>\nSets: ${Object.entries(SETS).map(([k, v]) => `${k} (${v.label})`).join(', ')}`)
  process.exit(1)
}
const dir = mkdtempSync(path.join(tmpdir(), 'aafe-demo-'))
const file = path.join(dir, `load-${set}.sql`)
writeFileSync(file, buildLoadSql(set))
const run = (f) => execFileSync(process.execPath, [CLI, 'db', 'query', '--linked', '-f', f], { stdio: 'inherit' })
try {
  console.log(`Loading "${SETS[set].label}" into the linked Supabase project...`)
  run(file)
  console.log('Re-running backend.sql (hashes the set\'s sponsor links and QR codes)...')
  run('database/backend.sql')
  console.log(`Done: "${SETS[set].label}" is loaded. The staff list was kept. Run npm run db:advisors to check.`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
