-- =====================================================================
-- AAFE Gala — BACKEND (Supabase): security, guest-portal API, staff API,
-- Give Lively import, email outbox.
--
-- Run order in the Supabase SQL editor:
--   1. schema.sql   2. seed.sql   3. backend.sql (this file)   4. cron.sql
-- Safe to re-run.
--
-- Rules this file enforces:
--   * Neither app writes tables directly. Every change goes through a
--     function below, and every function writes audit_log. audit_log is
--     append-only (no update/delete for anyone).
--   * Guest Portal (anon key) can only call the 3 portal_* functions,
--     each gated by a private link token. Tokens are stored as SHA-256
--     hashes, so a database leak does not leak working links.
--   * Staff App (logged-in users) is matched to staff_users by email and
--     limited by role: gala_admin, relationship_manager, check_in_volunteer.
--   * Give Lively rows enter through gl_import(), idempotent on the
--     Give Lively transaction ID.
--   * Staff approve every email before it sends (team hard rule 4).
--     Emails wait in email_log as drafts (status 'queued', approved_at null)
--     until staff_approve_email(); a staff member sending their own email
--     (resend link, QR invite) counts as the approver. The send-emails edge
--     function sends approved drafts only. Portal links are minted at send
--     time and expire at the order's guest-list deadline (email_mark_sent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Additions to schema.sql
-- ---------------------------------------------------------------------

-- Give Lively poller cursor + run status (one row).
create table if not exists givelively_sync_state (
  id            int primary key default 1 check (id = 1),
  cursor_ms     bigint,             -- start_time_ms for the next poll
  last_run_at   timestamptz,
  last_status   text,               -- 'ok' | 'error'
  last_error    text,
  last_counts   jsonb
);
insert into givelively_sync_state (id) values (1) on conflict do nothing;

-- Every donation the poller has seen, exactly as Give Lively sent it.
-- Give Lively does not document the JSON field names, so keep the raw
-- payload to check the field mapping against real data.
create table if not exists givelively_raw (
  transaction_id text primary key,
  payload        jsonb not null,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  import_status  text not null check (import_status in ('imported','updated','skipped','not_gala','unmapped')),
  import_note    text
);

-- Outbox bookkeeping for the email worker, and staff approval of every send.
alter table email_log add column if not exists attempts    int not null default 0;
alter table email_log add column if not exists last_error  text;
alter table email_log add column if not exists approved_by text;          -- staff name
alter table email_log add column if not exists approved_at timestamptz;   -- null = draft awaiting approval
alter table email_log add column if not exists created_at  timestamptz not null default now();
alter table email_log add column if not exists payment_id  text references payments(id);  -- payment_receipt: which payment
alter table email_log drop constraint if exists email_log_status_check;
alter table email_log add constraint email_log_status_check check (status in ('queued','sent','opened','bounced','cancelled'));

-- Field edits in the change log, old and new value per field: {"title": {"from": "Manager", "to": "Director"}}.
-- Staff only: the sponsor portal's activity list shows the summary, never this column.
alter table audit_log add column if not exists changes jsonb;

-- One payment per Give Lively transaction.
create unique index if not exists payments_givelively_txn_uq
  on payments (givelively_transaction_id) where givelively_transaction_id is not null;

-- seed.sql inserts explicit ids; move the counters past them.
select setval(pg_get_serial_sequence('audit_log', 'id'), greatest((select max(id) from audit_log), 1));
select setval(pg_get_serial_sequence('salesforce_sync', 'id'), greatest((select max(id) from salesforce_sync), 1));

-- Store portal tokens as hashes (seed tokens are plain text; hash them once).
update orders
   set portal_token = encode(sha256(convert_to(portal_token, 'UTF8')), 'hex')
 where portal_token is not null and portal_token !~ '^[0-9a-f]{64}$';

-- QR e-tickets (hard rule 6): one per seat, stored only as a hash, valid until 6 a.m. New York time
-- the morning after gala night. The code itself exists only in the email that carries it: send-emails
-- mints it when an approved qr_invitation goes out and hands back the hash (email_mark_sent).
alter table seats add column if not exists qr_token_hash       text;
alter table seats add column if not exists qr_token_expires_at timestamptz;
create unique index if not exists seats_qr_token_hash_uq on seats (qr_token_hash) where qr_token_hash is not null;

-- Seed QR codes are plain text on guests; move each to its guest's seat as a hash, once.
update seats s
   set qr_token_hash = encode(sha256(convert_to(upper(g.qr_token), 'UTF8')), 'hex'),
       qr_token_expires_at = ((e.event_date + 1)::timestamp + interval '6 hours') at time zone 'America/New_York'
  from guests g join orders o on o.id = g.order_id join gala_events e on e.id = o.event_id
 where s.guest_id = g.id and g.qr_token is not null;
update guests set qr_token = null where qr_token is not null;

