// npm run db:local   Loads schema.sql, the small demo set and backend.sql into the local Supabase (npx supabase start),
// through psql inside its database container: `supabase db query --local` runs one statement at a time, and these
// files hold many. Needs a fresh local database: to start over, `npx supabase db reset` first.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const project = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8').match(/^project_id\s*=\s*"([^"]+)"/m)?.[1]
if (!project) { console.error('Stopped: no project_id in supabase/config.toml.'); process.exit(1) }
for (const file of ['schema.sql', 'seed.sql', 'backend.sql']) {
  execFileSync('docker', ['exec', '-i', '-e', 'PGOPTIONS=-c client_min_messages=warning', `supabase_db_${project}`,
    'psql', '-U', 'postgres', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1'],
  { input: readFileSync(new URL(`../database/${file}`, import.meta.url)), stdio: ['pipe', 'ignore', 'inherit'] })
  console.log(`loaded ${file}`)
}
