// The three labeled demo data sets (decided Oct 7) and the SQL that loads one of them.
// Used by scripts/load-demo-data.mjs (npm run db:load) and by scripts/test-demo-data.mjs, so the test
// runs exactly the SQL the loader sends to Supabase.
import { readFileSync } from 'node:fs'

export const SETS = {
  small: { label: 'Small demo', sql: 'database/seed.sql', json: 'shared/src/seed.json' },
  'full-as-sent': { label: 'Full gala, as sent', sql: 'database/seed.full-as-sent.sql', json: 'shared/src/seed.full-as-sent.json' },
  'full-fixed': { label: 'Full gala, fixed', sql: 'database/seed.full-fixed.sql', json: 'shared/src/seed.full-fixed.json' },
}

// Every table a demo set fills. TRUNCATE ... CASCADE also empties the backend's tables that point at them
// (import runs, review queue, prospects), so nothing from the previous set is left behind.
const DEMO_TABLES = ['gala_events', 'staff_users', 'sponsorship_tiers', 'sponsors', 'orders', 'payments', 'event_tables',
  'guests', 'seats', 'check_ins', 'email_log', 'audit_log', 'salesforce_sync']

/** One SQL script: refuse if the database holds real data, keep the staff list, clear, load the set, restore staff. */
export function buildLoadSql(set, root = new URL('..', import.meta.url)) {
  const s = SETS[set]
  if (!s) throw new Error(`Unknown demo data set "${set}". Choose one of: ${Object.keys(SETS).join(', ')}`)
  // One transaction for the whole load: if anything fails, the database is left exactly as it was.
  const setSql = readFileSync(new URL(s.sql, root), 'utf8').replace(/^begin;\r?$/m, '').replace(/^commit;\r?$/m, '')
  return `-- Load the "${s.label}" demo data set (scripts/demo-data.mjs). Run backend.sql afterwards.
begin;
-- Bulk load with triggers off (as Supabase's own dumps do): the set already holds its activity log, and
-- re-running backend.sql afterwards builds the sponsor pipeline from the orders, as on a fresh database.
set local session_replication_role = replica;
do $$ begin
  if exists (select 1 from gala_events where not is_synthetic) then
    raise exception 'refusing to clear: this database has a gala that is not marked synthetic (real data)';
  end if;
end $$;
-- Keep the staff list: test sign-in emails set for a real person must survive a reload.
create temp table _keep_staff on commit drop as select * from staff_users;
-- Keep each gala's Give Lively page name: staff set it in the app, and Pull now imports nothing without it.
-- The column comes from backend.sql, so a project that hasn't run backend.sql yet has none to keep.
create temp table _keep_pages (id text, page text) on commit drop;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'gala_events' and column_name = 'givelively_page_name') then
    insert into _keep_pages select id, givelively_page_name from gala_events where givelively_page_name is not null;
  end if;
end $$;
truncate table ${DEMO_TABLES.join(', ')} restart identity cascade;
${setSql}
update staff_users s set name = k.name, email = k.email, role = k.role from _keep_staff k where s.id = k.id;
insert into staff_users select k.* from _keep_staff k where not exists (select 1 from staff_users s where s.id = k.id);
do $$ begin
  if exists (select 1 from _keep_pages) then
    update gala_events g set givelively_page_name = k.page from _keep_pages k where g.id = k.id and g.givelively_page_name is null;
  end if;
end $$;
commit;
`
}