-- Give Lively import (docs/import-matching-spec.md, section 9).
alter table payments    add column if not exists purchase_key text;   -- SHA-256(email | UTC purchase time); see purchase_key()
create unique index if not exists payments_purchase_key_uq on payments (purchase_key) where purchase_key is not null;
alter table guests      add column if not exists display_name text;   -- the name exactly as typed; printed on badges
alter table orders      add column if not exists imported_guest_text text;  -- the export's free-text guest list, as written
alter table gala_events add column if not exists givelively_page_name text; -- e.g. "AAFE's 52nd Annual Gala"; set once per year
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'sponsorship_tiers' and column_name = 'guaranteed_seating') then
    alter table sponsorship_tiers add column guaranteed_seating boolean not null default false;
    -- Sponsorships come with a table; tickets are admittance only (AAFE's 2026 flyer). Staff can change it.
    update sponsorship_tiers set guaranteed_seating = true where tier_category = 'sponsorship';
  end if;
end $$;

-- One row per upload (or sync run that records one).
create table if not exists import_runs (
  id                text primary key,
  event_id          text not null references gala_events(id),
  source            text not null check (source in ('csv','sync')),
  file_name         text,
  file_hash         text,
  started_by        text not null,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  status            text not null default 'running' check (status in ('running','succeeded','failed')),
  earliest_purchase timestamptz,
  latest_purchase   timestamptz,
  counts            jsonb,
  report            jsonb
);

-- Staff review queue. Unclear guest lists are not here: sponsors confirm those in the portal.
create table if not exists import_review (
  id            text primary key,
  run_id        text references import_runs(id),
  event_id      text not null references gala_events(id),
  purchase_key  text,
  order_id      text references orders(id),
  reason        text not null check (reason in ('unknown_tier','guest_text_changed','email_name_conflict','double_booked',
                                                'possible_duplicate','refund','missing_from_source')),
  details       jsonb not null default '{}',
  status        text not null default 'open' check (status in ('open','resolved')),
  resolution    text,
  resolved_by   text,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists import_review_open on import_review (event_id, status, reason);

-- Give Lively tier name -> tier, once per gala ("Ticket" -> Supporter).
create table if not exists tier_mappings (
  id              text primary key,
  event_id        text not null references gala_events(id),
  givelively_name text not null,
  name_key        text not null,   -- name_key(givelively_name)
  tier_id         text not null references sponsorship_tiers(id),
  created_by      text not null,
  created_at      timestamptz not null default now(),
  unique (event_id, name_key)
);

-- ---------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------

create or replace function hash_token(t text) returns text
language sql immutable set search_path = public as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;

create or replace function new_id(prefix text) returns text
language sql volatile set search_path = public as $$ select prefix || '-' || left(replace(gen_random_uuid()::text, '-', ''), 12) $$;

-- 128 random bits (32 hex chars), used for QR codes.
create or replace function new_qr_token() returns text
language sql volatile set search_path = public as $$ select 'AAFE-' || upper(left(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 32)) $$;

-- When a QR e-ticket for this event stops working: 6 a.m. New York time the morning after gala night.
create or replace function qr_expiry(p_event_id text) returns timestamptz
language sql stable security definer set search_path = public as $$
  select ((event_date + 1)::timestamp + interval '6 hours') at time zone 'America/New_York' from gala_events where id = p_event_id
$$;

-- A QR code admits whoever holds the seat, so it stops working when the seat gets a different guest,
-- or when the guest on it becomes a different person (name or email edited). Staff send a new one.
create or replace function seats_void_qr() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.guest_id is distinct from old.guest_id or new.status = 'cancelled' then
    new.qr_token_hash := null; new.qr_token_expires_at := null;
  end if;
  return new;
end $$;
drop trigger if exists seats_void_qr on seats;
create trigger seats_void_qr before update of guest_id, status on seats for each row execute function seats_void_qr();

create or replace function guests_void_qr() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.first_name, new.last_name, new.email) is distinct from (old.first_name, old.last_name, old.email) then
    update seats set qr_token_hash = null, qr_token_expires_at = null where guest_id = new.id and qr_token_hash is not null;
  end if;
  return new;
end $$;
drop trigger if exists guests_void_qr on guests;
create trigger guests_void_qr after update of first_name, last_name, email on guests for each row execute function guests_void_qr();

-- The gala being run now: the latest one not closed.
create or replace function current_event_id() returns text
language sql stable security definer set search_path = public as $$
  select id from gala_events where status <> 'closed' order by year desc limit 1
$$;

-- Logged-in staff member, matched by the verified email on the Supabase Auth JWT.
create or replace function current_staff() returns staff_users
language sql stable security definer set search_path = public as $$
  select * from staff_users where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function staff_role() returns text
language sql stable security definer set search_path = public as $$ select (current_staff()).role $$;

create or replace function require_staff(roles text[]) returns staff_users
language plpgsql stable security definer set search_path = public as $$
declare s staff_users := current_staff();
begin
  if s.id is null or not (s.role = any (roles)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return s;
end $$;

-- p_changes: old and new value of each edited field (audit_changes()), or null.
drop function if exists write_audit(text, text, text, text, text, text, text, text, boolean, text);
create or replace function write_audit(
  p_actor_type text, p_actor text, p_entity text, p_entity_id text, p_order_id text,
  p_action text, p_from text, p_to text, p_guest_visible boolean, p_summary text, p_changes jsonb default null
) returns void language sql security definer set search_path = public as $$
  insert into audit_log (actor_type, actor, entity, entity_id, order_id, action, from_state, to_state, guest_visible, summary, changes)
  values (p_actor_type, p_actor, p_entity, p_entity_id, p_order_id, p_action, p_from, p_to, p_guest_visible, p_summary, p_changes)
$$;

-- {"field": {"from": old, "to": new}} for each listed field whose value differs; null when none does.
create or replace function audit_changes(p_old jsonb, p_new jsonb, p_fields text[]) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_object_agg(f, jsonb_build_object('from', p_old -> f, 'to', p_new -> f))
    from unnest(p_fields) f
   where p_old -> f is distinct from p_new -> f
$$;

-- p_approved_by: the staff member sending their own email. Null = draft for staff approval.
-- p_payment_id: the payment a payment_receipt confirms.
drop function if exists enqueue_email(text, text, text, text, text, text);
drop function if exists enqueue_email(text, text, text, text, text, text, text);
create or replace function enqueue_email(
  p_template text, p_to text, p_to_name text, p_order_id text, p_guest_id text, p_trigger text, p_approved_by text default null,
  p_payment_id text default null
) returns text language plpgsql security definer set search_path = public as $$
declare v_id text := new_id('em');
begin
  insert into email_log (id, template, to_email, to_name, order_id, guest_id, payment_id, trigger, status, approved_by, approved_at)
  values (v_id, p_template, p_to, p_to_name, p_order_id, p_guest_id, p_payment_id, p_trigger, 'queued',
          p_approved_by, case when p_approved_by is not null then now() end);
  return v_id;
end $$;

create or replace function create_seats(p_order_id text, p_count int) returns void
language sql security definer set search_path = public as $$
  insert into seats (id, order_id, slot_number, guest_id, status)
  select 'seat-' || p_order_id || '-' || n, p_order_id, n, null, 'unnamed' from generate_series(1, p_count) n
$$;

create or replace function money_fmt(n numeric) returns text
language sql immutable set search_path = public as $$ select '$' || to_char(n, 'FM999,999,990.00') $$;

-- ---------------------------------------------------------------------
-- 3. Row-level security
--    Reads: gala_admin + relationship_manager read everything.
--           check_in_volunteer reads nothing directly (uses checkin_list()).
--    Writes: only gala_admin, only on setup tables. Everything else goes
--           through the functions below so it is always audited.
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['gala_events','staff_users','sponsorship_tiers','sponsors','orders','payments',
    'event_tables','guests','seats','check_ins','email_log','audit_log','salesforce_sync',
    'givelively_sync_state','givelively_raw','import_runs','import_review','tier_mappings']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists staff_read on %I', t);
    execute format($p$create policy staff_read on %I for select to authenticated
                     using (staff_role() in ('gala_admin','relationship_manager'))$p$, t);
  end loop;

  foreach t in array array['gala_events','sponsorship_tiers','event_tables','staff_users']
  loop
    -- Separate insert/update/delete policies: a FOR ALL policy would also cover SELECT and
    -- overlap staff_read (Supabase advisor: multiple permissive policies).
    execute format('drop policy if exists admin_write on %I', t);
    execute format('drop policy if exists admin_insert on %I', t);
    execute format('drop policy if exists admin_update on %I', t);
    execute format('drop policy if exists admin_delete on %I', t);
    execute format($p$create policy admin_insert on %I for insert to authenticated
                     with check (staff_role() = 'gala_admin')$p$, t);
    execute format($p$create policy admin_update on %I for update to authenticated
                     using (staff_role() = 'gala_admin') with check (staff_role() = 'gala_admin')$p$, t);
    execute format($p$create policy admin_delete on %I for delete to authenticated
                     using (staff_role() = 'gala_admin')$p$, t);
  end loop;
end $$;

-- audit_log is append-only, even for the table owner's API roles.
revoke update, delete, truncate on audit_log from anon, authenticated;

-- Views must respect the caller's RLS, not the view owner's.
alter view v_payment_ledger set (security_invoker = true);
alter view v_fee_totals    set (security_invoker = true);

-- ---------------------------------------------------------------------
-- 4. GUEST PORTAL API  (anon; the link token is the only credential)
--    supabase.rpc('portal_get_view',     { p_token })
--    supabase.rpc('portal_save_guest',   { p_token, p_slot, p_guest })
--    supabase.rpc('portal_release_seat', { p_token, p_slot })
--    Never returns payment method, fees, internal notes, relationship
--    owner, relationship_note, or other orders.
-- ---------------------------------------------------------------------

create or replace function portal_order(p_token text) returns orders
language plpgsql stable security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders
   where portal_token = hash_token(coalesce(p_token, ''))
     and status <> 'cancelled'
     and (portal_token_expires_at is null or portal_token_expires_at > now());
  if o.id is null then raise exception 'invalid_link' using errcode = 'P0002'; end if;
  return o;
end $$;

create or replace function portal_get_view(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  o orders := portal_order(p_token);
  v_applied numeric; v_paid numeric; v_balance numeric; v_n int; v_view jsonb;
begin
  select coalesce(sum(original_amount - refunded_amount), 0), coalesce(sum(gross_amount - refunded_amount), 0), count(*)
    into v_applied, v_paid, v_n from payments where order_id = o.id;
  v_balance := greatest(0, o.commitment_amount - v_applied);

  select jsonb_build_object(
    'orderId', o.id,
    'organization', sp.organization_name,
    'contactName', sp.primary_contact_name,
    'tierName', t.name,
    'deadline', o.guest_list_deadline,
    'event', jsonb_build_object('name', e.name, 'date', e.event_date, 'doors', e.doors_time,
                                'venue', e.venue_name, 'address', e.venue_address, 'dress', e.dress_code),
    'money', jsonb_build_object(
      'commitment', o.commitment_amount, 'paid', v_paid, 'balance', v_balance,
      'status', case when o.status = 'comp' then 'comp' when v_balance <= 0.005 and v_n > 0 then 'paid'
                     when v_n > 0 then 'partial' else 'pledged' end,
      'payments', coalesce((select jsonb_agg(jsonb_build_object('date', p.received_at, 'amount', p.gross_amount) order by p.received_at)
                              from payments p where p.order_id = o.id), '[]')),
    'stats', (select jsonb_build_object(
                'total', count(*), 'named', count(*) filter (where s.status <> 'unnamed'),
                'unnamed', count(*) filter (where s.status = 'unnamed'),
                'needsReview', count(*) filter (where s.status = 'submitted'),
                'badgeReady', count(*) filter (where s.status in ('badge_ready','checked_in')))
              from seats s where s.order_id = o.id and s.status <> 'cancelled'),
    'seats', coalesce((select jsonb_agg(jsonb_build_object(
                'slot', s.slot_number, 'status', s.status,
                'guest', case when g.id is null then null else jsonb_build_object(
                  'first_name', g.first_name, 'last_name', g.last_name, 'title', coalesce(g.title, ''),
                  'organization', coalesce(g.organization, ''), 'email', coalesce(g.email, ''),
                  'dietary_needs', coalesce(g.dietary_needs, ''), 'accessibility_needs', coalesce(g.accessibility_needs, ''),
                  'updated_at', g.updated_at) end) order by s.slot_number)
              from seats s left join guests g on g.id = s.guest_id
              where s.order_id = o.id and s.status <> 'cancelled'), '[]'),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('at', a.at, 'action', a.action, 'summary', a.summary) order by a.at desc, a.id desc)
              from audit_log a where a.order_id = o.id and a.guest_visible), '[]'))
  into v_view
  from sponsors sp, sponsorship_tiers t, gala_events e
  where sp.id = o.sponsor_id and t.id = o.tier_id and e.id = o.event_id;
  return v_view;
end $$;

