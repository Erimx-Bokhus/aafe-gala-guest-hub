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
alter table email_log drop constraint if exists email_log_status_check;
alter table email_log add constraint email_log_status_check check (status in ('queued','sent','opened','bounced','cancelled'));

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

-- ---------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------

create or replace function hash_token(t text) returns text
language sql immutable as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;

create or replace function new_id(prefix text) returns text
language sql volatile as $$ select prefix || '-' || left(replace(gen_random_uuid()::text, '-', ''), 12) $$;

-- 128 random bits (32 hex chars), used for QR codes.
create or replace function new_qr_token() returns text
language sql volatile as $$ select 'AAFE-' || upper(left(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 32)) $$;

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

create or replace function write_audit(
  p_actor_type text, p_actor text, p_entity text, p_entity_id text, p_order_id text,
  p_action text, p_from text, p_to text, p_guest_visible boolean, p_summary text
) returns void language sql security definer set search_path = public as $$
  insert into audit_log (actor_type, actor, entity, entity_id, order_id, action, from_state, to_state, guest_visible, summary)
  values (p_actor_type, p_actor, p_entity, p_entity_id, p_order_id, p_action, p_from, p_to, p_guest_visible, p_summary)
$$;

-- p_approved_by: the staff member sending their own email. Null = draft for staff approval.
drop function if exists enqueue_email(text, text, text, text, text, text);
create or replace function enqueue_email(
  p_template text, p_to text, p_to_name text, p_order_id text, p_guest_id text, p_trigger text, p_approved_by text default null
) returns text language plpgsql security definer set search_path = public as $$
declare v_id text := new_id('em');
begin
  insert into email_log (id, template, to_email, to_name, order_id, guest_id, trigger, status, approved_by, approved_at)
  values (v_id, p_template, p_to, p_to_name, p_order_id, p_guest_id, p_trigger, 'queued',
          p_approved_by, case when p_approved_by is not null then now() end);
  return v_id;
end $$;

create or replace function create_seats(p_order_id text, p_count int) returns void
language sql security definer set search_path = public as $$
  insert into seats (id, order_id, slot_number, guest_id, status)
  select 'seat-' || p_order_id || '-' || n, p_order_id, n, null, 'unnamed' from generate_series(1, p_count) n
$$;

create or replace function money_fmt(n numeric) returns text
language sql immutable as $$ select '$' || to_char(n, 'FM999,999,990.00') $$;

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
    'givelively_sync_state','givelively_raw']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists staff_read on %I', t);
    execute format($p$create policy staff_read on %I for select to authenticated
                     using (staff_role() in ('gala_admin','relationship_manager'))$p$, t);
  end loop;

  foreach t in array array['gala_events','sponsorship_tiers','event_tables','staff_users']
  loop
    execute format('drop policy if exists admin_write on %I', t);
    execute format($p$create policy admin_write on %I for all to authenticated
                     using (staff_role() = 'gala_admin') with check (staff_role() = 'gala_admin')$p$, t);
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
  st seats; g guests; v_contact text; v_action text; v_from text;
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
         else format('%s %s updated (seat %s).', v_first, v_last, p_slot) end);
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
    format('%s %s: %s edited by staff.', n.first_name, n.last_name, array_to_string(v_changed, ', ')));
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

  -- First money in and no link yet: send the guest-list link.
  if o.portal_link_sent_at is null and exists (select 1 from seats where order_id = o.id and status <> 'cancelled') then
    select * into sp from sponsors where id = o.sponsor_id;
    perform enqueue_email('portal_link', sp.primary_contact_email, sp.primary_contact_name, o.id, null, 'payment_recorded');
  end if;
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
          'comp_relationship', v_note, new_qr_token(), 'staff');
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
  if g.id is null or g.qr_token is null then raise exception 'not_found: guest has no QR code'; end if;
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
declare g guests; v_new boolean;
begin
  perform require_staff(array['gala_admin','relationship_manager','check_in_volunteer']);
  select * into g from guests where upper(qr_token) = upper(trim(p_code));
  if g.id is null then raise exception 'not_found: unknown QR code'; end if;
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
-- 6. GIVE LIVELY IMPORT
--    Input: jsonb array of normalized rows (the edge function and the CSV
--    upload both normalize to this shape):
--      { txn, date, first, last, email, company, campaign, ticket_level,
--        method, quantity, original, covered, gross, fee, net, refunded }
--    Fees are stored as Give Lively reports them, never recomputed.
--    Rows needing a human look are flagged reconciliation_status = 'needs_review'.
-- ---------------------------------------------------------------------

