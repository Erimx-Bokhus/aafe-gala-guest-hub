-- =====================================================================
-- AAFE Gala — schedules (run LAST, after deploying the edge functions)
--   givelively-sync       every 15 minutes
--   send-emails           every minute
--   cron-history-cleanup  daily 08:30 UTC
--   sync-prune            daily 08:45 UTC
--   retention-sweep       daily 09:15 UTC
-- Run it with `node scripts/setup-cron.mjs <PROJECT-REF>` from prototype/: it fills in the two <...> values with a new
-- CRON_SECRET nobody sees. Keep CRON_SECRET out of git.
-- =====================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://<PROJECT-REF>.supabase.co', 'project_url');
select vault.create_secret('<SAME VALUE AS THE CRON_SECRET FUNCTION SECRET>', 'cron_secret');

create or replace function call_edge_function(p_name text) returns bigint
language sql security definer set search_path = public as $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/' || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := '{}'::jsonb)
$$;
revoke all on function call_edge_function(text) from public, anon, authenticated;

select cron.schedule('givelively-sync', '*/15 * * * *', $$ select call_edge_function('givelively-sync') $$);
select cron.schedule('send-emails',     '* * * * *',    $$ select call_edge_function('send-emails') $$);
-- pg_cron keeps a row for every run and never deletes them (about 1,540 a day with the two jobs above); the free plan's
-- database stops taking writes at 500 MB. A week of history is enough (docs/operations.md).
select cron.schedule('cron-history-cleanup', '30 8 * * *', $$ delete from cron.job_run_details where end_time < now() - interval '7 days' $$);
-- The staff app's sync keeps a week of deleted-row markers (backend.sql, sync_prune).
select cron.schedule('sync-prune', '45 8 * * *', $$ select sync_prune() $$);
-- Guests' contact details deleted retention_days() after their gala, if staff haven't already (backend.sql, retention_sweep).
select cron.schedule('retention-sweep', '15 9 * * *', $$ select retention_sweep() $$);

-- Check: select * from cron.job_run_details order by start_time desc limit 10;
-- Stop:  select cron.unschedule('givelively-sync');