create or replace function portal_save_guest(p_token text, p_slot int, p_guest jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o orders := portal_order(p_token);
  st seats; g guests; g_old guests; v_contact text; v_action text; v_from text;
  v_first text := left(trim(coalesce(p_guest ->> 'first_name', '')), 100);
  v_last  text := left(trim(coalesce(p_guest ->> 'last_name', '')), 100);
  f_title text := nullif(left(trim(coalesce(p_guest ->> 'title', '')), 200), '');
  f_org   text := nullif(left(trim(coalesce(p_guest ->> 'organization', '')), 200), '');
  f_email text := nullif(left(trim(coalesce(p_guest ->> 'email', '')), 254), '');
  f_diet  text := nullif(left(trim(coalesce(p_guest ->> 'dietary_needs', '')), 500), '');
  f_acc   text := nullif(left(trim(coalesce(p_guest ->> 'accessibility_needs', '')), 500), '');
begin
  if v_first = '' or v_last = '' then raise exception 'invalid_input: first and last name are required'; end if;
  select * into st from seats where order_id = o.id and slot_number = p_slot and status <> 'cancelled' for update;
  if st.id is null then raise exception 'invalid_input: no such seat'; end if;
  if st.status = 'checked_in' then raise exception 'seat_locked: guest already checked in'; end if;
  select primary_contact_name into v_contact from sponsors where id = o.sponsor_id;
  v_from := st.status;

  if st.guest_id is not null then
    v_action := 'guest.updated';
    select * into g_old from guests where id = st.guest_id;
    update guests set first_name = v_first, last_name = v_last, title = f_title, organization = f_org, email = f_email,
           dietary_needs = f_diet, accessibility_needs = f_acc, last_updated_by = 'guest_portal', updated_at = now(),
           -- editing a printed badge means it must be reprinted
           badge_status = case when badge_status = 'printed' then 'reprint_needed' else 'needs_review' end
     where id = st.guest_id returning * into g;
  else
    v_action := 'guest.submitted';
    insert into guests (id, order_id, first_name, last_name, title, organization, email, dietary_needs, accessibility_needs,
                        guest_type, last_updated_by)
    values (new_id('g'), o.id, v_first, v_last, f_title, f_org, f_email, f_diet, f_acc,
            case when o.tier_id like '%ticket' then 'ticket_holder' else 'sponsor_guest' end, 'guest_portal')
    returning * into g;
  end if;

  update seats set guest_id = g.id, status = 'submitted', updated_at = now() where id = st.id;
  perform write_audit('guest_portal', 'Guest portal (' || v_contact || ')', 'guest', g.id, o.id, v_action, v_from, 'submitted', true,
    case when v_action = 'guest.submitted' then format('%s %s added to seat %s.', v_first, v_last, p_slot)
         else format('%s %s updated (seat %s).', v_first, v_last, p_slot) end,
    case when v_action = 'guest.updated' then audit_changes(to_jsonb(g_old), to_jsonb(g),
      array['first_name','last_name','title','organization','email','dietary_needs','accessibility_needs']) end);
  return portal_get_view(p_token);
end $$;

create or replace function portal_release_seat(p_token text, p_slot int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders := portal_order(p_token); st seats; g guests;
begin
  select * into st from seats where order_id = o.id and slot_number = p_slot and status <> 'cancelled' for update;
  if st.id is null then raise exception 'invalid_input: no such seat'; end if;
  if st.status = 'checked_in' then raise exception 'seat_locked: guest already checked in'; end if;
  select * into g from guests where id = st.guest_id;
  if g.id is null then return portal_get_view(p_token); end if;

  update seats set guest_id = null, status = 'unnamed', updated_at = now() where id = st.id;
  delete from guests where id = g.id;
  perform write_audit('guest_portal', 'Guest portal', 'guest', g.id, o.id, 'guest.removed', st.status, 'unnamed', true,
    format('%s %s removed from seat %s.', g.first_name, g.last_name, p_slot));
  return portal_get_view(p_token);
end $$;

-- ---------------------------------------------------------------------
-- 5. STAFF APP API  (authenticated; role checked in every function)
--    Names match staff-app/src/store.ts.
-- ---------------------------------------------------------------------

create or replace function staff_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(s) from (select (current_staff()).*) s where s.id is not null
$$;

-- updateGuest
create or replace function staff_update_guest(p_guest_id text, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  me staff_users := require_staff(array['gala_admin','relationship_manager']);
  allowed text[] := array['first_name','last_name','title','organization','email','dietary_needs','accessibility_needs','relationship_note'];
  g guests; n guests; v_patch jsonb; v_changed text[];
begin
  select * into g from guests where id = p_guest_id for update;
  if g.id is null then raise exception 'not_found'; end if;
  select coalesce(jsonb_object_agg(key, case when jsonb_typeof(value) = 'string' and trim(value #>> '{}') = '' then 'null'::jsonb else value end), '{}')
    into v_patch from jsonb_each(coalesce(p_patch, '{}')) where key = any (allowed);
  n := jsonb_populate_record(g, v_patch);
  if coalesce(trim(n.first_name), '') = '' or coalesce(trim(n.last_name), '') = '' then
    raise exception 'invalid_input: first and last name are required';
  end if;
  select coalesce(array_agg(k), '{}') into v_changed from unnest(allowed) k where to_jsonb(n) -> k is distinct from to_jsonb(g) -> k;
  if cardinality(v_changed) = 0 then return; end if;

  update guests set first_name = n.first_name, last_name = n.last_name, title = n.title, organization = n.organization,
         email = n.email, dietary_needs = n.dietary_needs, accessibility_needs = n.accessibility_needs,
         relationship_note = n.relationship_note, last_updated_by = 'staff', updated_at = now(),
         badge_status = case when badge_status = 'printed'
                              and v_changed && array['first_name','last_name','title','organization'] then 'reprint_needed'
                             else badge_status end
   where id = g.id;
  perform write_audit('staff', me.name, 'guest', g.id, g.order_id, 'guest.updated', null, null, false,
    format('%s %s: %s edited by staff.', n.first_name, n.last_name, array_to_string(v_changed, ', ')),
    audit_changes(to_jsonb(g), to_jsonb(n), v_changed));
end $$;

-- setSeatStatus: submitted -> reviewed, reviewed -> badge_ready (needs table + seat)
create or replace function staff_set_seat_status(p_guest_id text, p_to text) returns void
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); st seats; g guests;
begin
  select * into g from guests where id = p_guest_id;
  select * into st from seats where guest_id = p_guest_id for update;
  if g.id is null or st.id is null then raise exception 'not_found'; end if;
  if not ((p_to = 'reviewed' and st.status = 'submitted') or (p_to = 'badge_ready' and st.status = 'reviewed')) then
    raise exception 'invalid_transition: % -> %', st.status, p_to;
  end if;
  if p_to = 'badge_ready' and (g.table_id is null or g.seat_number is null) then
    raise exception 'invalid_transition: assign a table and seat first';
  end if;

  update seats set status = p_to, updated_at = now() where id = st.id;
  if p_to = 'badge_ready' then
    update guests set badge_status = case when badge_status = 'printed' then 'printed' else 'ready' end where id = g.id;
  end if;
  perform write_audit('staff', me.name, 'seat', st.id, g.order_id,
    case when p_to = 'reviewed' then 'seat.reviewed' else 'badge.ready' end, st.status, p_to, p_to = 'reviewed',
    case when p_to = 'reviewed' then format('%s %s confirmed by AAFE.', g.first_name, g.last_name)
         else format('%s %s badge marked ready.', g.first_name, g.last_name) end);
end $$;

-- markPrinted
create or replace function staff_mark_printed(p_guest_ids text[]) returns int
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); v_n int;
begin
  update guests set badge_status = 'printed' where id = any (p_guest_ids);
  get diagnostics v_n = row_count;
  perform write_audit('staff', me.name, 'badge', array_to_string(p_guest_ids, ','), null, 'badge.printed', null, 'printed', false,
    format('%s badge(s) marked printed.', v_n));
  return v_n;
end $$;

-- assignSeat (p_table_id null = remove from seating chart)
create or replace function staff_assign_seat(p_guest_id text, p_table_id text, p_seat int) returns void
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); g guests; t event_tables;
begin
  select * into g from guests where id = p_guest_id for update;
  if g.id is null then raise exception 'not_found'; end if;
  if p_table_id is not null then
    select * into t from event_tables where id = p_table_id;
    if t.id is null or p_seat is null or p_seat < 1 or p_seat > t.capacity then raise exception 'invalid_input: no such table or seat'; end if;
    if exists (select 1 from guests where table_id = p_table_id and seat_number = p_seat and id <> g.id) then
      raise exception 'seat_taken';
    end if;
  end if;
  if g.table_id is not distinct from p_table_id and g.seat_number is not distinct from p_seat then return; end if;

  update guests set table_id = p_table_id, seat_number = case when p_table_id is null then null else p_seat end, updated_at = now(),
         badge_status = case when badge_status = 'printed' then 'reprint_needed' else badge_status end
   where id = g.id;
  perform write_audit('staff', me.name, 'guest', g.id, g.order_id,
    case when p_table_id is null then 'seat.unassigned' else 'seat.assigned' end,
    case when g.table_id is null then null else g.table_id || '/' || g.seat_number end,
    case when p_table_id is null then null else p_table_id || '/' || p_seat end, false,
    case when p_table_id is null then format('%s %s removed from seating chart.', g.first_name, g.last_name)
         else format('%s %s seated at Table %s, seat %s.', g.first_name, g.last_name, t.number, p_seat) end);
end $$;

-- seatOrderAtTable: seat every unseated guest of an order at the first open seats of one table.
create or replace function staff_seat_order_at_table(p_order_id text, p_table_id text) returns int
language plpgsql security definer set search_path = public as $$
declare t event_tables; g record; v_free int; v_n int := 0;
begin
  perform require_staff(array['gala_admin','relationship_manager']);
  select * into t from event_tables where id = p_table_id;
  if t.id is null then raise exception 'not_found'; end if;
  for g in select id from guests where order_id = p_order_id and table_id is null order by created_at loop
    select n into v_free from generate_series(1, t.capacity) n
     where not exists (select 1 from guests where table_id = t.id and seat_number = n) order by n limit 1;
    exit when v_free is null;
    perform staff_assign_seat(g.id, t.id, v_free);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- recordOfflinePayment: check, or ACH/wire straight to AAFE's bank. No processor fee.
create or replace function staff_record_payment(p_order_id text, p_method text, p_amount numeric, p_received date, p_check_number text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  me staff_users := require_staff(array['gala_admin','relationship_manager']);
  o orders; sp sponsors; v_id text := new_id('pay'); v_applied numeric; v_status text;
begin
  if p_method not in ('check','ach_direct','wire') then raise exception 'invalid_input: method must be check, ach_direct or wire'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_input: amount must be positive'; end if;
  select * into o from orders where id = p_order_id for update;
  if o.id is null then raise exception 'not_found'; end if;

  insert into payments (id, order_id, method, processor, check_number, original_amount, covered_fee_amount, gross_amount,
                        transaction_fee_amount, refunded_amount, net_amount, received_at, recorded_by, reconciliation_status)
  values (v_id, o.id, p_method, 'none', nullif(trim(p_check_number), ''), p_amount, 0, p_amount, 0, 0, p_amount,
          (p_received::timestamp + time '12:00') at time zone 'America/New_York', me.id, 'unreconciled');

  select sum(original_amount - refunded_amount) into v_applied from payments where order_id = o.id;
  v_status := case when o.status = 'comp' then 'comp' when v_applied + 0.005 >= o.commitment_amount then 'paid' else 'partially_paid' end;
  update orders set status = v_status, updated_at = now() where id = o.id;
  perform write_audit('staff', me.name, 'payment', v_id, o.id, 'payment.recorded', o.status, v_status, true,
    format('Payment received: %s.', money_fmt(p_amount)));

  select * into sp from sponsors where id = o.sponsor_id;
  -- First money in and no link yet: send the guest-list link.
  if o.portal_link_sent_at is null and exists (select 1 from seats where order_id = o.id and status <> 'cancelled') then
    perform enqueue_email('portal_link', sp.primary_contact_email, sp.primary_contact_name, o.id, null, 'payment_recorded');
  end if;
  -- A payment confirmation for staff to review and send. Only for payments staff record (check, ACH,
  -- wire): Give Lively sends its own receipts.
  perform enqueue_email('payment_receipt', sp.primary_contact_email, sp.primary_contact_name, o.id, null, 'payment_recorded',
                        null, v_id);
  return v_id;
end $$;

-- addPledge: sponsor will pay by check / direct ACH / wire. Link is emailed right away.
create or replace function staff_add_pledge(p_org text, p_contact text, p_email text, p_tier_id text, p_source text)
returns text language plpgsql security definer set search_path = public as $$
declare
  me staff_users := require_staff(array['gala_admin','relationship_manager']);
  t sponsorship_tiers; e gala_events; v_sp text := new_id('sp'); v_order text := new_id('ord');
begin
  if p_source not in ('check','ach_direct','wire') then raise exception 'invalid_input: source must be check, ach_direct or wire'; end if;
  if coalesce(trim(p_org), '') = '' or coalesce(trim(p_contact), '') = '' or coalesce(trim(p_email), '') = '' then
    raise exception 'invalid_input: organization, contact and email are required';
  end if;
  select * into t from sponsorship_tiers where id = p_tier_id;
  select * into e from gala_events where id = current_event_id();
  if t.id is null or e.id is null then raise exception 'not_found'; end if;

  insert into sponsors (id, organization_name, primary_contact_name, primary_contact_email, phone, relationship_owner_id)
  values (v_sp, trim(p_org), trim(p_contact), trim(p_email), '', me.id);
  insert into orders (id, event_id, sponsor_id, tier_id, source, commitment_amount, status, guest_list_deadline,
                      logo_status, program_ad_status, internal_notes)
  values (v_order, e.id, v_sp, t.id, p_source, t.contribution_amount, 'pledged', e.guest_list_deadline,
          case when 'logo' = any (t.required_materials) then 'pending' else 'not_required' end,
          case when exists (select 1 from unnest(t.required_materials) m where m like '%ad') then 'pending' else 'not_required' end, '');
  perform create_seats(v_order, t.included_seat_count);
  perform write_audit('staff', me.name, 'order', v_order, v_order, 'order.created', null, 'pledged', true,
    format('%s recorded for %s (%s).', t.name, trim(p_org), p_source));
  if t.included_seat_count > 0 then
    perform enqueue_email('portal_link', trim(p_email), trim(p_contact), v_order, null, 'pledge_recorded');
  end if;
  return v_order;
end $$;

-- addCompGuest: relationship guest (ED / board invite) with a QR code.
create or replace function staff_add_comp_guest(p_guest jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  me staff_users := require_staff(array['gala_admin','relationship_manager']);
  v_order text; v_sp text; v_guest text := new_id('g'); v_slot int;
  v_first text := trim(coalesce(p_guest ->> 'first_name', '')); v_last text := trim(coalesce(p_guest ->> 'last_name', ''));
  v_note text := nullif(trim(coalesce(p_guest ->> 'relationship_note', '')), '');
begin
  if v_first = '' or v_last = '' then raise exception 'invalid_input: first and last name are required'; end if;
  select id into v_order from orders
   where event_id = current_event_id() and tier_id = 'comp_relationship' and status <> 'cancelled' order by created_at limit 1;
  if v_order is null then
    v_sp := new_id('sp'); v_order := new_id('ord');
    insert into sponsors (id, organization_name, primary_contact_name, primary_contact_email, phone, relationship_owner_id)
    values (v_sp, 'AAFE — Relationship guests', me.name, me.email, '', me.id);
    insert into orders (id, event_id, sponsor_id, tier_id, source, commitment_amount, status, internal_notes)
    values (v_order, current_event_id(), v_sp, 'comp_relationship', 'comp', 0, 'comp', 'Complimentary relationship guests.');
  end if;
  select coalesce(max(slot_number), 0) + 1 into v_slot from seats where order_id = v_order;

  insert into guests (id, order_id, first_name, last_name, title, organization, email, guest_type, relationship_note, qr_token, last_updated_by)
  values (v_guest, v_order, v_first, v_last, nullif(trim(coalesce(p_guest ->> 'title', '')), ''),
          nullif(trim(coalesce(p_guest ->> 'organization', '')), ''), nullif(trim(coalesce(p_guest ->> 'email', '')), ''),
          'comp_relationship', v_note, null, 'staff');
  insert into seats (id, order_id, slot_number, guest_id, status) values ('seat-' || v_order || '-' || v_slot, v_order, v_slot, v_guest, 'reviewed');
  perform write_audit('staff', me.name, 'guest', v_guest, v_order, 'comp_guest.added', null, 'reviewed', false,
    format('%s %s added as relationship guest (%s).', v_first, v_last, coalesce(v_note, 'no note')));
  return v_guest;
end $$;

-- sendQrInvite
create or replace function staff_send_qr_invite(p_guest_id text) returns text
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); g guests;
begin
  select * into g from guests where id = p_guest_id;
  if g.id is null then raise exception 'not_found'; end if;
  if not exists (select 1 from seats where guest_id = g.id and status <> 'cancelled') then
    raise exception 'invalid_input: guest has no seat';
  end if;
  if g.email is null then raise exception 'invalid_input: guest has no email'; end if;
  return enqueue_email('qr_invitation', g.email, g.first_name || ' ' || g.last_name, g.order_id, g.id, 'staff_manual', me.name);
end $$;

-- resendPortalLink. Sending mints a NEW link; the old link stops working.
create or replace function staff_resend_portal_link(p_order_id text) returns text
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); sp sponsors;
begin
  select s.* into sp from orders o join sponsors s on s.id = o.sponsor_id where o.id = p_order_id;
  if sp.id is null then raise exception 'not_found'; end if;
  return enqueue_email('portal_link', sp.primary_contact_email, sp.primary_contact_name, p_order_id, null, 'staff_manual', me.name);
end $$;

-- Check-in screen data for all roles (volunteers cannot read tables directly).
create or replace function checkin_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when (require_staff(array['gala_admin','relationship_manager','check_in_volunteer'])).id is null then null else
    coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'order_id', g.order_id, 'first_name', g.first_name, 'last_name', g.last_name, 'title', g.title,
      'organization', g.organization, 'sponsor', sp.organization_name, 'guest_type', g.guest_type,
      'table_number', t.number, 'seat_number', g.seat_number, 'attendance_status', g.attendance_status,
      'accessibility_needs', g.accessibility_needs) order by g.last_name, g.first_name), '[]') end
  from guests g join orders o on o.id = g.order_id join sponsors sp on sp.id = o.sponsor_id
  left join event_tables t on t.id = g.table_id
  where o.event_id = current_event_id() and o.status <> 'cancelled'