create or replace function gl_import(p_rows jsonb, p_actor text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; p payments; t sponsorship_tiers; e gala_events; v_sp text; v_order text; v_pay text;
  v_method text; v_qty int; v_commit numeric; v_review text[]; v_name text; v_org text;
  v_original numeric; v_gross numeric; v_fee numeric; v_refunded numeric;
  v_created int := 0; v_updated int := 0; v_skipped int := 0; v_flagged int := 0;
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
    if coalesce(r ->> 'txn', '') = '' or coalesce(r ->> 'email', '') = '' or coalesce(v_gross, 0) <= 0 then
      v_skipped := v_skipped + 1; continue;
    end if;

    -- Already imported: only refunds can change.
    select * into p from payments where givelively_transaction_id = r ->> 'txn' for update;
    if p.id is not null then
      if p.refunded_amount is distinct from v_refunded then
        update payments set refunded_amount = v_refunded, net_amount = gross_amount - transaction_fee_amount - v_refunded,
               reconciliation_status = 'needs_review' where id = p.id;
        perform write_audit('system', p_actor, 'payment', p.id, p.order_id, 'payment.refund_updated',
          p.refunded_amount::text, v_refunded::text, false, format('Give Lively refund updated: %s refunded.', money_fmt(v_refunded)));
        v_updated := v_updated + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
      continue;
    end if;

    -- Package: longest tier name (before the " — ") found in the ticket level.
    select * into t from sponsorship_tiers
     where tier_category <> 'complimentary' and coalesce(r ->> 'ticket_level', '') <> ''
       and position(lower(split_part(name, ' — ', 1)) in lower(r ->> 'ticket_level')) > 0
     order by length(split_part(name, ' — ', 1)) desc limit 1;
    if t.id is null then
      select * into t from sponsorship_tiers where id = 'community_ticket';
      v_review := v_review || format('package "%s" not recognized; set to %s', coalesce(r ->> 'ticket_level', ''), t.name);
    end if;

    -- Tickets can be bought several at a time.
    v_qty := 1;
    if t.tier_category = 'ticket' then
      v_qty := greatest(1, coalesce(nullif(r ->> 'quantity', '')::int, floor(v_original / nullif(t.contribution_amount, 0))::int, 1));
    end if;
    v_commit := case when t.contribution_amount > 0 then t.contribution_amount * v_qty else v_original end;

    v_method := case when coalesce(r ->> 'method', '') ~* 'amex|american' then 'amex'
                     when coalesce(r ->> 'method', '') ~* 'bank|ach' then 'givelively_ach'
                     when coalesce(r ->> 'method', '') ~* 'card|visa|master|discover' then 'card' end;
    if v_method is null then
      v_method := 'card';
      v_review := v_review || format('payment method "%s" not recognized', coalesce(r ->> 'method', ''));
    end if;
    if v_fee is null then
      v_fee := 0;
      v_review := v_review || 'Give Lively fee missing'::text;
    end if;

    v_name := trim(coalesce(r ->> 'first', '') || ' ' || coalesce(r ->> 'last', ''));
    v_org  := coalesce(nullif(trim(r ->> 'company'), ''), nullif(v_name, ''), r ->> 'email');
    select id into v_sp from sponsors where lower(primary_contact_email) = lower(trim(r ->> 'email')) order by created_at limit 1;
    if v_sp is null then
      v_sp := new_id('sp');
      insert into sponsors (id, organization_name, primary_contact_name, primary_contact_email, phone, relationship_owner_id)
      values (v_sp, v_org, coalesce(nullif(v_name, ''), v_org), trim(r ->> 'email'), '',
              (select id from staff_users where role = 'gala_admin' order by id limit 1));
    end if;

    v_order := new_id('ord'); v_pay := new_id('pay');
    insert into orders (id, event_id, sponsor_id, tier_id, source, commitment_amount, status, guest_list_deadline,
                        logo_status, program_ad_status, givelively_order_ref, internal_notes)
    values (v_order, e.id, v_sp, t.id, 'givelively', v_commit,
            case when v_original - v_refunded + 0.005 >= v_commit then 'paid' else 'partially_paid' end, e.guest_list_deadline,
            case when 'logo' = any (t.required_materials) then 'pending' else 'not_required' end,
            case when exists (select 1 from unnest(t.required_materials) m where m like '%ad') then 'pending' else 'not_required' end,
            r ->> 'txn', format('Imported from Give Lively (%s).', coalesce(nullif(r ->> 'campaign', ''), 'no campaign'))
              || case when cardinality(v_review) > 0 then ' CHECK: ' || array_to_string(v_review, '; ') || '.' else '' end);
    insert into payments (id, order_id, method, processor, givelively_transaction_id, original_amount, covered_fee_amount, gross_amount,
                          transaction_fee_amount, refunded_amount, net_amount, received_at, recorded_by, reconciliation_status)
    values (v_pay, v_order, v_method, 'stripe', r ->> 'txn', v_original, coalesce(nullif(r ->> 'covered', '')::numeric, 0), v_gross,
            v_fee, v_refunded, coalesce(nullif(r ->> 'net', '')::numeric, v_gross - v_fee - v_refunded),
            coalesce(nullif(r ->> 'date', '')::timestamptz, now()), 'givelively_sync',
            case when cardinality(v_review) > 0 then 'needs_review' else 'matched' end);
    perform create_seats(v_order, t.included_seat_count * v_qty);
    perform write_audit('system', p_actor, 'order', v_order, v_order, 'order.created', null, 'paid', true,
      format('%s recorded for %s (givelively).', t.name || case when v_qty > 1 then ' × ' || v_qty else '' end, v_org));
    if t.included_seat_count > 0 then
      perform enqueue_email('portal_link', trim(r ->> 'email'), coalesce(nullif(v_name, ''), v_org), v_order, null, 'givelively_sync');
    end if;
    v_created := v_created + 1;
    if cardinality(v_review) > 0 then v_flagged := v_flagged + 1; end if;
  end loop;

  return jsonb_build_object('created', v_created, 'updated', v_updated, 'skipped', v_skipped, 'needs_review', v_flagged);
end $$;

-- CSV upload from the staff app (Integrations page). Admin only.
create or replace function staff_import_givelively(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin']);
begin
  return gl_import(p_rows, 'Give Lively CSV import (' || me.name || ')');
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

-- Mark sent. For portal links, the worker passes the hash of the token it
-- just emailed; that becomes the order's only valid link.
create or replace function email_mark_sent(p_email_id text, p_portal_token_hash text default null) returns void
language plpgsql security definer set search_path = public as $$
declare m email_log; v_deadline date;
begin
  update email_log set status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = null
   where id = p_email_id and status = 'queued' and approved_at is not null returning * into m;
  if m.id is null then return; end if;
  if m.template = 'portal_link' and p_portal_token_hash is not null then
    -- The link works through the end of AAFE's guest-list deadline day (New York time).
    select coalesce(o.guest_list_deadline, e.guest_list_deadline, e.event_date) into v_deadline
      from orders o join gala_events e on e.id = o.event_id where o.id = m.order_id;
    update orders set portal_token = p_portal_token_hash, portal_link_sent_at = now(),
           portal_token_expires_at = (v_deadline + 1)::timestamp at time zone 'America/New_York', updated_at = now()
     where id = m.order_id;
  end if;
  perform write_audit('system', 'Email service', 'email', m.id, m.order_id,
    case when m.template = 'portal_link' then 'portal_link.sent' else m.template || '.sent' end, null, 'sent',
    m.template = 'portal_link',
    case when m.template = 'portal_link' then 'Private guest-list link emailed.'
         else format('%s emailed to %s.', replace(m.template, '_', ' '), m.to_name) end);
end $$;

-- After 5 failed attempts the email stays 'queued' but the worker stops retrying.
create or replace function email_mark_failed(p_email_id text, p_error text) returns void
language sql security definer set search_path = public as $$
  update email_log set attempts = attempts + 1, last_error = left(p_error, 1000) where id = p_email_id
$$;

-- ---------------------------------------------------------------------
-- 8. Who may call what
-- ---------------------------------------------------------------------

do $$
declare f text;
begin
  -- Nothing is callable by default.
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in (
              'hash_token','new_id','new_qr_token','current_event_id','current_staff','staff_role','require_staff',
              'write_audit','enqueue_email','create_seats','money_fmt','portal_order','portal_get_view','portal_save_guest',
              'portal_release_seat','staff_me','staff_update_guest','staff_set_seat_status','staff_mark_printed',
              'staff_assign_seat','staff_seat_order_at_table','staff_record_payment','staff_add_pledge','staff_add_comp_guest',
              'staff_send_qr_invite','staff_resend_portal_link','staff_approve_email','staff_cancel_email','checkin_list','staff_check_in','staff_check_in_qr',
              'staff_check_in_exception','gl_import','staff_import_givelively','email_mark_sent','email_mark_failed')
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
  staff_import_givelively(jsonb)
  to authenticated;

-- Edge functions (service role)
grant execute on function gl_import(jsonb, text), email_mark_sent(text, text), email_mark_failed(text, text), hash_token(text)
  to service_role;