$$;

-- checkIn (search). Returns false if the guest was already checked in.
create or replace function staff_check_in(p_guest_id text, p_method text default 'search') returns boolean
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager','check_in_volunteer']); g guests; v_id text := new_id('ci');
begin
  if p_method not in ('qr','search') then raise exception 'invalid_input: method must be qr or search'; end if;
  select * into g from guests where id = p_guest_id for update;
  if g.id is null then raise exception 'not_found'; end if;
  if g.attendance_status = 'checked_in' then return false; end if;
  insert into check_ins (id, event_id, guest_id, order_id, method, type, checked_in_by, note)
  values (v_id, current_event_id(), g.id, g.order_id, p_method, 'standard', me.name, '');
  update guests set attendance_status = 'checked_in' where id = g.id;
  update seats set status = 'checked_in', updated_at = now() where guest_id = g.id;
  perform write_audit('staff', me.name, 'check_in', v_id, g.order_id, 'checkin.arrived', 'expected', 'checked_in', false,
    format('%s %s checked in (%s).', g.first_name, g.last_name, p_method));
  return true;
end $$;

-- checkIn (QR scan or typed code). Returns the guest so the screen can show who arrived.
create or replace function staff_check_in_qr(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g guests; v_new boolean; v_guest_id text; v_expires timestamptz;
begin
  perform require_staff(array['gala_admin','relationship_manager','check_in_volunteer']);
  select s.guest_id, s.qr_token_expires_at into v_guest_id, v_expires from seats s
   where s.qr_token_hash = hash_token(upper(trim(coalesce(p_code, '')))) and s.status <> 'cancelled' and s.guest_id is not null;
  select * into g from guests where id = v_guest_id;
  if g.id is null then raise exception 'not_found: unknown QR code'; end if;
  if v_expires <= now() then raise exception 'expired: QR code has expired'; end if;
  v_new := staff_check_in(g.id, 'qr');
  return jsonb_build_object('guest_id', g.id, 'first_name', g.first_name, 'last_name', g.last_name, 'already_checked_in', not v_new);
end $$;

-- checkInException: walk-in, unnamed sponsor seat, etc.
create or replace function staff_check_in_exception(p_name text, p_order_id text, p_type text, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager','check_in_volunteer']); v_id text := new_id('ci');
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_type), '') = '' then raise exception 'invalid_input: name and type are required'; end if;
  insert into check_ins (id, event_id, order_id, arrival_name, method, type, checked_in_by, note)
  values (v_id, current_event_id(), p_order_id, trim(p_name), 'exception', p_type, me.name, coalesce(p_note, ''));
  perform write_audit('staff', me.name, 'check_in', v_id, p_order_id, 'checkin.exception', null, 'checked_in', false,
    format('%s checked in as exception: %s.', trim(p_name), p_type));
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 6. GIVE LIVELY IMPORT  (docs/import-matching-spec.md)
--    Input: jsonb array of normalized rows. The JSON sync and the CSV
--    upload both normalize to this shape:
--      { purchase_key?, txn?, date, first, last, email, company, campaign,
--        ticket_level, tier_id?, method, status?, quantity, seats?, original,
--        covered, gross, fee, net, refunded, guest_text?, guests?, findings? }
--    The CSV upload sends rows prepared by import-engine/ (prepareUpload +
--    toGlImportRows): purchase_key, tier_id, seats, the parsed guests, and
--    matching findings. The JSON sync sends the older shape; the purchase
--    key and tier are then worked out here with the same rules.
--    Fees are stored as Give Lively reports them, never recomputed.
--    This function is the only place that writes imported data.
-- ---------------------------------------------------------------------

-- Same key as import-engine/src/purchaseKey.ts: SHA-256 of
-- "<email, trimmed and lower-cased>|<purchase time in UTC, to the second>".
create or replace function purchase_key(p_email text, p_at timestamptz) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(
    lower(btrim(coalesce(p_email, ''), E' \t\r\n')) || '|' || to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'UTF8')), 'hex')
$$;

-- Tier names and page names compare NFKC, case-folded, trimmed, inner spaces collapsed.
create or replace function name_key(p text) returns text
language sql immutable set search_path = public as $$ select lower(regexp_replace(btrim(normalize(coalesce(p, ''), NFKC)), '\s+', ' ', 'g')) $$;

-- One staff review item, unless the same one (same purchase, reason and details) already exists,
-- open or resolved: a resolved item doesn't come back for the same data.
create or replace function add_import_review(
  p_run_id text, p_key text, p_order_id text, p_reason text, p_details jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from import_review where purchase_key is not distinct from p_key and reason = p_reason
               and details = coalesce(p_details, '{}'::jsonb)) then
    return false;
  end if;
  insert into import_review (id, run_id, event_id, purchase_key, order_id, reason, details)
  values (new_id('rev'), p_run_id, current_event_id(), p_key, p_order_id, p_reason, coalesce(p_details, '{}'::jsonb));
  return true;
end $$;

-- Pre-fill parsed guests into the order's next free seats (status 'submitted'), as Give Lively's.
-- Called only for an order nobody has named yet, so sponsor and staff names are never overwritten.
create or replace function import_fill_guests(p_order_id text, p_guests jsonb, p_guest_type text) returns int
language plpgsql security definer set search_path = public as $$
declare g jsonb; st seats; v_id text; v_display text; v_first text; v_last text; v_n int := 0;
begin
  for g in select * from jsonb_array_elements(coalesce(p_guests, '[]')) loop
    select * into st from seats where order_id = p_order_id and guest_id is null and status = 'unnamed'
     order by slot_number limit 1 for update;
    exit when st.id is null;
    v_display := btrim(coalesce(g ->> 'display_name', ''));
    continue when v_display = '';
    v_first := coalesce(nullif(btrim(g ->> 'first_name'), ''), nullif(regexp_replace(v_display, '\s+\S+$', ''), v_display), v_display);
    v_last  := coalesce(nullif(btrim(g ->> 'last_name'), ''), case when v_display ~ '\s' then regexp_replace(v_display, '^.*\s', '') else '' end);
    v_id := new_id('g');
    insert into guests (id, order_id, first_name, last_name, display_name, email, guest_type, last_updated_by)
    values (v_id, p_order_id, v_first, v_last, v_display, nullif(lower(btrim(g ->> 'email')), ''), p_guest_type, 'givelively_sync');
    update seats set guest_id = v_id, status = 'submitted', updated_at = now() where id = st.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

drop function if exists gl_import(jsonb, text);
create or replace function gl_import(p_rows jsonb, p_actor text, p_run_id text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; p payments; o orders; t sponsorship_tiers; e gala_events; v_sp text; v_order text; v_pay text;
  v_method text; v_qty int; v_seats int; v_commit numeric; v_review text[]; v_name text; v_org text; v_key text;
  v_at timestamptz; v_original numeric; v_gross numeric; v_fee numeric; v_refunded numeric; v_text text;
  v_cancel boolean; v_changed boolean; v_named int; v_conflict text[]; f jsonb;
  v_created int := 0; v_updated int := 0; v_skipped int := 0; v_flagged int := 0; v_unknown int := 0;
  v_prefilled int := 0; v_reviews int := 0;
begin
  select * into e from gala_events where id = current_event_id();
  if e.id is null then raise exception 'not_found: no open gala event'; end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    v_review := '{}';
    v_original := nullif(r ->> 'original', '')::numeric;
    v_gross    := coalesce(nullif(r ->> 'gross', '')::numeric, v_original);
    v_original := coalesce(v_original, v_gross);
    v_fee      := nullif(r ->> 'fee', '')::numeric;
    v_refunded := coalesce(nullif(r ->> 'refunded', '')::numeric, 0);
    v_at       := nullif(r ->> 'date', '')::timestamptz;
    if coalesce(r ->> 'email', '') = '' or v_at is null or coalesce(v_gross, 0) <= 0 then
      v_skipped := v_skipped + 1; continue;
    end if;
    v_key := coalesce(nullif(r ->> 'purchase_key', ''), purchase_key(r ->> 'email', v_at));
    v_text := nullif(btrim(r ->> 'guest_text'), '');
    v_cancel := coalesce((r ->> 'cancelled')::boolean, false)
             or coalesce(r ->> 'status', '') ~* 'refund|fail|cancel|void'
             or (v_refunded > 0 and v_refunded >= v_gross);

    -- Already imported (by purchase key, or by Give Lively transaction ID from the sync).
    select * into p from payments
     where purchase_key = v_key or (coalesce(r ->> 'txn', '') <> '' and givelively_transaction_id = r ->> 'txn')
     order by created_at limit 1 for update;
    if p.id is not null then
      select * into o from orders where id = p.order_id for update;
      v_changed := false;
      if p.purchase_key is null then update payments set purchase_key = v_key where id = p.id; end if;
      if p.refunded_amount is distinct from v_refunded then
        update payments set refunded_amount = v_refunded, net_amount = gross_amount - transaction_fee_amount - v_refunded,
               reconciliation_status = 'needs_review' where id = p.id;
        perform write_audit('system', p_actor, 'payment', p.id, p.order_id, 'payment.refund_updated',
          p.refunded_amount::text, v_refunded::text, false, format('Give Lively refund updated: %s refunded.', money_fmt(v_refunded)));
        update orders set status = case when p.original_amount - v_refunded + 0.005 >= commitment_amount then 'paid' else 'partially_paid' end,
               updated_at = now() where id = o.id and status in ('paid','partially_paid');
        v_changed := true;
      end if;
      if p.gross_amount is distinct from v_gross then
        update payments set original_amount = v_original, gross_amount = v_gross,
               net_amount = v_gross - transaction_fee_amount - refunded_amount, reconciliation_status = 'needs_review' where id = p.id;
        perform write_audit('system', p_actor, 'payment', p.id, p.order_id, 'payment.amount_updated',
          p.gross_amount::text, v_gross::text, false, format('Give Lively amount changed to %s.', money_fmt(v_gross)));
        v_changed := true;
      end if;
      if v_cancel and o.status <> 'cancelled' then
        update orders set status = 'cancelled', updated_at = now() where id = o.id;
        update seats set status = 'cancelled', updated_at = now() where order_id = o.id;
        perform write_audit('system', p_actor, 'order', o.id, o.id, 'order.cancelled', o.status, 'cancelled', false,
          'Refunded or failed in Give Lively; seats cancelled.');
        if add_import_review(p_run_id, v_key, o.id, 'refund', jsonb_build_object('status', r ->> 'status', 'refunded', v_refunded)) then v_reviews := v_reviews + 1; end if;
        v_changed := true;
      end if;
      -- Guest list text changed in Give Lively: fill only if nobody has named a seat yet; otherwise ask staff.
      if r ? 'guest_text' and v_text is distinct from o.imported_guest_text then
        select count(*) into v_named from seats where order_id = o.id and guest_id is not null;
        if v_named = 0 and jsonb_array_length(coalesce(r -> 'guests', '[]')) > 0 and o.status <> 'cancelled' then
          v_prefilled := v_prefilled + import_fill_guests(o.id, r -> 'guests',
            case when (select tier_category from sponsorship_tiers where id = o.tier_id) = 'ticket' then 'ticket_holder' else 'sponsor_guest' end);
          update orders set imported_guest_text = v_text, updated_at = now() where id = o.id;
          v_changed := true;
        elsif add_import_review(p_run_id, v_key, o.id, 'guest_text_changed',
                jsonb_build_object('old_text', o.imported_guest_text, 'new_text', v_text)) then
          v_reviews := v_reviews + 1;
        end if;
      end if;
      if v_changed then v_updated := v_updated + 1; else v_skipped := v_skipped + 1; end if;
      continue;
    end if;

    -- Package: the prepared tier, else this gala's tier mapping, else the longest tier name (before
    -- " — ") found in the Give Lively name. No match: staff review, nothing created until mapped.
    t := null;
    if coalesce(r ->> 'tier_id', '') <> '' then
      select * into t from sponsorship_tiers where id = r ->> 'tier_id';
    end if;
    if t.id is null then
      select st.* into t from tier_mappings m join sponsorship_tiers st on st.id = m.tier_id
       where m.event_id = e.id and m.name_key = name_key(r ->> 'ticket_level');
    end if;
    if t.id is null then
      select * into t from sponsorship_tiers
       where tier_category <> 'complimentary' and coalesce(r ->> 'ticket_level', '') <> ''
         and position(name_key(split_part(name, ' — ', 1)) in name_key(r ->> 'ticket_level')) > 0
       order by length(split_part(name, ' — ', 1)) desc limit 1;
    end if;
    if t.id is null then
      if add_import_review(p_run_id, v_key, null, 'unknown_tier', jsonb_build_object('tier_purchased', r ->> 'ticket_level')) then
        v_reviews := v_reviews + 1;
      end if;
      v_unknown := v_unknown + 1;
      continue;
    end if;

    -- Tickets can be bought several at a time.
    v_qty := 1;
    if t.tier_category = 'ticket' then
      v_qty := greatest(1, coalesce(nullif(r ->> 'quantity', '')::int, floor(v_original / nullif(t.contribution_amount, 0))::int, 1));
    end if;
    v_commit := case when t.contribution_amount > 0 then t.contribution_amount * v_qty else v_original end;
    -- Seats: the export's Total Seats, else seats per tier × tickets. Advertising-only tiers get none.
    v_seats := case when t.included_seat_count = 0 then 0
                    else coalesce(nullif(r ->> 'seats', '')::int, t.included_seat_count * v_qty) end;

    v_method := case when coalesce(r ->> 'method', '') ~* 'amex|american' then 'amex'
                     when coalesce(r ->> 'method', '') ~* 'bank|ach' then 'givelively_ach'
                     when coalesce(r ->> 'method', '') ~* 'card|visa|master|discover' then 'card' end;
    if v_method is null then
      v_method := 'card';
      v_review := v_review || format('payment method "%s" not recognized', coalesce(r ->> 'method', ''));
    end if;
    if v_fee is null then
      v_fee := 0;
      -- The JSON sync reports the fee; AAFE's ticket export has no fee column, so only the sync is flagged.
      if coalesce(r ->> 'txn', '') <> '' then v_review := v_review || 'Give Lively fee missing'::text; end if;
    end if;

    -- Buyer -> sponsor: same email AND same last name. Same email, different last name is a shared
    -- inbox: a new sponsor so the order isn't lost, and a staff review.
    v_name := trim(coalesce(r ->> 'first', '') || ' ' || coalesce(r ->> 'last', ''));
    v_org  := coalesce(nullif(trim(r ->> 'company'), ''), nullif(v_name, ''), r ->> 'email');
    select array_agg(id order by created_at) into v_conflict from sponsors
     where lower(btrim(primary_contact_email)) = lower(btrim(r ->> 'email'));
    select id into v_sp from sponsors
     where id = any (coalesce(v_conflict, '{}'))
       and (coalesce(r ->> 'last', '') = '' or name_key(regexp_replace(primary_contact_name, '^.*\s', '')) = name_key(r ->> 'last'))
     order by created_at limit 1;
    if v_sp is null then
      v_sp := new_id('sp');
      insert into sponsors (id, organization_name, primary_contact_name, primary_contact_email, phone, relationship_owner_id)
      values (v_sp, v_org, coalesce(nullif(v_name, ''), v_org), lower(btrim(r ->> 'email')), '',
              (select id from staff_users where role = 'gala_admin' order by id limit 1));
    else
      v_conflict := null;
    end if;

    v_order := new_id('ord'); v_pay := new_id('pay');
    insert into orders (id, event_id, sponsor_id, tier_id, source, commitment_amount, status, guest_list_deadline,
                        logo_status, program_ad_status, givelively_order_ref, imported_guest_text, internal_notes)
    values (v_order, e.id, v_sp, t.id, 'givelively', v_commit,
            case when v_original - v_refunded + 0.005 >= v_commit then 'paid' else 'partially_paid' end, e.guest_list_deadline,
            case when 'logo' = any (t.required_materials) then 'pending' else 'not_required' end,
            case when exists (select 1 from unnest(t.required_materials) m where m like '%ad') then 'pending' else 'not_required' end,
            nullif(r ->> 'txn', ''), v_text,
            format('Imported from Give Lively (%s).', coalesce(nullif(r ->> 'campaign', ''), 'no campaign'))
              || case when cardinality(v_review) > 0 then ' CHECK: ' || array_to_string(v_review, '; ') || '.' else '' end);
    insert into payments (id, order_id, method, processor, givelively_transaction_id, purchase_key, original_amount, covered_fee_amount,
                          gross_amount, transaction_fee_amount, refunded_amount, net_amount, received_at, recorded_by, reconciliation_status)
    values (v_pay, v_order, v_method, 'stripe', nullif(r ->> 'txn', ''), v_key, v_original, coalesce(nullif(r ->> 'covered', '')::numeric, 0), v_gross,
            v_fee, v_refunded, coalesce(nullif(r ->> 'net', '')::numeric, v_gross - v_fee - v_refunded),
            v_at, 'givelively_sync', case when cardinality(v_review) > 0 then 'needs_review' else 'matched' end);
    perform create_seats(v_order, v_seats);
    perform write_audit('system', p_actor, 'order', v_order, v_order, 'order.created', null, 'paid', true,
      format('%s recorded for %s (givelively).', t.name || case when v_qty > 1 then ' × ' || v_qty else '' end, v_org));
    v_prefilled := v_prefilled + import_fill_guests(v_order, r -> 'guests',
      case when t.tier_category = 'ticket' then 'ticket_holder' else 'sponsor_guest' end);

    if v_conflict is not null then
      if add_import_review(p_run_id, v_key, v_order, 'email_name_conflict',
           jsonb_build_object('buyer', v_name, 'email', lower(btrim(r ->> 'email')), 'candidate_sponsor_ids', to_jsonb(v_conflict))) then
        v_reviews := v_reviews + 1;
      end if;
    end if;
    -- Findings the import engine worked out before the upload (double_booked, possible_duplicate).
    for f in select * from jsonb_array_elements(coalesce(r -> 'findings', '[]')) loop
      if f ->> 'reason' in ('double_booked','possible_duplicate')
         and add_import_review(p_run_id, v_key, v_order, f ->> 'reason', coalesce(f -> 'details', '{}')) then
        v_reviews := v_reviews + 1;
      end if;
    end loop;

    if v_cancel then
      update orders set status = 'cancelled', updated_at = now() where id = v_order;
      update seats set status = 'cancelled', updated_at = now() where order_id = v_order;
      if add_import_review(p_run_id, v_key, v_order, 'refund', jsonb_build_object('status', r ->> 'status', 'refunded', v_refunded)) then
        v_reviews := v_reviews + 1;
      end if;
    elsif v_seats > 0 then
      perform enqueue_email('portal_link', lower(btrim(r ->> 'email')), coalesce(nullif(v_name, ''), v_org), v_order, null, 'givelively_sync');
    end if;
    v_created := v_created + 1;
    if cardinality(v_review) > 0 then v_flagged := v_flagged + 1; end if;
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'skipped', v_skipped, 'needs_review', v_flagged,
                            'unknown_tier', v_unknown, 'names_prefilled', v_prefilled, 'review_items', v_reviews);
end $$;

-- CSV upload from the staff app (Integrations page). Admin only. One call is one transaction: if
-- anything fails, nothing is applied (the staff app shows the error; no run is recorded).
-- p_run: { file_name, file_hash, earliest, latest, report, missing: [{ purchase_key, purchased_at }] }
-- from import-engine's prepareUpload report.
drop function if exists staff_import_givelively(jsonb);
create or replace function staff_import_givelively(p_rows jsonb, p_run jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin']); v_run text := new_id('run'); v_res jsonb; m jsonb; v_missing int := 0;
begin
  insert into import_runs (id, event_id, source, file_name, file_hash, started_by, earliest_purchase, latest_purchase)
  values (v_run, current_event_id(), 'csv', p_run ->> 'file_name', p_run ->> 'file_hash', me.name,
          nullif(p_run ->> 'earliest', '')::timestamptz, nullif(p_run ->> 'latest', '')::timestamptz);
  v_res := gl_import(p_rows, 'Give Lively CSV import (' || me.name || ')', v_run);
  -- Purchases missing from this file within its date range (worked out by the import engine).
  for m in select * from jsonb_array_elements(coalesce(p_run -> 'missing', '[]')) loop
    if add_import_review(v_run, m ->> 'purchase_key',
         (select order_id from payments where purchase_key = m ->> 'purchase_key'), 'missing_from_source',
         jsonb_build_object('purchased_at', m ->> 'purchased_at', 'file_hash', p_run ->> 'file_hash')) then
      v_missing := v_missing + 1;
    end if;
  end loop;
  v_res := v_res || jsonb_build_object('run_id', v_run, 'missing_from_source', v_missing,
                                       'review_items', (v_res ->> 'review_items')::int + v_missing);
  update import_runs set finished_at = now(), status = 'succeeded', counts = v_res, report = p_run -> 'report' where id = v_run;
  perform write_audit('staff', me.name, 'import_run', v_run, null, 'import.csv', null, 'succeeded', false,
    format('Give Lively CSV imported (%s): %s new, %s updated, %s unchanged, %s for review.',
           coalesce(p_run ->> 'file_name', 'file'), v_res ->> 'created', v_res ->> 'updated', v_res ->> 'skipped', v_res ->> 'review_items'));
  return v_res;
end $$;

-- Tier mapping (spec section 3): staff link a Give Lively tier name to a tier, once per gala. Open
-- unknown_tier items for that name are resolved; staff re-run the upload. Changing a mapping doesn't
-- rewrite orders already imported (they keep their tier until staff change them).
create or replace function staff_set_tier_mapping(p_givelively_name text, p_tier_id text) returns void
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin']); v_old text;
begin
  if name_key(p_givelively_name) = '' then raise exception 'invalid_input: tier name is required'; end if;
  if not exists (select 1 from sponsorship_tiers where id = p_tier_id) then raise exception 'not_found: tier'; end if;
  select tier_id into v_old from tier_mappings where event_id = current_event_id() and name_key = name_key(p_givelively_name);
  insert into tier_mappings (id, event_id, givelively_name, name_key, tier_id, created_by)
  values (new_id('tm'), current_event_id(), btrim(p_givelively_name), name_key(p_givelively_name), p_tier_id, me.name)
  on conflict (event_id, name_key) do update set tier_id = excluded.tier_id, created_by = excluded.created_by, created_at = now();
  update import_review set status = 'resolved', resolution = 'mapped to ' || p_tier_id, resolved_by = me.name, resolved_at = now()
   where status = 'open' and reason = 'unknown_tier' and name_key(details ->> 'tier_purchased') = name_key(p_givelively_name);
  perform write_audit('staff', me.name, 'tier_mapping', name_key(p_givelively_name), null, 'tier_mapping.set', v_old, p_tier_id, false,
    format('Give Lively tier "%s" mapped to %s.', btrim(p_givelively_name), p_tier_id));
end $$;

-- This gala's Give Lively page name (spec section 3): set once per year, from the upload screen.
create or replace function staff_set_gala_page(p_page_name text) returns void
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin']); v_old text;
begin
  if btrim(coalesce(p_page_name, '')) = '' then raise exception 'invalid_input: page name is required'; end if;
  select givelively_page_name into v_old from gala_events where id = current_event_id();
  update gala_events set givelively_page_name = btrim(p_page_name) where id = current_event_id();
  perform write_audit('staff', me.name, 'gala_event', current_event_id(), null, 'gala.page_name_set', v_old, btrim(p_page_name), false,
    format('Give Lively page set to "%s".', btrim(p_page_name)));
end $$;

-- Close a review item with what staff decided.
create or replace function staff_resolve_import_review(p_id text, p_resolution text) returns void
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); v import_review;
begin
  update import_review set status = 'resolved', resolution = btrim(p_resolution), resolved_by = me.name, resolved_at = now()
   where id = p_id and status = 'open' returning * into v;
  if v.id is null then raise exception 'not_found'; end if;
  perform write_audit('staff', me.name, 'import_review', v.id, v.order_id, 'import_review.resolved', 'open', 'resolved', false,
    format('Import review (%s) resolved: %s.', v.reason, btrim(p_resolution)));
end $$;

-- ---------------------------------------------------------------------
-- 7. EMAIL OUTBOX
-- ---------------------------------------------------------------------

-- Staff approve a draft (Give Lively purchase, pledge or payment links). Only then does it send.
create or replace function staff_approve_email(p_email_id text) returns void
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); m email_log;
begin
  update email_log set approved_by = me.name, approved_at = now()
   where id = p_email_id and status = 'queued' and approved_at is null returning * into m;
  if m.id is null then raise exception 'not_found: no draft with that id'; end if;
  perform write_audit('staff', me.name, 'email', m.id, m.order_id, 'email.approved', 'draft', 'approved', false,
    format('%s to %s approved for sending.', replace(m.template, '_', ' '), m.to_name));
end $$;

-- Staff discard a draft instead of sending it.
create or replace function staff_cancel_email(p_email_id text) returns void
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); m email_log;
begin
  update email_log set status = 'cancelled' where id = p_email_id and status = 'queued' returning * into m;
  if m.id is null then raise exception 'not_found: no unsent email with that id'; end if;
  perform write_audit('staff', me.name, 'email', m.id, m.order_id, 'email.cancelled', 'queued', 'cancelled', false,
    format('%s to %s discarded.', replace(m.template, '_', ' '), m.to_name));
end $$;

-- Called only by the send-emails edge function.

-- Mark sent. For portal links and QR invitations, the worker passes the hash
-- of the token it just emailed; that becomes the only valid link or code
-- (for the order, or for the guest's seat).
drop function if exists email_mark_sent(text, text);
create or replace function email_mark_sent(p_email_id text, p_token_hash text default null) returns void
language plpgsql security definer set search_path = public as $$
declare m email_log; v_deadline date;
begin
  update email_log set status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = null
   where id = p_email_id and status = 'queued' and approved_at is not null returning * into m;
  if m.id is null then return; end if;
  -- A reminder carries a fresh link too, so the newest email always has the one that works.
  if m.template in ('portal_link', 'guest_list_reminder') and p_token_hash is not null then
    -- The link works through the end of AAFE's guest-list deadline day (New York time).
    select coalesce(o.guest_list_deadline, e.guest_list_deadline, e.event_date) into v_deadline
      from orders o join gala_events e on e.id = o.event_id where o.id = m.order_id;
    update orders set portal_token = p_token_hash, portal_link_sent_at = now(),
           portal_token_expires_at = (v_deadline + 1)::timestamp at time zone 'America/New_York', updated_at = now()
     where id = m.order_id;
  elsif m.template = 'qr_invitation' and p_token_hash is not null then
    update seats set qr_token_hash = p_token_hash, qr_token_expires_at = qr_expiry(o.event_id), updated_at = now()
      from orders o
     where seats.guest_id = m.guest_id and seats.status <> 'cancelled' and o.id = seats.order_id;
  end if;
  perform write_audit('system', 'Email service', 'email', m.id, m.order_id, m.template || '.sent', null, 'sent',
    m.template in ('portal_link', 'guest_list_reminder', 'payment_receipt'),   -- shown in the sponsor's activity list
    case m.template when 'portal_link' then 'Private guest-list link emailed.'
                    when 'guest_list_reminder' then 'Guest-list reminder emailed, with a new private link.'
                    when 'payment_receipt' then 'Payment confirmation emailed.'
                    else format('%s emailed to %s.', replace(m.template, '_', ' '), m.to_name) end);
end $$;

-- Guest-list reminders: one draft per sponsor who still has unnamed seats, already has a link, and
-- whose deadline hasn't passed. Skips sponsors with an unsent link or reminder, or one sent in the last
-- p_min_days. Drafts only (hard rule 4): staff review and approve each before it sends. Returns how many.
create or replace function staff_queue_guest_list_reminders(p_min_days int default 7) returns int
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); r record; n int := 0;
begin
  for r in
    select o.id, sp.primary_contact_email email, sp.primary_contact_name contact
      from orders o join sponsors sp on sp.id = o.sponsor_id join gala_events e on e.id = o.event_id
     where o.event_id = current_event_id() and o.status <> 'cancelled' and o.portal_link_sent_at is not null
       and coalesce(o.guest_list_deadline, e.guest_list_deadline) >= (now() at time zone 'America/New_York')::date
       and exists (select 1 from seats s where s.order_id = o.id and s.status = 'unnamed')
       and not exists (select 1 from email_log m where m.order_id = o.id and m.template in ('portal_link', 'guest_list_reminder')
                        and (m.status = 'queued' or m.sent_at > now() - make_interval(days => greatest(coalesce(p_min_days, 7), 0))))
     order by o.id
  loop
    perform enqueue_email('guest_list_reminder', r.email, r.contact, r.id, null, 'staff_manual');
    n := n + 1;
  end loop;
  if n > 0 then
    perform write_audit('staff', me.name, 'email', 'guest_list_reminder', null, 'email.reminders_drafted', null, 'draft', false,
      format('%s guest-list reminder%s drafted for review.', n, case when n = 1 then '' else 's' end));
  end if;
  return n;
end $$;

-- The approval screen: every unsent email, drafts first, with what staff need to judge it.
-- state: 'draft' (waiting for approval), 'approved' (waiting for the sender), 'failed' (stopped retrying).
create or replace function staff_email_queue() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']);
begin
  return coalesce((select jsonb_agg(row order by row ->> 'sort', row ->> 'created_at', row ->> 'id') from (
    select jsonb_build_object(
      'id', m.id, 'template', m.template, 'to_name', m.to_name, 'to_email', m.to_email, 'trigger', m.trigger,
      'created_at', m.created_at, 'approved_by', m.approved_by, 'attempts', m.attempts, 'last_error', m.last_error,
      'state', case when m.approved_at is null then 'draft' when m.attempts >= 5 then 'failed' else 'approved' end,
      'sort', case when m.approved_at is null then 0 when m.attempts >= 5 then 1 else 2 end,
      'order_id', m.order_id, 'organization', sp.organization_name, 'tier', t.name,
      'deadline', coalesce(o.guest_list_deadline, e.guest_list_deadline),
      'seats_unnamed', (select count(*) from seats s where s.order_id = m.order_id and s.status = 'unnamed'),
      'seats_total', (select count(*) from seats s where s.order_id = m.order_id and s.status <> 'cancelled'),
      'guest', case when g.id is null then null else g.first_name || ' ' || g.last_name end,
      'payment', case when p.id is null then null else jsonb_build_object(
        'amount', p.gross_amount, 'method', p.method, 'received_at', p.received_at, 'check_number', p.check_number) end
    ) row
      from email_log m
      left join orders o on o.id = m.order_id left join sponsors sp on sp.id = o.sponsor_id
      left join sponsorship_tiers t on t.id = o.tier_id left join gala_events e on e.id = o.event_id
      left join guests g on g.id = m.guest_id left join payments p on p.id = m.payment_id
     where m.status = 'queued'
  ) q), '[]');
end $$;

-- After 5 failed attempts the email stays 'queued' but the worker stops retrying.
create or replace function email_mark_failed(p_email_id text, p_error text) returns void
language sql security definer set search_path = public as $$
  update email_log set attempts = attempts + 1, last_error = left(p_error, 1000) where id = p_email_id
$$;

-- ---------------------------------------------------------------------
-- 8. EXPORTS  (rows for the staff app to save as CSV; every export is logged)
-- Columns are a first proposal until AAFE sends its badge and check-in templates.
-- ---------------------------------------------------------------------

-- Badge mail merge. Only what prints on a badge: never email, dietary or accessibility needs,
-- payment, or staff notes. A guest with no table is admitted without a guaranteed seat.
create or replace function staff_export_badges(p_include_printed boolean default false)
returns table (first_name text, last_name text, title text, organization text,
               table_number int, seat_number int, sponsor text, guest_type text, badge_status text)
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); v_n int;
begin
  return query
    select g.first_name, g.last_name, g.title, g.organization, t.number, g.seat_number,
           case when g.guest_type = 'sponsor_guest' then sp.organization_name end, g.guest_type, g.badge_status
    from guests g join orders o on o.id = g.order_id join sponsors sp on sp.id = o.sponsor_id
    left join event_tables t on t.id = g.table_id
    where o.event_id = current_event_id() and o.status <> 'cancelled'
      and (g.badge_status in ('ready', 'reprint_needed') or (p_include_printed and g.badge_status = 'printed'))
    order by t.number nulls last, g.seat_number nulls last, g.last_name, g.first_name;
  get diagnostics v_n = row_count;
  perform write_audit('staff', me.name, 'export', 'badges', null, 'export.badges', null, null, false,
    format('Badge file exported: %s badge(s)%s.', v_n, case when p_include_printed then ', including printed' else '' end));
end $$;

-- Printed check-in list: the fallback if the iPad or the venue's internet fails. Every named guest
-- by last name, plus one row per unnamed sponsor seat so the desk knows who may bring a walk-in.
-- Volunteers may export it; it carries no email, phone, payment, dietary needs, or staff notes.
create or replace function staff_export_checkin()
returns table (last_name text, first_name text, organization text, sponsor text, table_number int,
               seat_number int, guest_type text, accessibility_needs text, arrived boolean)
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager','check_in_volunteer']); v_n int;
begin
  return query
    select * from (
      select g.last_name, g.first_name, g.organization, sp.organization_name, t.number, g.seat_number,
             g.guest_type, g.accessibility_needs, g.attendance_status = 'checked_in'
      from guests g join orders o on o.id = g.order_id join sponsors sp on sp.id = o.sponsor_id
      left join event_tables t on t.id = g.table_id
      where o.event_id = current_event_id() and o.status <> 'cancelled'
      union all
      select 'Unnamed seat', null, null, sp.organization_name, null, s.slot_number, 'unnamed_seat', null, false
      from seats s join orders o on o.id = s.order_id join sponsors sp on sp.id = o.sponsor_id
      where o.event_id = current_event_id() and o.status <> 'cancelled' and s.guest_id is null and s.status <> 'cancelled'
    ) x
    order by (x.guest_type = 'unnamed_seat'), x.last_name, x.first_name nulls last, x.organization_name;
  get diagnostics v_n = row_count;
  perform write_audit('staff', me.name, 'export', 'checkin', null, 'export.checkin', null, null, false,
    format('Check-in list exported: %s row(s).', v_n));
end $$;

-- Salesforce attendee file: who actually came, shaped for a Contact + Campaign Member import into
-- AAFE's Salesforce (NPSP). Includes email, so gala admins only. Walk-ins recorded at the door
-- without a guest record come through by the name the desk wrote down.
create or replace function staff_export_salesforce()
returns table (first_name text, last_name text, email text, title text, organization text, sponsor text,
               salesforce_account_id text, salesforce_opportunity_id text, guest_type text,
               checked_in_at timestamptz, check_in_method text)
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin']); v_n int;
begin
  return query
    select g.first_name, g.last_name, nullif(g.email, ''), g.title, g.organization, sp.organization_name,
           sp.salesforce_account_id, o.salesforce_opportunity_id, g.guest_type, c.checked_in_at, c.method
    from check_ins c join guests g on g.id = c.guest_id
    join orders o on o.id = g.order_id join sponsors sp on sp.id = o.sponsor_id
    where c.event_id = current_event_id()
    union all
    select null, c.arrival_name, null, null, null, sp.organization_name,
           sp.salesforce_account_id, o.salesforce_opportunity_id, 'walk_in', c.checked_in_at, c.method
    from check_ins c left join orders o on o.id = c.order_id left join sponsors sp on sp.id = o.sponsor_id
    where c.event_id = current_event_id() and c.guest_id is null
    order by 2, 1 nulls last;
  get diagnostics v_n = row_count;
  perform write_audit('staff', me.name, 'export', 'salesforce', null, 'export.salesforce', null, null, false,
    format('Salesforce attendee file exported: %s attendee(s).', v_n));
end $$;

-- ---------------------------------------------------------------------
-- 9. Who may call what
-- ---------------------------------------------------------------------

do $$
declare f text;
begin
  -- Nothing is callable by default.
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in (
              'hash_token','new_id','new_qr_token','qr_expiry','current_event_id','current_staff','staff_role','require_staff',
              'write_audit','audit_changes','enqueue_email','create_seats','money_fmt','portal_order','portal_get_view','portal_save_guest',
              'portal_release_seat','staff_me','staff_update_guest','staff_set_seat_status','staff_mark_printed',
              'staff_assign_seat','staff_seat_order_at_table','staff_record_payment','staff_add_pledge','staff_add_comp_guest',
              'staff_send_qr_invite','staff_resend_portal_link','staff_approve_email','staff_cancel_email','checkin_list','staff_check_in','staff_check_in_qr',
              'staff_check_in_exception','gl_import','staff_import_givelively','email_mark_sent','email_mark_failed',
              'purchase_key','name_key','add_import_review','import_fill_guests','staff_set_tier_mapping','staff_set_gala_page',
              'staff_resolve_import_review','seats_void_qr','guests_void_qr',
              'staff_export_badges','staff_export_checkin','staff_export_salesforce',
              'staff_queue_guest_list_reminders','staff_email_queue')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- staff_role() is used inside RLS policies, so logged-in users need it.
grant execute on function staff_role() to authenticated;

-- Guest Portal
grant execute on function portal_get_view(text), portal_save_guest(text, int, jsonb), portal_release_seat(text, int)
  to anon, authenticated;

-- Staff App
grant execute on function
  staff_me(), staff_update_guest(text, jsonb), staff_set_seat_status(text, text), staff_mark_printed(text[]),
  staff_assign_seat(text, text, int), staff_seat_order_at_table(text, text),
  staff_record_payment(text, text, numeric, date, text), staff_add_pledge(text, text, text, text, text),
  staff_add_comp_guest(jsonb), staff_send_qr_invite(text), staff_resend_portal_link(text), staff_approve_email(text), staff_cancel_email(text),
  checkin_list(), staff_check_in(text, text), staff_check_in_qr(text), staff_check_in_exception(text, text, text, text),
  staff_import_givelively(jsonb, jsonb), staff_set_tier_mapping(text, text), staff_set_gala_page(text),
  staff_resolve_import_review(text, text),
  staff_export_badges(boolean), staff_export_checkin(), staff_export_salesforce(),
  staff_queue_guest_list_reminders(int), staff_email_queue()
  to authenticated;

-- Edge functions (service role)
grant execute on function gl_import(jsonb, text, text), email_mark_sent(text, text), email_mark_failed(text, text), hash_token(text)
  to service_role;
