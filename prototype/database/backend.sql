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

-- Database upgrades (Gate 1, box 7). This file runs again on every change, so three kinds of statement live here:
--   * shape, safe to repeat: add column if not exists, indexes, constraints redefined;
--   * what a run does to data just loaded, following the data itself: seed tokens hashed, QR codes moved to seats,
--     blank display names filled (a demo load needs these every time; npm run db:load re-runs this file);
--   * one-time changes to data already in a database: each runs once, recorded in schema_upgrades, and never decided by
--     "does this column exist yet". Add a new one with upgrade_step(), named by its date.
create table if not exists schema_upgrades (
  id          text primary key,      -- 'YYYY-MM-DD what', the day it was written
  note        text not null,
  ran         boolean not null,      -- false: the database already had it when it first met this table, so it was recorded, not run
  applied_at  timestamptz not null default now()
);
alter table schema_upgrades enable row level security;   -- read by gala admins and relationship managers (section 3); written only here

-- True the first time a database reaches step p_id, which is then recorded; false every time after.
-- Call it in the step's own do block: if the step fails, the block undoes the record too, so it runs again when fixed.
create or replace function upgrade_step(p_id text, p_note text) returns boolean
language plpgsql set search_path = public as $$
begin
  insert into schema_upgrades (id, note, ran) values (p_id, p_note, true) on conflict (id) do nothing;
  return found;
end $$;

-- The steps written before this table (Oct 14) decided by a guess. A database meeting the table for the first time
-- that already shows a step's result has had it: recorded as done, not run. This is the one time the guess is made.
do $$ begin
  if exists (select 1 from schema_upgrades) then return; end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sponsorship_tiers' and column_name = 'guaranteed_seating') then
    insert into schema_upgrades (id, note, ran) values ('2026-10-14 guaranteed seating', 'Already had it: levels say whether they come with a table', false);
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'sponsorship_tiers' and column_name = 'event_id')
     and not exists (select 1 from sponsorship_tiers where event_id is null) then
    insert into schema_upgrades (id, note, ran) values ('2026-10-14 levels per gala', 'Already had it: every level belongs to one gala', false);
  end if;
end $$;

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
alter table email_log add column if not exists claimed_at  timestamptz;   -- set while one send-emails run is sending it (email_claim)
alter table email_log add column if not exists payment_id  text references payments(id);  -- payment_receipt: which payment
alter table email_log drop constraint if exists email_log_status_check;
alter table email_log add constraint email_log_status_check check (status in ('queued','sent','opened','bounced','cancelled'));

-- Seven guest categories (requirements: AAFE's spreadsheet categories). The full demo data sets use all of them.
alter table guests drop constraint if exists guests_guest_type_check;
alter table guests add constraint guests_guest_type_check check (guest_type in
  ('sponsor_guest','ticket_holder','comp_relationship','government_vip','aafe_staff','event_volunteer','event_staff'));

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

-- Offline check-in (decided Oct 6): the iPad keeps checking guests in without internet and syncs later.
-- client_id is the iPad's id for each check-in, so syncing the same one twice records it once.
-- One check-in per guest: the first arrival stands (staff_sync_check_ins).
alter table check_ins add column if not exists client_id text;
alter table check_ins add column if not exists device    text;   -- e.g. "Door 2"
create unique index if not exists check_ins_client_id_uq on check_ins (client_id) where client_id is not null;
create unique index if not exists check_ins_one_per_guest on check_ins (event_id, guest_id) where guest_id is not null;
-- Undo on the iPad (Oct 8): who made each check-in, by staff account rather than by name, and the seat's
-- status before it, so staff_undo_check_in() can check the caller and put the seat back as it was.
alter table check_ins add column if not exists staff_id           text;
alter table check_ins add column if not exists seat_status_before text;

-- Sponsor pipeline (decided Oct 6), from AAFE's prospect tracker: one row per sponsor prospect per gala,
-- with its stage, the ask, and the order once there is one (its commitment and payments). The stages and
-- their likelihood are AAFE's: not started 0%, reached out 10%, in conversation 50%, closed won 90%,
-- payment received 100%, lost 0%. See staff_pipeline().
create table if not exists sponsor_prospects (
  id                 text primary key,
  event_id           text not null references gala_events(id),
  sponsor_id         text not null references sponsors(id),
  stage              text not null default 'not_started'
                     check (stage in ('not_started','reached_out','in_conversation','closed_won','payment_received','lost')),
  sector             text check (sector in ('board','community','corporate','foundation','individual','small_business')),
  ask_amount         numeric(12,2) check (ask_amount >= 0),
  ask_tier_id        text references sponsorship_tiers(id),
  order_id           text references orders(id),          -- the pledge or purchase, once there is one
  follow_up_owner_id text references staff_users(id),     -- AAFE's follow-up contact, besides the relationship manager
  notes              text,                                -- STAFF ONLY
  stage_changed_at   timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (event_id, sponsor_id)
);
create unique index if not exists sponsor_prospects_order_uq on sponsor_prospects (order_id) where order_id is not null;
alter table gala_events add column if not exists sponsorship_goal numeric(12,2);   -- the board's target for this gala

-- Gala-night arrivals in the sponsor portal (decided Oct 6): off until AAFE's privacy review approves it.
-- When on, a sponsor sees which of their own guests have arrived: yes or no, never a time.
alter table gala_events add column if not exists sponsor_arrivals_visible boolean not null default false;
alter table gala_events add column if not exists sponsor_arrivals_note text;   -- who approved it, and when

-- Give Lively import (docs/import-matching-spec.md, section 9).
alter table payments    add column if not exists purchase_key text;   -- SHA-256(email | UTC purchase time); see purchase_key()
create unique index if not exists payments_purchase_key_uq on payments (purchase_key) where purchase_key is not null;
-- The processor fee AAFE's ticket export doesn't carry (Gate 1): null means not known yet, not $0, so fee totals and
-- net aren't understated; the sync fills it in when it sees the same purchase. Net is unknown while the fee is.
alter table payments    alter column transaction_fee_amount drop not null;
alter table payments    alter column net_amount drop not null;
-- A wallet behind a card payment (Apple Pay, Google Pay, PayPal, Venmo, a donor-advised fund): recorded as card, with
-- the wallet named here (Gate 1, decided Oct 17: card plus detail), instead of "payment method not recognized".
alter table payments    add column if not exists method_detail text;
alter table guests      add column if not exists display_name text;   -- the name exactly as typed; printed on badges
-- The display name IS the guest's name (badges, check-in, table chart, exports, portal); first and last are a
-- best guess for sorting and search (import-engine/src/names.ts). Guests saved before Oct 10 get "First Last".
update guests set display_name = btrim(concat_ws(' ', nullif(btrim(first_name), ''), nullif(btrim(last_name), '')))
 where coalesce(btrim(display_name), '') = '';
alter table orders      add column if not exists imported_guest_text text;  -- the export's free-text guest list, as written
alter table gala_events add column if not exists givelively_page_name text; -- e.g. "AAFE's 52nd Annual Gala"; set once per year
-- The gala's other Give Lively pages (Oct 15, Community Tickets): e.g. "AAFE's 52nd Annual Gala (Community Tickets)", a private
-- page selling discounted tickets to partners. Their purchases import like the main page's.
alter table gala_events add column if not exists givelively_other_pages text[] not null default '{}';
-- When this gala's guests' contact details were deleted (retention_sweep or staff_delete_guest_contacts); null: not yet.
alter table gala_events add column if not exists contacts_deleted_at timestamptz;
alter table orders      add column if not exists givelively_page text;  -- the Give Lively page it was bought on (null: imported before Oct 15)
alter table sponsorship_tiers add column if not exists guaranteed_seating boolean not null default false;
do $$ begin
  if upgrade_step('2026-10-14 guaranteed seating', 'Levels say whether they come with a table: sponsorships yes, tickets no') then
    -- Sponsorships come with a table; tickets are admittance only (AAFE's 2026 flyer). Staff can change it.
    update sponsorship_tiers set guaranteed_seating = true where tier_category = 'sponsorship';
  end if;
end $$;

-- Sponsorship levels, one list per gala (decided Oct 14): levels change every year, so each belongs to one gala.
-- A database loaded before this change has levels with no gala: they become the current gala's, and each past
-- gala gets its own copies ("gold-2026") for the orders it holds, so editing this year's levels never rewrites history.
-- (The upgrade itself runs further down, right after current_event_id(), so it uses the same rule.)
alter table sponsorship_tiers add column if not exists event_id   text references gala_events(id);
alter table sponsorship_tiers add column if not exists sort_order int not null default 0;
alter table sponsorship_tiers add column if not exists retired    boolean not null default false;

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
-- zero_amount (Oct 12 audit): a $0 or blank-amount purchase, left for staff instead of dropped (gl_import).
alter table import_review drop constraint if exists import_review_reason_check;
-- disputed (Gate 1): a chargeback on a Give Lively payment; staff decide, nothing is cancelled (gl_import).
alter table import_review add constraint import_review_reason_check check (reason in ('unknown_tier','guest_text_changed',
  'email_name_conflict','double_booked','possible_duplicate','refund','missing_from_source','zero_amount','disputed'));

-- Give Lively tier name -> tier, once per gala ("Ticket" -> Supporter).
create table if not exists tier_mappings (
  id              text primary key,
  event_id        text not null references gala_events(id),
  givelively_name text not null,
  name_key        text not null,   -- name_key(givelively_name)
  page_key        text not null default '',  -- name_key of one of the gala's other pages; '' for its main page
  tier_id         text not null references sponsorship_tiers(id),
  created_by      text not null,
  created_at      timestamptz not null default now(),
  unique (event_id, page_key, name_key)
);
-- Upgrade (Oct 15): a mapping belongs to one page, so "Ticket" on Community Tickets is its own mapping.
alter table tier_mappings add column if not exists page_key text not null default '';
alter table tier_mappings drop constraint if exists tier_mappings_event_id_name_key_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tier_mappings_event_id_page_key_name_key_key') then
    alter table tier_mappings add constraint tier_mappings_event_id_page_key_name_key_key unique (event_id, page_key, name_key);
  end if;
end $$;

-- A gala's food and access totals, kept after each guest's answers are deleted (decided Oct 18, decisions.md):
-- how many guests chose each option, never who. Written once per gala by staff_clear_needs().
create table if not exists gala_need_totals (
  event_id  text not null references gala_events(id),
  kind      text not null check (kind in ('dietary','accessibility')),
  choice    text not null,   -- an option of shared/src/guestNeeds.ts, 'Other', or 'Any need', 'None', 'Not answered'
  guests    int  not null check (guests >= 0),
  saved_at  timestamptz not null default now(),
  primary key (event_id, kind, choice)
);

-- ---------------------------------------------------------------------
-- Sync: the staff app fetches only what changed (Gate 3, data use, Oct 17)
--   Every row the staff app reads carries the id of the transaction that last wrote it (sync_txid). staff_sync(cursor)
--   returns the rows written by transactions at or after the cursor, and a new cursor: the oldest transaction still
--   running when it answered (pg_snapshot_xmin). A change still being saved then is at or after that cursor, so it comes
--   next time: nothing is missed, at worst a row is sent twice. Timestamps can't do this: a save that started earlier
--   but finished later carries an earlier time than the cursor and would be skipped. Deleted rows leave a tombstone.
-- ---------------------------------------------------------------------
create table if not exists sync_deleted (
  id          bigserial primary key,
  table_name  text not null,
  row_id      text not null,
  sync_txid   xid8 not null default pg_current_xact_id(),
  deleted_at  timestamptz not null default now()
);
-- One row. Tombstones up to `floor` were pruned, so a cursor at or below it gets everything again.
create table if not exists sync_state (
  id     int primary key default 1 check (id = 1),
  floor  xid8 not null default '0'
);
insert into sync_state (id) values (1) on conflict do nothing;

create or replace function sync_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.sync_txid := pg_current_xact_id();   -- the top-level transaction, also inside a subtransaction
  return new;
end $$;

create or replace function sync_tombstone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into sync_deleted (table_name, row_id) values (tg_table_name, old.id::text);
  return old;
end $$;

do $$
declare t text;
begin
  foreach t in array array['gala_events','staff_users','sponsorship_tiers','sponsors','orders','payments','event_tables','guests','seats','check_ins','email_log','salesforce_sync','import_runs','import_review','tier_mappings','audit_log']
  loop
    execute format('alter table %I add column if not exists sync_txid xid8 not null default pg_current_xact_id()', t);
    -- A restored backup carries another database's transaction ids; one ahead of this database's counter would be sent
    -- on every sync until the counter caught up.
    execute format('update %I set sync_txid = pg_current_xact_id() where sync_txid > pg_current_xact_id()', t);
    execute format('drop trigger if exists sync_touch on %I', t);
    execute format('create trigger sync_touch before insert or update on %I for each row execute function sync_touch()', t);
    if t <> 'audit_log' then   -- append-only: nothing to tombstone
      execute format('drop trigger if exists sync_tombstone on %I', t);
      execute format('create trigger sync_tombstone after delete on %I for each row execute function sync_tombstone()', t);
    end if;
  end loop;
end $$;

-- Indexes (Oct 12 audit). Postgres doesn't index the referencing side of a foreign key by itself, so following one
-- (an order's guests, a gala's orders) or deleting the row it points at reads the whole table. Every foreign key
-- gets one; scripts/test-backend.mjs fails if a new one is added without it. Safe to re-run.
create index if not exists check_ins_guest_id_idx               on check_ins (guest_id);
create index if not exists check_ins_order_id_idx               on check_ins (order_id);
create index if not exists email_log_guest_id_idx               on email_log (guest_id);
create index if not exists email_log_order_id_idx               on email_log (order_id);
create index if not exists email_log_payment_id_idx             on email_log (payment_id);
create index if not exists guests_order_id_idx                  on guests (order_id);
create index if not exists import_review_order_id_idx           on import_review (order_id);
create index if not exists import_review_run_id_idx             on import_review (run_id);
create index if not exists import_runs_event_id_idx             on import_runs (event_id);
create index if not exists orders_event_id_idx                  on orders (event_id);
create index if not exists orders_sponsor_id_idx                on orders (sponsor_id);
create index if not exists orders_tier_id_idx                   on orders (tier_id);
create index if not exists payments_order_id_idx                on payments (order_id);
create index if not exists seats_guest_id_idx                   on seats (guest_id);
create index if not exists sponsor_prospects_ask_tier_id_idx    on sponsor_prospects (ask_tier_id);
create index if not exists sponsor_prospects_follow_up_idx      on sponsor_prospects (follow_up_owner_id);
create index if not exists sponsor_prospects_sponsor_id_idx     on sponsor_prospects (sponsor_id);
create index if not exists sponsors_relationship_owner_id_idx   on sponsors (relationship_owner_id);
create index if not exists sponsorship_tiers_event_id_idx       on sponsorship_tiers (event_id);
create index if not exists tier_mappings_tier_id_idx            on tier_mappings (tier_id);
-- The sponsor portal reads its order's activity list every time a sponsor opens their link (portal_get_view).
create index if not exists audit_log_order_id_idx               on audit_log (order_id, id) where order_id is not null;

-- ---------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------

create or replace function hash_token(t text) returns text
language sql immutable set search_path = public as $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;

create or replace function new_id(prefix text) returns text
language sql volatile set search_path = public as $$ select prefix || '-' || left(replace(gen_random_uuid()::text, '-', ''), 12) $$;

-- 128 random bits (32 hex chars), the same format send-emails mints for QR e-tickets. A random UUID
-- has fixed version and variant digits (122 random bits), so the code is the first 32 hex characters of
-- the SHA-256 of two of them (244 random bits in), which leaves all 128 bits random.
create or replace function new_qr_token() returns text
language sql volatile set search_path = public as $$
  select 'AAFE-' || upper(left(encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex'), 32))
$$;

-- When a QR e-ticket for this event stops working: 6 a.m. New York time the morning after gala night.
create or replace function qr_expiry(p_event_id text) returns timestamptz
language sql stable security definer set search_path = public as $$
  select ((event_date + 1)::timestamp + interval '6 hours') at time zone 'America/New_York' from gala_events where id = p_event_id
$$;

-- A QR code admits whoever holds the seat, so it stops working when the seat gets a different guest,
-- or when the guest on it becomes a different person (name or email edited). Staff send a new one.
create or replace function seats_void_qr() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.guest_id is distinct from old.guest_id or new.status = 'cancelled' then
    if old.qr_token_hash is not null then
      perform write_audit('system', 'QR e-ticket', 'seat', new.id, new.order_id, 'qr.voided', 'valid', 'void', false,
        format('QR e-ticket for seat %s stopped working: %s.', new.slot_number,
               case when new.status = 'cancelled' then 'the seat was cancelled' else 'the seat has a different guest' end));
    end if;
    new.qr_token_hash := null; new.qr_token_expires_at := null;
  end if;
  return new;
end $$;
drop trigger if exists seats_void_qr on seats;
create trigger seats_void_qr before update of guest_id, status on seats for each row execute function seats_void_qr();

create or replace function guests_void_qr() returns trigger
language plpgsql security definer set search_path = public as $$
declare s record; n int;
begin
  -- The display name is the name printed on the badge and the door list, so a new one is a new person on the ticket
  -- too (Oct 12 audit: changing only the display name kept the old QR code working). A blank display name stands for
  -- "First Last", so filling it in with that (backend.sql does, for guests saved before Oct 10) is not a change.
  if (new.first_name, new.last_name, new.email,
      coalesce(nullif(btrim(new.display_name), ''), btrim(concat_ws(' ', nullif(btrim(new.first_name), ''), nullif(btrim(new.last_name), '')))))
     is distinct from
     (old.first_name, old.last_name, old.email,
      coalesce(nullif(btrim(old.display_name), ''), btrim(concat_ws(' ', nullif(btrim(old.first_name), ''), nullif(btrim(old.last_name), ''))))) then
    for s in with v as (update seats set qr_token_hash = null, qr_token_expires_at = null
                         where guest_id = new.id and qr_token_hash is not null returning id, order_id, slot_number)
             select * from v loop
      perform write_audit('system', 'QR e-ticket', 'seat', s.id, s.order_id, 'qr.voided', 'valid', 'void', false,
        format('QR e-ticket for seat %s stopped working: the guest''s name or email changed.', s.slot_number));
    end loop;
    -- An invitation not sent yet would issue a working code to the old name and email when it goes out (Gate 2 review,
    -- Oct 15): it's discarded, as when a seat is released. email_mark_sent issues codes only for queued emails.
    with c as (update email_log set status = 'cancelled'
                where guest_id = new.id and template = 'qr_invitation' and status = 'queued' returning 1)
    select count(*) into n from c;
    if n > 0 then
      perform write_audit('system', 'QR e-ticket', 'guest', new.id, null, 'email.cancelled', 'queued', 'cancelled', false,
        'QR invitation not sent: the guest''s name or email changed. Send a new one.');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guests_void_qr on guests;
create trigger guests_void_qr after update of first_name, last_name, display_name, email on guests for each row execute function guests_void_qr();

-- A project holds demo galas or AAFE's real ones, never both. The demo sets carry hundreds of working
-- sponsor links and QR codes, so a real gala added beside them would share a database with links anyone
-- in the team has seen. npm run db:load already refuses to load demo data next to a real gala; this
-- covers the other direction (a real gala added to a demo project) and flipping is_synthetic.
create or replace function gala_events_no_mixing() returns trigger
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from gala_events where id <> new.id and is_synthetic <> new.is_synthetic) then
    raise exception 'invalid_input: % gala can''t be added to a project that holds % galas. Demo data and AAFE''s real data never share a project: use a project without the demo sets for real data.',
      case when new.is_synthetic then 'a demo' else 'a real (not synthetic)' end,
      case when new.is_synthetic then 'real' else 'demo (synthetic)' end;
  end if;
  return new;
end $$;
drop trigger if exists gala_events_no_mixing on gala_events;
create trigger gala_events_no_mixing before insert or update of is_synthetic on gala_events
  for each row execute function gala_events_no_mixing();

-- The gala being run now: the one marked live; else the soonest one dated from 30 days ago on (New York time), so a
-- gala stays current for a month after its date for results, the Salesforce export and late check-in fixes; else
-- the newest one not closed. Creating next year's gala in planning must not take check-in, imports and exports away
-- from this year's before it is closed (Oct 12 audit; the 30 days from Cornell's #112 review).
-- SECURITY INVOKER (Gate 2, Oct 15): the access rules call it as the signed-in person, who reads gala_events anyway;
-- inside the staff_* functions it runs with their rights, as before.
create or replace function current_event_id() returns text
language sql stable security invoker set search_path = public as $$
  select id from gala_events where status <> 'closed'
   order by (status = 'live') desc,
            (event_date >= (now() at time zone 'America/New_York')::date - 30) desc,
            case when event_date >= (now() at time zone 'America/New_York')::date - 30 then event_date end asc nulls last,
            year desc
   limit 1
$$;

-- The per-gala levels upgrade (columns added near the top): levels with no gala go to the gala being run now, by the same rule as
-- every other function, so a planning gala for next year doesn't receive this year's levels (review of #133).
do $$
declare cur text := current_event_id(); r record;
begin
  if not upgrade_step('2026-10-14 levels per gala', 'Each gala has its own levels; past galas keep copies at their own prices') then return; end if;
  for r in select distinct o.event_id, o.tier_id, e.year from orders o join gala_events e on e.id = o.event_id
            join sponsorship_tiers t on t.id = o.tier_id where t.event_id is null and o.event_id is distinct from cur loop
    insert into sponsorship_tiers (id, event_id, sort_order, retired, name, contribution_amount, included_seat_count, tier_category, required_materials, guaranteed_seating)
    select r.tier_id || '-' || r.year, r.event_id, sort_order, false, name, contribution_amount, included_seat_count, tier_category, required_materials, guaranteed_seating
      from sponsorship_tiers where id = r.tier_id
    on conflict (id) do nothing;
    update orders set tier_id = r.tier_id || '-' || r.year where event_id = r.event_id and tier_id = r.tier_id;
  end loop;
  update sponsorship_tiers set event_id = cur where event_id is null;
  -- Upgraded levels have sort_order 0: order them by amount, as the seeds do, not alphabetically by id.
  update sponsorship_tiers t set sort_order = r2.n from (select id, row_number() over (partition by event_id order by contribution_amount desc, id) n
    from sponsorship_tiers) r2 where t.id = r2.id and t.sort_order = 0;
end $$;

-- An order on the gala being run now; null passes (a walk-in with no sponsor).
create or replace function require_gala_order(p_order_id text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_order_id is not null and not exists (select 1 from orders where id = p_order_id and event_id = current_event_id()) then
    raise exception 'not_found: no such order on this gala';
  end if;
end $$;

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
declare t text; p text;
begin
  foreach t in array array['gala_events','staff_users','sponsorship_tiers','sponsors','orders','payments',
    'event_tables','guests','seats','check_ins','email_log','audit_log','salesforce_sync',
    'givelively_sync_state','givelively_raw','import_runs','import_review','tier_mappings','sponsor_prospects',
    'sync_deleted','sync_state','schema_upgrades','gala_need_totals']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists staff_read on %I', t);
    -- No direct writes, even for gala admins (Gate 2, Oct 15): a direct edit to staff_users (someone's role) or
    -- gala_events (a date that link and QR expiries follow) left no line in the change log. Every change goes through a
    -- staff_* function, which checks the role and logs it; new staff are added in Supabase's SQL editor (BACKEND.md).
    foreach p in array array['admin_write','admin_insert','admin_update','admin_delete'] loop
      execute format('drop policy if exists %I on %I', p, t);
    end loop;
  end loop;

  -- Staff read the gala's records directly: the staff app loads them.
  foreach t in array array['gala_events','staff_users','sponsorship_tiers','sponsors','orders','payments','event_tables','seats',
    'check_ins','audit_log','salesforce_sync','givelively_sync_state','import_runs','tier_mappings','sponsor_prospects',
    'sync_deleted','sync_state','schema_upgrades','gala_need_totals']
  loop
    execute format($p$create policy staff_read on %I for select to authenticated
                     using (staff_role() in ('gala_admin','relationship_manager'))$p$, t);
  end loop;
  -- Guests' emails and food and access answers, the emails sent about them and the import's review items (decided
  -- Oct 15): gala admins read every year; relationship managers only the gala being run, which their sponsor and comp
  -- work needs. Give Lively's raw records are gala admins' only.
  create policy staff_read on guests for select to authenticated
    using (staff_role() = 'gala_admin' or (staff_role() = 'relationship_manager'
           and order_id in (select id from orders where event_id = current_event_id())));
  create policy staff_read on email_log for select to authenticated
    using (staff_role() = 'gala_admin' or (staff_role() = 'relationship_manager'
           and order_id in (select id from orders where event_id = current_event_id())));
  create policy staff_read on import_review for select to authenticated
    using (staff_role() = 'gala_admin' or (staff_role() = 'relationship_manager' and event_id = current_event_id()));
  create policy staff_read on givelively_raw for select to authenticated using (staff_role() = 'gala_admin');
end $$;

-- audit_log is append-only, even for the table owner's API roles.
revoke update, delete, truncate on audit_log from anon, authenticated;
-- Its change details (old and new values: emails, food and access answers) stay in the database for the record, but no
-- API role reads them (Gate 2, Oct 15); the app shows the summary. Only the listed columns can be read, so a new column
-- stays hidden until it's added here.
revoke select on audit_log from anon, authenticated;
grant select (id, at, actor_type, actor, entity, entity_id, order_id, action, from_state, to_state, guest_visible, summary, sync_txid)
  on audit_log to authenticated;

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
     and portal_token_expires_at > now();   -- a link with no expiry doesn't work (Gate 2): never "forever"
  if o.id is null then raise exception 'invalid_link' using errcode = 'P0002'; end if;
  return o;
end $$;

create or replace function portal_get_view(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  o orders := portal_order(p_token);
  v_paid numeric; v_balance numeric; v_n int; v_view jsonb; v_show boolean;
begin
  -- Arrivals stay hidden unless AAFE has switched them on: a checked-in seat then reads as badge ready.
  select sponsor_arrivals_visible into v_show from gala_events where id = o.event_id;
  v_show := coalesce(v_show, false);
  -- What the staff app and the sponsor report count (shared/src/data.ts orderMoney, #170): per payment, the amount toward
  -- the commitment less any refund, never below 0. Not the gross: it includes a fee the donor chose to cover.
  select coalesce(sum(greatest(original_amount - refunded_amount, 0)), 0), count(*)
    into v_paid, v_n from payments where order_id = o.id;
  v_balance := case when o.status in ('cancelled', 'comp') then 0 else greatest(0, o.commitment_amount - v_paid) end;

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
    -- Shown only when switched on: how many of this sponsor's guests (and walk-ins on their seats) arrived.
    'arrivals', case when v_show then (select jsonb_build_object(
                'arrived', count(*) filter (where s.status = 'checked_in'),
                'expected', count(*) filter (where s.guest_id is not null),
                'walkIns', (select count(*) from check_ins c where c.order_id = o.id and c.guest_id is null))
              from seats s where s.order_id = o.id and s.status <> 'cancelled') end,
    'seats', coalesce((select jsonb_agg(jsonb_build_object(
                'slot', s.slot_number,
                'status', case when s.status = 'checked_in' and not v_show then 'badge_ready' else s.status end,
                'guest', case when g.id is null then null else jsonb_build_object(
                  'first_name', g.first_name, 'last_name', g.last_name, 'display_name', g.display_name, 'title', coalesce(g.title, ''),
                  'organization', coalesce(g.organization, ''), 'email', coalesce(g.email, ''),
                  'dietary_needs', coalesce(g.dietary_needs, ''), 'accessibility_needs', coalesce(g.accessibility_needs, ''),
                  'updated_at', g.updated_at) end)
                || case when v_show and g.id is not null then jsonb_build_object('arrived', s.status = 'checked_in') else '{}'::jsonb end
                order by s.slot_number)
              from seats s left join guests g on g.id = s.guest_id
              where s.order_id = o.id and s.status <> 'cancelled'), '[]'),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('at', a.at, 'action', a.action, 'summary', a.summary) order by a.at desc, a.id desc)
              from audit_log a where a.order_id = o.id and a.guest_visible), '[]'))
  into v_view
  from sponsors sp, sponsorship_tiers t, gala_events e
  where sp.id = o.sponsor_id and t.id = o.tier_id and e.id = o.event_id;
  return v_view;
end $$;

-- A guest's name from whatever the caller sent: the display name (or "First Last"), and first and last (or, when only
-- a full name came in, its last word as the last name; the apps send the name engine's split). One word: no last name.
create or replace function name_parts(p_display text, p_first text, p_last text, out display text, out first text, out last text)
language sql immutable set search_path = public as $$
  select d, case when f <> '' or l <> '' then f else coalesce(nullif(regexp_replace(d, '\s+\S+$', ''), d), d) end,
            case when f <> '' or l <> '' then l when d ~ '\s' then regexp_replace(d, '^.*\s', '') else '' end
    from (select btrim(coalesce(p_first, '')) f, btrim(coalesce(p_last, '')) l) x,
         lateral (select coalesce(nullif(btrim(regexp_replace(coalesce(p_display, ''), '\s+', ' ', 'g')), ''),
                                  btrim(concat_ws(' ', nullif(x.f, ''), nullif(x.l, ''))), '') d) y
$$;
revoke all on function name_parts(text, text, text) from public, anon, authenticated;

create or replace function portal_save_guest(p_token text, p_slot int, p_guest jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o orders := portal_order(p_token);
  st seats; g guests; g_old guests; v_contact text; v_action text; v_from text; v_to text;
  v_badge boolean := true;   -- what prints on the badge changed (name, title, organization)
  v_first text := left(trim(coalesce(p_guest ->> 'first_name', '')), 100);
  v_last  text := left(trim(coalesce(p_guest ->> 'last_name', '')), 100);
  v_display text := left(trim(coalesce(p_guest ->> 'display_name', '')), 200);
  f_title text := nullif(left(trim(coalesce(p_guest ->> 'title', '')), 200), '');
  f_org   text := nullif(left(trim(coalesce(p_guest ->> 'organization', '')), 200), '');
  f_email text := nullif(left(trim(coalesce(p_guest ->> 'email', '')), 254), '');
  f_diet  text := nullif(left(trim(coalesce(p_guest ->> 'dietary_needs', '')), 500), '');
  f_acc   text := nullif(left(trim(coalesce(p_guest ->> 'accessibility_needs', '')), 500), '');
begin
  select * into st from seats where order_id = o.id and slot_number = p_slot and status <> 'cancelled' for update;
  if st.id is null then raise exception 'invalid_input: no such seat'; end if;
  if st.status = 'checked_in' then raise exception 'seat_locked: this seat can no longer be changed online; please contact AAFE'; end if;
  select * into g_old from guests where id = st.guest_id;
  -- First and last sent without a display name, unchanged: keep the display name staff may have corrected.
  if v_display = '' and g_old.id is not null and g_old.first_name = v_first and g_old.last_name = v_last then
    v_display := coalesce(g_old.display_name, '');
  end if;
  select n.display, n.first, n.last into v_display, v_first, v_last from name_parts(v_display, v_first, v_last) n;
  if v_display = '' then raise exception 'invalid_input: a name is required'; end if;
  select primary_contact_name into v_contact from sponsors where id = o.sponsor_id;
  v_from := st.status;

  if st.guest_id is not null then
    -- Only a real change counts (Oct 12 audit): pressing Save again changes nothing, and only a change to what prints
    -- on the badge sends it back for staff review (or reprint, once printed). A food, access or email answer is saved
    -- without undoing staff's review. Blank and missing count as the same.
    v_badge := coalesce(g_old.first_name, '') <> v_first or coalesce(g_old.last_name, '') <> v_last
            or coalesce(g_old.display_name, '') <> v_display or coalesce(g_old.title, '') <> coalesce(f_title, '')
            or coalesce(g_old.organization, '') <> coalesce(f_org, '');
    if not v_badge and coalesce(g_old.email, '') = coalesce(f_email, '') and coalesce(g_old.dietary_needs, '') = coalesce(f_diet, '')
       and coalesce(g_old.accessibility_needs, '') = coalesce(f_acc, '') then
      return portal_get_view(p_token);
    end if;
    v_action := 'guest.updated';
    update guests set first_name = v_first, last_name = v_last, display_name = v_display, title = f_title, organization = f_org, email = f_email,
           dietary_needs = f_diet, accessibility_needs = f_acc, last_updated_by = 'guest_portal', updated_at = now(),
           -- a new name, title or organization must be reviewed again, and a printed badge reprinted
           badge_status = case when not v_badge then badge_status when badge_status = 'printed' then 'reprint_needed' else 'needs_review' end
     where id = st.guest_id returning * into g;
  else
    v_action := 'guest.submitted';
    insert into guests (id, order_id, first_name, last_name, display_name, title, organization, email, dietary_needs, accessibility_needs,
                        guest_type, last_updated_by)
    values (new_id('g'), o.id, v_first, v_last, v_display, f_title, f_org, f_email, f_diet, f_acc,
            case when (select tier_category from sponsorship_tiers where id = o.tier_id) = 'ticket' then 'ticket_holder' else 'sponsor_guest' end,
            'guest_portal')
    returning * into g;
  end if;

  v_to := case when v_badge then 'submitted' else st.status end;
  update seats set guest_id = g.id, status = v_to, updated_at = now() where id = st.id;
  perform write_audit('guest_portal', 'Guest portal (' || v_contact || ')', 'guest', g.id, o.id, v_action, v_from, v_to, true,
    case when v_action = 'guest.submitted' then format('%s added to seat %s.', v_display, p_slot)
         else format('%s updated (seat %s).', v_display, p_slot) end,
    case when v_action = 'guest.updated' then audit_changes(to_jsonb(g_old), to_jsonb(g),
      array['first_name','last_name','display_name','title','organization','email','dietary_needs','accessibility_needs']) end);
  return portal_get_view(p_token);
end $$;

create or replace function portal_release_seat(p_token text, p_slot int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders := portal_order(p_token); st seats; g guests;
begin
  select * into st from seats where order_id = o.id and slot_number = p_slot and status <> 'cancelled' for update;
  if st.id is null then raise exception 'invalid_input: no such seat'; end if;
  if st.status = 'checked_in' then raise exception 'seat_locked: this seat can no longer be changed online; please contact AAFE'; end if;
  select * into g from guests where id = st.guest_id;
  if g.id is null then return portal_get_view(p_token); end if;

  update seats set guest_id = null, status = 'unnamed', updated_at = now() where id = st.id;
  -- Emails about this guest (a QR invitation): an unsent one is discarded; sent ones stay in the log, unlinked.
  update email_log set status = case when status = 'queued' then 'cancelled' else status end, guest_id = null where guest_id = g.id;
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

-- The gala the server treats as this year's (current_event_id), so the staff app shows the gala its saves go to.
-- A planning gala for next year (Start next year's gala) must not take over the pages (review of #133/#134, Oct 14).
create or replace function staff_current_event() returns text
language sql stable security definer set search_path = public as $$
  select case when (require_staff(array['gala_admin','relationship_manager','check_in_volunteer'])).id is null then null
              else current_event_id() end
$$;

-- updateGuest
create or replace function staff_update_guest(p_guest_id text, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  me staff_users := require_staff(array['gala_admin','relationship_manager']);
  allowed text[] := array['first_name','last_name','display_name','title','organization','email','dietary_needs','accessibility_needs','relationship_note'];
  g guests; n guests; v_patch jsonb; v_changed text[];
begin
  select * into g from guests where id = p_guest_id for update;
  if g.id is null then raise exception 'not_found'; end if;
  select coalesce(jsonb_object_agg(key, case when jsonb_typeof(value) = 'string' and trim(value #>> '{}') = '' then 'null'::jsonb else value end), '{}')
    into v_patch from jsonb_each(coalesce(p_patch, '{}')) where key = any (allowed);
  n := jsonb_populate_record(g, v_patch);
  if not (v_patch ? 'display_name') and (n.first_name is distinct from g.first_name or n.last_name is distinct from g.last_name)
     and coalesce(g.display_name, '') in ('', btrim(concat_ws(' ', nullif(g.first_name, ''), nullif(g.last_name, '')))) then
    n.display_name := null;   -- it was just "First Last": follow the new first and last
  end if;
  select p.display, p.first, p.last into n.display_name, n.first_name, n.last_name from name_parts(n.display_name, n.first_name, n.last_name) p;
  if n.display_name = '' then raise exception 'invalid_input: a name is required'; end if;
  select coalesce(array_agg(k), '{}') into v_changed from unnest(allowed) k where to_jsonb(n) -> k is distinct from to_jsonb(g) -> k;
  if cardinality(v_changed) = 0 then return; end if;

  update guests set first_name = n.first_name, last_name = n.last_name, display_name = n.display_name, title = n.title,
         organization = n.organization, email = n.email, dietary_needs = n.dietary_needs, accessibility_needs = n.accessibility_needs,
         relationship_note = n.relationship_note, last_updated_by = 'staff', updated_at = now(),
         badge_status = case when badge_status = 'printed'
                              and v_changed && array['first_name','last_name','display_name','title','organization'] then 'reprint_needed'
                             else badge_status end
   where id = g.id;
  perform write_audit('staff', me.name, 'guest', g.id, g.order_id, 'guest.updated', null, null, false,
    format('%s: %s edited by staff.', n.display_name, array_to_string(v_changed, ', ')),
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
  -- The staff app offers only the next step, so a refusal here means the seat changed since the page loaded
  -- (another person, the portal or the door): say so in words; the app reloads on invalid_transition.
  if not ((p_to = 'reviewed' and st.status = 'submitted') or (p_to = 'badge_ready' and st.status = 'reviewed')) then
    raise exception 'invalid_transition: this guest''s status changed (now %); check the latest and try again', replace(st.status, '_', ' ');
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

-- assignSeat: the guest list's Table picker (p_table_id null = no table)
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
    case when p_table_id is null then format('%s %s no longer has a table.', g.first_name, g.last_name)
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

  select sum(greatest(original_amount - refunded_amount, 0)) into v_applied from payments where order_id = o.id;   -- per payment, never below 0 (#170)
  -- A comp or a cancelled order keeps its status: a check that arrives after a cancellation is recorded, and the order
  -- stays cancelled (owing nothing) until staff decide otherwise (Oct 12 audit; Gate 1, money rules).
  v_status := case when o.status in ('comp', 'cancelled') then o.status
                   when v_applied + 0.005 >= o.commitment_amount then 'paid' else 'partially_paid' end;
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
  select * into t from sponsorship_tiers where id = p_tier_id and event_id = current_event_id() and not retired;
  select * into e from gala_events where id = current_event_id();
  if t.id is null or e.id is null then raise exception 'not_found: no such level on this gala'; end if;

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
  v_first text; v_last text; v_display text;
  v_note text := nullif(trim(coalesce(p_guest ->> 'relationship_note', '')), '');
begin
  select n.display, n.first, n.last into v_display, v_first, v_last
    from name_parts(p_guest ->> 'display_name', p_guest ->> 'first_name', p_guest ->> 'last_name') n;
  if v_display = '' then raise exception 'invalid_input: a name is required'; end if;
  -- One comp guest at a time per gala (Oct 12 audit): two staff adding at once both read the same last slot (one got a
  -- "duplicate key" error and lost the guest), and on a gala with no comp order yet both created one. The lock waits
  -- for the other add to finish and is released when this one commits.
  perform pg_advisory_xact_lock(hashtext('staff_add_comp_guest'), hashtext(current_event_id()));
  -- The comp order that holds relationship guests, or the one this function made for them (its note). A gala has other
  -- comp orders too (staff, volunteers, event staff, government and VIP guests), and "the earliest" picked among them
  -- by chance when they share a creation time, as all five in the demo sets do. Found checking AAFE's Oct 20
  -- walk-through: with the same rows stored in another order, a relationship guest was filed under the staff order.
  select o.id into v_order from orders o
   where o.event_id = current_event_id() and o.status <> 'cancelled'
     and o.tier_id in (select id from sponsorship_tiers where event_id = current_event_id() and tier_category = 'complimentary')
     and (exists (select 1 from guests x where x.order_id = o.id and x.guest_type = 'comp_relationship')
          or o.internal_notes like 'Complimentary relationship guests%')
   order by exists (select 1 from guests x where x.order_id = o.id and x.guest_type = 'comp_relationship') desc, o.created_at, o.id
   limit 1;
  if v_order is null then
    v_sp := new_id('sp'); v_order := new_id('ord');
    insert into sponsors (id, organization_name, primary_contact_name, primary_contact_email, phone, relationship_owner_id)
    values (v_sp, 'AAFE — Relationship guests', me.name, me.email, '', me.id);
    insert into orders (id, event_id, sponsor_id, tier_id, source, commitment_amount, status, internal_notes)
    values (v_order, current_event_id(), v_sp, comp_level(), 'comp', 0, 'comp', 'Complimentary relationship guests.');
  end if;
  select coalesce(max(slot_number), 0) + 1 into v_slot from seats where order_id = v_order;

  insert into guests (id, order_id, first_name, last_name, display_name, title, organization, email, guest_type, relationship_note, qr_token, last_updated_by)
  values (v_guest, v_order, v_first, v_last, v_display, nullif(trim(coalesce(p_guest ->> 'title', '')), ''),
          nullif(trim(coalesce(p_guest ->> 'organization', '')), ''), nullif(trim(coalesce(p_guest ->> 'email', '')), ''),
          'comp_relationship', v_note, null, 'staff');
  insert into seats (id, order_id, slot_number, guest_id, status) values ('seat-' || v_order || '-' || v_slot, v_order, v_slot, v_guest, 'reviewed');
  perform write_audit('staff', me.name, 'guest', v_guest, v_order, 'comp_guest.added', null, 'reviewed', false,
    format('%s added as relationship guest (%s).', v_display, coalesce(v_note, 'no note')));
  return v_guest;
end $$;

-- sendQrInvite. The staff member sending it is its approver (hard rule 4); the send is logged.
create or replace function staff_send_qr_invite(p_guest_id text) returns text
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); g guests; v_id text;
begin
  select * into g from guests where id = p_guest_id;
  if g.id is null then raise exception 'not_found'; end if;
  if not exists (select 1 from seats where guest_id = g.id and status <> 'cancelled') then
    raise exception 'invalid_input: guest has no seat';
  end if;
  if g.email is null then raise exception 'invalid_input: guest has no email'; end if;
  v_id := enqueue_email('qr_invitation', g.email, g.first_name || ' ' || g.last_name, g.order_id, g.id, 'staff_manual', me.name);
  perform write_audit('staff', me.name, 'email', v_id, g.order_id, 'email.approved', null, 'approved', false,
    format('QR invitation to %s %s sent by staff.', g.first_name, g.last_name));
  return v_id;
end $$;

-- resendPortalLink. Sending mints a NEW link; the old link stops working. Logged like sendQrInvite.
create or replace function staff_resend_portal_link(p_order_id text) returns text
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); sp sponsors; v_id text;
begin
  select s.* into sp from orders o join sponsors s on s.id = o.sponsor_id where o.id = p_order_id;
  if sp.id is null then raise exception 'not_found'; end if;
  v_id := enqueue_email('portal_link', sp.primary_contact_email, sp.primary_contact_name, p_order_id, null, 'staff_manual', me.name);
  perform write_audit('staff', me.name, 'email', v_id, p_order_id, 'email.approved', null, 'approved', false,
    format('Guest-list link resent to %s by staff; the old link stops working when it sends.', sp.primary_contact_name));
  return v_id;
end $$;

-- Does a food or access answer name a need? Blank means nobody answered; "None" (PR #128) or "No" means the guest
-- answered and has none. Same rule as needStatus() in shared/src/guestNeeds.ts.
create or replace function has_need(p text) returns boolean
language sql immutable set search_path = public as $$ select lower(btrim(coalesce(p, ''))) not in ('', 'none', 'no') $$;

-- Check-in screen data for all roles (volunteers cannot read tables directly). Accessibility needs travel as a
-- yes/no flag only ("ask a staff lead"): the details stay staff-only (data-handling.md, review item 2, Oct 13).
create or replace function checkin_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when (require_staff(array['gala_admin','relationship_manager','check_in_volunteer'])).id is null then null else
    coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'order_id', g.order_id, 'first_name', g.first_name, 'last_name', g.last_name, 'title', g.title,
      'organization', g.organization, 'sponsor', sp.organization_name, 'guest_type', g.guest_type,
      'table_number', t.number, 'seat_number', g.seat_number, 'attendance_status', g.attendance_status,
      'has_access_needs', has_need(g.accessibility_needs)) order by g.last_name, g.first_name), '[]') end
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
  select gg.* into g from guests gg join orders o on o.id = gg.order_id
   where gg.id = p_guest_id and o.event_id = current_event_id() and o.status <> 'cancelled' for update of gg;
  if g.id is null then raise exception 'not_found: guest is not on this gala''s list'; end if;
  if g.attendance_status = 'checked_in' then return false; end if;
  insert into check_ins (id, event_id, guest_id, order_id, method, type, checked_in_by, note, staff_id, seat_status_before)
  values (v_id, current_event_id(), g.id, g.order_id, p_method, 'standard', me.name, '', me.id,
          (select status from seats where guest_id = g.id and status <> 'cancelled' limit 1));
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
  if v_expires is null or v_expires <= now() then raise exception 'expired: QR code has expired'; end if;
  v_new := staff_check_in(g.id, 'qr');
  return jsonb_build_object('guest_id', g.id, 'first_name', g.first_name, 'last_name', g.last_name, 'already_checked_in', not v_new);
end $$;

-- checkInException: walk-in, unnamed sponsor seat, etc.
create or replace function staff_check_in_exception(p_name text, p_order_id text, p_type text, p_note text) returns text
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager','check_in_volunteer']); v_id text := new_id('ci');
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_type), '') = '' then raise exception 'invalid_input: name and type are required'; end if;
  perform require_gala_order(p_order_id);
  insert into check_ins (id, event_id, order_id, arrival_name, method, type, checked_in_by, note, staff_id)
  values (v_id, current_event_id(), p_order_id, trim(p_name), 'exception', p_type, me.name, coalesce(p_note, ''), me.id);
  perform write_audit('staff', me.name, 'check_in', v_id, p_order_id, 'checkin.exception', null, 'checked_in', false,
    format('%s checked in as exception: %s.', trim(p_name), p_type));
  return v_id;
end $$;

-- Offline check-in (decided Oct 6): if the venue's internet drops, the iPad keeps checking guests in
-- from a list it saved earlier and syncs when it is back online.

-- The list the iPad saves: every guest of the current gala with what the desk needs, each seat's QR
-- code hash (so a scanned code is checked on the iPad), and who has arrived. No email, phone, payment,
-- dietary needs, staff notes, or accessibility details: only a yes/no flag, since the list is saved on the iPad. A hash can't be turned back into a working code. Like checkin_list(),
-- it is a read, so it isn't logged (the iPad refreshes it often).
-- One door-list line per guest of a gala: the iPad's list (staff_checkin_snapshot) and its changes (door_sync) are built
-- here, so the two can't drift apart. p_since: only guests whose line could have changed since that transaction, i.e.
-- any of the seven rows behind it (guest, order, sponsor, level, table, seat, check-in) was written at or after it
-- (Sync near the top explains the cursor). Runs with the caller's rights; only the two door functions call it.
create or replace function door_entries(p_event text, p_since xid8) returns table (id text, last_name text, first_name text, entry jsonb)
language sql stable set search_path = public as $$
  select g.id, g.last_name, g.first_name, jsonb_build_object(
    'id', g.id, 'order_id', g.order_id, 'first_name', g.first_name, 'last_name', g.last_name, 'display_name', g.display_name, 'title', g.title,
    'organization', g.organization, 'sponsor', sp.organization_name, 'package', tr.name, 'guest_type', g.guest_type,
    'table_number', t.number, 'seat_number', g.seat_number, 'has_access_needs', has_need(g.accessibility_needs),
    'qr_hash', case when s.qr_token_expires_at > now() then s.qr_token_hash end,
    'qr_expires_at', case when s.qr_token_expires_at > now() then s.qr_token_expires_at end,
    'arrived', g.attendance_status = 'checked_in' or ci.id is not null,
    'checkin_id', ci.id, 'checkin_client_id', ci.client_id, 'checked_in_at', ci.checked_in_at, 'checked_in_by', ci.checked_in_by, 'device', ci.device)
  from guests g join orders o on o.id = g.order_id join sponsors sp on sp.id = o.sponsor_id
  join sponsorship_tiers tr on tr.id = o.tier_id
  left join event_tables t on t.id = g.table_id
  left join seats s on s.guest_id = g.id and s.status <> 'cancelled'
  left join check_ins ci on ci.guest_id = g.id and ci.event_id = p_event
  where o.event_id = p_event and o.status <> 'cancelled'
    and (p_since is null or greatest(g.sync_txid, o.sync_txid, sp.sync_txid, tr.sync_txid, t.sync_txid, s.sync_txid, ci.sync_txid) >= p_since)
$$;

-- Unnamed sponsor seats, so the desk knows which sponsors may bring a walk-in.
create or replace function door_unnamed_seats(p_event text) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('order_id', o.id, 'sponsor', sp.organization_name, 'count', u.n) order by sp.organization_name), '[]')
  from (select order_id, count(*)::int n from seats where guest_id is null and status <> 'cancelled' group by order_id) u
  join orders o on o.id = u.order_id join sponsors sp on sp.id = o.sponsor_id
  where o.event_id = p_event and o.status <> 'cancelled'
$$;

-- Walk-ins and other approved exceptions so far tonight (their notes stay off the iPad).
create or replace function door_exceptions(p_event text) returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', ci.id, 'client_id', ci.client_id, 'name', ci.arrival_name, 'type', ci.type,
           'order_id', ci.order_id, 'checked_in_at', ci.checked_in_at, 'checked_in_by', ci.checked_in_by, 'device', ci.device)
         order by ci.checked_in_at desc), '[]')
  from check_ins ci where ci.event_id = p_event and ci.guest_id is null
$$;

create or replace function staff_checkin_snapshot() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform require_staff(array['gala_admin','relationship_manager','check_in_volunteer']);
  select jsonb_build_object(
    'event_id', e.id, 'event_name', e.name, 'generated_at', now(),
    -- For the iPad's sign-in screen; a 'closed' gala tells the iPad to clear its saved list.
    'event_date', e.event_date, 'doors_time', e.doors_time, 'venue_name', e.venue_name, 'status', e.status,
    'guests', coalesce((select jsonb_agg(d.entry order by d.last_name, d.first_name) from door_entries(e.id, null) d), '[]'),
    'unnamed_seats', door_unnamed_seats(e.id),
    'exceptions', door_exceptions(e.id))
  into v from gala_events e where e.id = current_event_id();
  return v;
end $$;

-- The door list by changes (Gate 3, data use, part 3): what staff_checkin_snapshot sends, but after the first call only
-- what changed since the cursor (the same cursor as staff_sync: nothing still being saved is missed). The iPad merges
-- 'guests' into its saved list by id and drops 'removed'; 'unnamed_seats' and 'exceptions' come whole, and only when
-- something under them changed (null otherwise). Everything comes again with no cursor, a different gala, or a cursor
-- older than pruned tombstones; 'count' lets the iPad check its copy. Same fields as the snapshot, for volunteers too.
-- null: no gala is open. A check-in deleted without touching its guest would be missed: staff_undo_check_in, the only
-- delete, also resets the guest (test-door-sync.mjs holds it).
create or replace function door_sync(p_cursor xid8 default null, p_event text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e gala_events; v_full boolean;
begin
  perform require_staff(array['gala_admin','relationship_manager','check_in_volunteer']);
  select * into e from gala_events where id = current_event_id();
  if e.id is null then return null; end if;
  v_full := p_cursor is null or p_cursor <= (select floor from sync_state where id = 1) or p_event is distinct from e.id;
  return jsonb_build_object(
    'cursor', pg_snapshot_xmin(pg_current_snapshot())::text, 'full', v_full,
    'event_id', e.id, 'event_name', e.name, 'generated_at', now(),
    'event_date', e.event_date, 'doors_time', e.doors_time, 'venue_name', e.venue_name, 'status', e.status,
    'guests', coalesce((select jsonb_agg(d.entry order by d.last_name, d.first_name)
                          from door_entries(e.id, case when v_full then null else p_cursor end) d), '[]'),
    -- Off the list since the cursor: deleted, or their order was cancelled or moved to another gala.
    'removed', case when v_full then '[]'::jsonb else coalesce((select jsonb_agg(x.id) from (
        select d.row_id id from sync_deleted d where d.table_name = 'guests' and d.sync_txid >= p_cursor
          and not exists (select 1 from guests g where g.id = d.row_id)
        union
        select g.id from guests g join orders o on o.id = g.order_id
         where greatest(g.sync_txid, o.sync_txid) >= p_cursor and (o.event_id <> e.id or o.status = 'cancelled')) x), '[]') end,
    'unnamed_seats', case when v_full or exists (select 1 from seats where sync_txid >= p_cursor)
                            or exists (select 1 from orders where sync_txid >= p_cursor)
                            or exists (select 1 from sponsors where sync_txid >= p_cursor)
                            or exists (select 1 from sync_deleted where table_name in ('seats', 'orders') and sync_txid >= p_cursor)
                          then door_unnamed_seats(e.id) end,
    'exceptions', case when v_full or exists (select 1 from check_ins where sync_txid >= p_cursor)
                         or exists (select 1 from sync_deleted where table_name = 'check_ins' and sync_txid >= p_cursor)
                       then door_exceptions(e.id) end,
    'count', (select count(*) from guests g join orders o on o.id = g.order_id where o.event_id = e.id and o.status <> 'cancelled'));
end $$;

-- Undo a check-in from the iPad (Oct 8): only the staff member who made it, or a gala admin. p_id is the
-- check-in's id or the iPad's client_id. A guest goes back to expected and the seat to its earlier status;
-- an exception is removed. Logged with old and new values. Returns { status: 'undone', guest_id }.
create or replace function staff_undo_check_in(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager','check_in_volunteer']); c check_ins; g guests;
begin
  select * into c from check_ins where (id = p_id or client_id = p_id) and event_id = current_event_id() for update;
  if c.id is null then raise exception 'not_found: no check-in to undo'; end if;
  if me.role <> 'gala_admin' and coalesce(c.staff_id, '') <> me.id and not (c.staff_id is null and c.checked_in_by = me.name) then
    raise exception 'forbidden: only % or a gala admin can undo this check-in', c.checked_in_by;
  end if;
  delete from check_ins where id = c.id;
  if c.guest_id is not null then
    select * into g from guests where id = c.guest_id for update;
    update guests set attendance_status = 'expected' where id = g.id;
    update seats set status = coalesce(c.seat_status_before, 'badge_ready'), updated_at = now()
     where guest_id = g.id and status = 'checked_in';
    perform write_audit('staff', me.name, 'check_in', c.id, c.order_id, 'checkin.undone', 'checked_in', 'expected', false,
      format('Check-in of %s %s at %s by %s undone.', g.first_name, g.last_name,
             to_char(c.checked_in_at at time zone 'America/New_York', 'FMHH12:MI AM'), c.checked_in_by));
  else
    perform write_audit('staff', me.name, 'check_in', c.id, c.order_id, 'checkin.undone', 'checked_in', null, false,
      format('Exception check-in of %s (%s) at %s by %s undone.', c.arrival_name, c.type,
             to_char(c.checked_in_at at time zone 'America/New_York', 'FMHH12:MI AM'), c.checked_in_by));
  end if;
  return jsonb_build_object('status', 'undone', 'guest_id', c.guest_id);
end $$;

-- Check-ins the iPad made offline, sent when it is back online, oldest first.
-- p_items: [{ client_id, kind: 'guest' | 'exception', at, device,
--             guest_id, method: 'qr' | 'search'            (kind 'guest')
--             name, order_id, type, note }]                (kind 'exception': walk-ins and the like)
-- First arrival wins: a guest checked in twice (two doors, or one online and one offline) keeps the
-- earliest check-in; the other is written to the change log as a conflict, and the result says who was
-- first. Each item stands alone (one bad item doesn't stop the rest), and sending one again is safe.
-- Returns one result per item: { client_id, status: 'checked_in' | 'conflict' | 'already_synced' | 'error',
--   first_at, first_by, first_device (for a conflict), error }.
create or replace function staff_sync_check_ins(p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me staff_users := require_staff(array['gala_admin','relationship_manager','check_in_volunteer']);
  it jsonb; v_cid text; v_at timestamptz; v_dev text; v_method text; v_by text; g guests; c check_ins;
  v_res jsonb; v_out jsonb := '[]';
begin
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'invalid_input: items must be a list'; end if;
  if jsonb_array_length(p_items) > 1000 then raise exception 'invalid_input: at most 1000 check-ins per sync'; end if;
  -- The batch's guests are locked first, in one order (Gate 3 load test, Oct 17). Locked item by item, two iPads syncing
  -- the same guests in a different order could deadlock, and the iPad drops a refused check-in from its queue. Holding
  -- the locks first also makes a batch sent again while the first send is still running wait for it, then answer
  -- "already synced" rather than "conflict".
  perform 1 from guests where id in (select value ->> 'guest_id' from jsonb_array_elements(p_items)) order by id for update;
  for it in select value from jsonb_array_elements(p_items) loop
    v_cid := nullif(btrim(coalesce(it ->> 'client_id', '')), '');
    begin
      if v_cid is null or length(v_cid) > 100 then raise exception 'invalid_input: client_id is required'; end if;
      v_dev := nullif(left(btrim(coalesce(it ->> 'device', '')), 40), '');
      v_by := me.name || coalesce(' (' || v_dev || ')', '');
      v_at := least(coalesce(nullif(it ->> 'at', '')::timestamptz, now()), now());   -- the iPad's clock, never in the future
      -- ...nor more than a day old: an older time could claim "came first" over a real check-in and take it over.
      if v_at < now() - interval '24 hours' then raise exception 'invalid_input: check-in time is more than a day old'; end if;
      c := null;

      if exists (select 1 from check_ins where client_id = v_cid) then
        v_res := jsonb_build_object('client_id', v_cid, 'status', 'already_synced');

      elsif exists (select 1 from audit_log where action = 'checkin.conflict' and entity_id = v_cid) then
        -- A conflict already recorded; say again who was first.
        select * into c from check_ins where guest_id = it ->> 'guest_id' and event_id = current_event_id();
        v_res := jsonb_build_object('client_id', v_cid, 'status', 'conflict',
                                    'first_at', c.checked_in_at, 'first_by', c.checked_in_by, 'first_device', c.device);

      elsif coalesce(it ->> 'kind', 'guest') = 'exception' then
        if coalesce(btrim(it ->> 'name'), '') = '' or coalesce(btrim(it ->> 'type'), '') = '' then
          raise exception 'invalid_input: name and type are required';
        end if;
        perform require_gala_order(nullif(it ->> 'order_id', ''));
        insert into check_ins (id, event_id, order_id, arrival_name, method, type, checked_in_by, note, checked_in_at, client_id, device, staff_id)
        values (new_id('ci'), current_event_id(), nullif(it ->> 'order_id', ''), btrim(it ->> 'name'), 'exception', btrim(it ->> 'type'),
                me.name, coalesce(it ->> 'note', ''), v_at, v_cid, v_dev, me.id);
        perform write_audit('staff', me.name, 'check_in', v_cid, nullif(it ->> 'order_id', ''), 'checkin.exception', null, 'checked_in', false,
          format('%s checked in as exception: %s (offline, %s).', btrim(it ->> 'name'), btrim(it ->> 'type'), v_by));
        v_res := jsonb_build_object('client_id', v_cid, 'status', 'checked_in');

      else
        v_method := coalesce(it ->> 'method', 'search');
        if v_method not in ('qr', 'search') then raise exception 'invalid_input: method must be qr or search'; end if;
        select gg.* into g from guests gg join orders o on o.id = gg.order_id
         where gg.id = it ->> 'guest_id' and o.event_id = current_event_id() and o.status <> 'cancelled' for update of gg;
        if g.id is null then raise exception 'not_found: guest is not on this gala''s list'; end if;
        select * into c from check_ins where guest_id = g.id and event_id = current_event_id();

        if c.id is null then
          insert into check_ins (id, event_id, guest_id, order_id, method, type, checked_in_by, note, checked_in_at, client_id, device,
                                 staff_id, seat_status_before)
          values (new_id('ci'), current_event_id(), g.id, g.order_id, v_method, 'standard', me.name, '', v_at, v_cid, v_dev,
                  me.id, (select status from seats where guest_id = g.id and status <> 'cancelled' limit 1));
          update guests set attendance_status = 'checked_in' where id = g.id;
          update seats set status = 'checked_in', updated_at = now() where guest_id = g.id;
          perform write_audit('staff', me.name, 'check_in', v_cid, g.order_id, 'checkin.arrived', 'expected', 'checked_in', false,
            format('%s %s checked in (%s, offline, %s at %s).', g.first_name, g.last_name, v_method, v_by,
                   to_char(v_at at time zone 'America/New_York', 'FMHH12:MI AM')));
          v_res := jsonb_build_object('client_id', v_cid, 'status', 'checked_in');

        elsif c.checked_in_at <= v_at then
          -- Someone checked this guest in first; that check-in stands.
          perform write_audit('staff', me.name, 'check_in', v_cid, g.order_id, 'checkin.conflict', null, null, false,
            format('%s %s was already checked in at %s by %s; a second check-in at %s by %s was not counted.',
                   g.first_name, g.last_name, to_char(c.checked_in_at at time zone 'America/New_York', 'FMHH12:MI AM'),
                   c.checked_in_by || coalesce(' (' || c.device || ')', ''),
                   to_char(v_at at time zone 'America/New_York', 'FMHH12:MI AM'), v_by));
          v_res := jsonb_build_object('client_id', v_cid, 'status', 'conflict',
                                      'first_at', c.checked_in_at, 'first_by', c.checked_in_by, 'first_device', c.device);

        else
          -- This offline check-in came first: it becomes the check-in, and the one recorded earlier is the conflict.
          perform write_audit('staff', me.name, 'check_in', coalesce(c.client_id, c.id), g.order_id, 'checkin.conflict', null, null, false,
            format('%s %s was checked in at %s by %s (synced later); the check-in at %s by %s was the second and is not counted.',
                   g.first_name, g.last_name, to_char(v_at at time zone 'America/New_York', 'FMHH12:MI AM'), v_by,
                   to_char(c.checked_in_at at time zone 'America/New_York', 'FMHH12:MI AM'),
                   c.checked_in_by || coalesce(' (' || c.device || ')', '')));
          update check_ins set checked_in_at = v_at, checked_in_by = me.name, device = v_dev, method = v_method, client_id = v_cid,
                               staff_id = me.id
           where id = c.id;
          v_res := jsonb_build_object('client_id', v_cid, 'status', 'checked_in');
        end if;
      end if;
    exception
      -- The same check-in sent twice at once (a walk-in has no guest to lock): the first one counted.
      when unique_violation then v_res := jsonb_build_object('client_id', v_cid, 'status', 'already_synced');
      when others then v_res := jsonb_build_object('client_id', v_cid, 'status', 'error', 'error', sqlerrm);
    end;
    v_out := v_out || jsonb_build_array(v_res);
  end loop;
  return v_out;
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
-- Give Lively's "Payment Method" -> how the payment is recorded (Gate 1). Wallets go through Stripe as card payments,
-- so they're card, with the wallet named in method_detail; null: not recognized (gl_import records card and flags it).
-- The same rule as staff-app/src/store.ts paymentMethodOf, for demo mode.
create or replace function payment_method_detail(p_method text) returns text
language sql immutable set search_path = public as $$
  select case when p_method ~* 'apple' then 'Apple Pay' when p_method ~* 'google' then 'Google Pay'
              when p_method ~* 'paypal' then 'PayPal' when p_method ~* 'venmo' then 'Venmo'
              when p_method ~* 'daf|donor.?advised' then 'Donor-advised fund' end
$$;
create or replace function payment_method_of(p_method text) returns text
language sql immutable set search_path = public as $$
  select case when coalesce(p_method, '') ~* 'amex|american' then 'amex'
              when coalesce(p_method, '') ~* 'bank|ach' then 'givelively_ach'
              when coalesce(p_method, '') ~* 'card|visa|master|discover' or payment_method_detail(p_method) is not null then 'card' end
$$;

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
    -- The history keeps where the name came from, after staff or the sponsor edit it (hard rule 7).
    perform write_audit('system', 'Give Lively import', 'guest', v_id, p_order_id, 'guest.imported', null, 'submitted', true,
      format('%s added to seat %s from the Give Lively guest list.', v_display, st.slot_number));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

drop function if exists gl_import(jsonb, text);
create or replace function gl_import(p_rows jsonb, p_actor text, p_run_id text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb; p payments; o orders; t sponsorship_tiers; e gala_events; v_sp text; v_order text; v_pay text;
  v_method text; v_detail text; v_qty int; v_seats int; v_commit numeric; v_review text[]; v_name text; v_org text; v_key text;
  v_at timestamptz; v_original numeric; v_gross numeric; v_fee numeric; v_refunded numeric; v_text text;
  v_cancel boolean; v_changed boolean; v_named int; v_conflict text[]; f jsonb; v_page text; v_disputed boolean;
  v_created int := 0; v_updated int := 0; v_skipped int := 0; v_flagged int := 0; v_unknown int := 0;
  v_prefilled int := 0; v_reviews int := 0; v_zero int := 0; v_applied numeric;
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
    if coalesce(r ->> 'email', '') = '' or v_at is null then
      v_skipped := v_skipped + 1; continue;
    end if;
    v_key := coalesce(nullif(r ->> 'purchase_key', ''), purchase_key(r ->> 'email', v_at));
    -- A $0 or blank amount (Oct 12 audit: these were dropped with the already-imported rows). Give Lively has no comp
    -- tickets, so a $0 row may be a comp on a hidden page, a free RSVP, or a mistake: staff decide, with the buyer and
    -- guest list in front of them. Nothing is created; the same row uploaded again adds no second item.
    if coalesce(v_gross, 0) <= 0 then
      if add_import_review(p_run_id, v_key, null, 'zero_amount', jsonb_build_object(
           'buyer', nullif(trim(coalesce(r ->> 'first', '') || ' ' || coalesce(r ->> 'last', '')), ''), 'email', lower(btrim(r ->> 'email')),
           'tier_purchased', r ->> 'ticket_level', 'tickets', nullif(r ->> 'quantity', ''), 'guest_text', nullif(btrim(r ->> 'guest_text'), ''))) then
        v_reviews := v_reviews + 1;
      end if;
      v_zero := v_zero + 1; continue;
    end if;
    v_text := nullif(btrim(r ->> 'guest_text'), '');
    -- A dispute (chargeback) status from the sync or a report that has the column; blank, "none" or "false": no dispute.
    v_disputed := coalesce(btrim(r ->> 'dispute'), '') !~* '^(false|no|none|0|null|n/?a|not disputed)?$';
    v_cancel := coalesce((r ->> 'cancelled')::boolean, false) or coalesce((r ->> 'cancel_only')::boolean, false)
             -- The failure words match the sync's classify() and the import engine's CANCELLED_STATUS (test-audit-fixes checks all three).
             -- A partial refund keeps the order (spec case 19).
             or coalesce(r ->> 'status', '') ~* 'fail|declin|cancel|void|revers|return|^\s*(fully\s+)?refund(ed)?\s*$'
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
        v_changed := true;
      end if;
      if p.gross_amount is distinct from v_gross then
        update payments set original_amount = v_original, gross_amount = v_gross,
               net_amount = v_gross - transaction_fee_amount - refunded_amount, reconciliation_status = 'needs_review' where id = p.id;
        perform write_audit('system', p_actor, 'payment', p.id, p.order_id, 'payment.amount_updated',
          p.gross_amount::text, v_gross::text, false, format('Give Lively amount changed to %s.', money_fmt(v_gross)));
        v_changed := true;
      end if;
      -- A fee the upload didn't carry, now that the sync reports it: net follows (Gate 1).
      if p.transaction_fee_amount is null and v_fee is not null then
        update payments set transaction_fee_amount = v_fee, net_amount = gross_amount - v_fee - refunded_amount where id = p.id;
        perform write_audit('system', p_actor, 'payment', p.id, p.order_id, 'payment.fee_known', null, v_fee::text, false,
          format('Give Lively processor fee: %s.', money_fmt(v_fee)));
        v_changed := true;
      end if;
      -- A refund or amount change: paid or partly paid from everything received, checks and wires included.
      if v_changed and o.status in ('paid','partially_paid') then
        select sum(greatest(original_amount - refunded_amount, 0)) into v_applied from payments where order_id = o.id;   -- per payment, never below 0 (#170)
        update orders set status = case when v_applied + 0.005 >= commitment_amount then 'paid' else 'partially_paid' end,
               updated_at = now() where id = o.id;
      end if;
      if v_cancel and o.status <> 'cancelled' then
        update orders set status = 'cancelled', updated_at = now() where id = o.id;
        update seats set status = 'cancelled', updated_at = now() where order_id = o.id;
        -- An unsent guest-list link would hand the sponsor a link to a cancelled order.
        update email_log set status = 'cancelled' where order_id = o.id and status = 'queued';
        perform write_audit('system', p_actor, 'order', o.id, o.id, 'order.cancelled', o.status, 'cancelled', false,
          'Refunded or failed in Give Lively; seats cancelled.');
        if add_import_review(p_run_id, v_key, o.id, 'refund', jsonb_build_object('status', r ->> 'status', 'refunded', v_refunded)) then v_reviews := v_reviews + 1; end if;
        v_changed := true;
      end if;
      -- Disputed (a chargeback): a staff review, never a cancellation, since the dispute may still go AAFE's way (Gate 1).
      if v_disputed and add_import_review(p_run_id, v_key, o.id, 'disputed', jsonb_build_object('status', btrim(r ->> 'dispute'))) then
        v_reviews := v_reviews + 1;
        update payments set reconciliation_status = 'needs_review' where id = p.id;
        perform write_audit('system', p_actor, 'payment', p.id, o.id, 'payment.disputed', null, btrim(r ->> 'dispute'), false,
          format('Disputed in Give Lively (%s); nothing cancelled.', btrim(r ->> 'dispute')));
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
    -- A failed donation from the sync (cancel_only) only undoes a purchase imported earlier; it never creates one.
    if coalesce((r ->> 'cancel_only')::boolean, false) then v_skipped := v_skipped + 1; continue; end if;

    -- Package: the prepared tier, else this gala's tier mapping for the page it was bought on, else the longest tier
    -- name (before " — ") found in the Give Lively name. No match: staff review, nothing created until mapped.
    -- A purchase on one of the gala's other pages (Community Tickets) gets a level only from a mapping made for that
    -- page, on purpose: its "Ticket" must never land on the main page's $500 Ticket level by name.
    -- A retired level takes no new orders, whichever way the purchase arrives (CSV, sync or mapping).
    v_page := case when name_key(r ->> 'campaign') = any (select name_key(x) from unnest(e.givelively_other_pages) x)
                   then name_key(r ->> 'campaign') else '' end;
    t := null;
    if coalesce(r ->> 'tier_id', '') <> '' then
      select * into t from sponsorship_tiers where id = r ->> 'tier_id' and event_id = e.id and not retired;
    end if;
    if t.id is null then
      select st.* into t from tier_mappings m join sponsorship_tiers st on st.id = m.tier_id
       where m.event_id = e.id and m.page_key = v_page and m.name_key = name_key(r ->> 'ticket_level') and not st.retired;
    end if;
    if t.id is null and v_page = '' then
      select * into t from sponsorship_tiers
       where event_id = e.id and not retired and tier_category <> 'complimentary' and coalesce(r ->> 'ticket_level', '') <> ''
         and position(name_key(split_part(name, ' — ', 1)) in name_key(r ->> 'ticket_level')) > 0
       order by length(split_part(name, ' — ', 1)) desc limit 1;
    end if;
    if t.id is null then
      if add_import_review(p_run_id, v_key, null, 'unknown_tier', jsonb_build_object('tier_purchased', r ->> 'ticket_level')
           || case when v_page <> '' then jsonb_build_object('page', r ->> 'campaign') else '{}' end) then
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
    -- Committed at what was paid (Oct 15): Give Lively takes the whole amount at checkout, so a discounted ticket (a $250
    -- Community Ticket on a $500 level) is paid in full, not "partly paid" with a balance nobody owes.
    v_commit := case when t.contribution_amount > 0 then least(t.contribution_amount * v_qty, v_original) else v_original end;
    -- Seats: the export's Total Seats, else seats per tier × tickets. Advertising-only tiers get none.
    v_seats := case when t.included_seat_count = 0 then 0
                    else coalesce(nullif(r ->> 'seats', '')::int, t.included_seat_count * v_qty) end;

    v_method := payment_method_of(r ->> 'method');
    v_detail := payment_method_detail(r ->> 'method');
    if v_method is null then
      v_method := 'card';
      v_review := v_review || format('payment method "%s" not recognized', coalesce(r ->> 'method', ''));
    end if;
    -- No fee: AAFE's ticket export has no fee column, so the fee stays unknown (null), not $0, and net with it; the sync
    -- fills both in when it sees the same purchase. The JSON sync reports the fee, so one missing there is flagged.
    if v_fee is null and coalesce(r ->> 'txn', '') <> '' then v_review := v_review || 'Give Lively fee missing'::text; end if;

    -- Buyer -> sponsor: same email AND same last name. Same email, different last name is a shared
    -- inbox: a new sponsor so the order isn't lost, and a staff review. The contact's name must be the last
    -- name or end with it word for word, so "Ana García López" matches "García López" (Oct 12 audit: comparing
    -- only the last word made every repeat buyer with a two-word surname a new sponsor).
    v_name := trim(coalesce(r ->> 'first', '') || ' ' || coalesce(r ->> 'last', ''));
    v_org  := coalesce(nullif(trim(r ->> 'company'), ''), nullif(v_name, ''), r ->> 'email');
    select array_agg(id order by created_at) into v_conflict from sponsors
     where lower(btrim(primary_contact_email)) = lower(btrim(r ->> 'email'));
    select id into v_sp from sponsors
     where id = any (coalesce(v_conflict, '{}'))
       and (name_key(r ->> 'last') = '' or name_key(primary_contact_name) = name_key(r ->> 'last')
            or right(name_key(primary_contact_name), length(name_key(r ->> 'last')) + 1) = ' ' || name_key(r ->> 'last'))
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
                        logo_status, program_ad_status, givelively_order_ref, imported_guest_text, internal_notes, givelively_page)
    values (v_order, e.id, v_sp, t.id, 'givelively', v_commit,
            case when v_original - v_refunded + 0.005 >= v_commit then 'paid' else 'partially_paid' end, e.guest_list_deadline,
            case when 'logo' = any (t.required_materials) then 'pending' else 'not_required' end,
            case when exists (select 1 from unnest(t.required_materials) m where m like '%ad') then 'pending' else 'not_required' end,
            nullif(r ->> 'txn', ''), v_text,
            format('Imported from Give Lively (%s).', coalesce(nullif(r ->> 'campaign', ''), 'no campaign'))
              || case when v_commit < t.contribution_amount * v_qty
                      then format(' Discounted: paid %s, %s at the level''s price.', money_fmt(v_commit), money_fmt(t.contribution_amount * v_qty)) else '' end
              || case when cardinality(v_review) > 0 then ' CHECK: ' || array_to_string(v_review, '; ') || '.' else '' end,
            nullif(btrim(r ->> 'campaign'), ''));
    insert into payments (id, order_id, method, method_detail, processor, givelively_transaction_id, purchase_key, original_amount, covered_fee_amount,
                          gross_amount, transaction_fee_amount, refunded_amount, net_amount, received_at, recorded_by, reconciliation_status)
    values (v_pay, v_order, v_method, v_detail, 'stripe', nullif(r ->> 'txn', ''), v_key, v_original, coalesce(nullif(r ->> 'covered', '')::numeric, 0), v_gross,
            v_fee, v_refunded, coalesce(nullif(r ->> 'net', '')::numeric, v_gross - v_fee - v_refunded),
            v_at, 'givelively_sync', case when cardinality(v_review) > 0 then 'needs_review' else 'matched' end);
    if v_disputed and add_import_review(p_run_id, v_key, v_order, 'disputed', jsonb_build_object('status', btrim(r ->> 'dispute'))) then
      v_reviews := v_reviews + 1;
      update payments set reconciliation_status = 'needs_review' where id = v_pay;
    end if;
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
      perform write_audit('system', p_actor, 'order', v_order, v_order, 'order.cancelled', 'paid', 'cancelled', false,
        'Already refunded or failed in Give Lively when imported; seats cancelled.');
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
                            'unknown_tier', v_unknown, 'names_prefilled', v_prefilled, 'review_items', v_reviews, 'zero_amount', v_zero);
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

-- Tier mapping (spec section 3): staff link a Give Lively tier name to a tier, once per gala, for its main page or
-- (p_page) one of its other pages: "Ticket" on Community Tickets is its own mapping. Open unknown_tier items for
-- that name and page are resolved; staff re-run the upload. Changing a mapping doesn't rewrite orders already
-- imported (they keep their tier until staff change them).
drop function if exists public.staff_set_tier_mapping(text, text);
drop function if exists private.staff_set_tier_mapping(text, text);
create or replace function staff_set_tier_mapping(p_givelively_name text, p_tier_id text, p_page text default null) returns void
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin']); e gala_events; v_old text; v_page text := ''; v_lookback boolean;
begin
  if name_key(p_givelively_name) = '' then raise exception 'invalid_input: tier name is required'; end if;
  if not exists (select 1 from sponsorship_tiers where id = p_tier_id and event_id = current_event_id()) then raise exception 'not_found: tier'; end if;
  select * into e from gala_events where id = current_event_id();
  if name_key(p_page) not in ('', name_key(e.givelively_page_name)) then
    v_page := name_key(p_page);
    if not v_page = any (select name_key(x) from unnest(e.givelively_other_pages) x) then raise exception 'not_found: page'; end if;
  end if;
  select tier_id into v_old from tier_mappings where event_id = e.id and page_key = v_page and name_key = name_key(p_givelively_name);
  insert into tier_mappings (id, event_id, givelively_name, name_key, page_key, tier_id, created_by)
  values (new_id('tm'), e.id, btrim(p_givelively_name), name_key(p_givelively_name), v_page, p_tier_id, me.name)
  on conflict (event_id, page_key, name_key) do update set tier_id = excluded.tier_id, created_by = excluded.created_by, created_at = now();
  -- A purchase the sync held for this tier (its review has no upload run) would never come back: the sync only reads what's
  -- new since its last poll. So the next poll looks back over all purchases once, as adding a page does; re-reading
  -- imports nothing twice (Gate 1). A purchase held from an upload comes back with the next upload.
  select exists (select 1 from import_review where status = 'open' and reason = 'unknown_tier' and run_id is null
                   and name_key(details ->> 'tier_purchased') = name_key(p_givelively_name) and name_key(details ->> 'page') = v_page) into v_lookback;
  if v_lookback then update givelively_sync_state set cursor_ms = null where id = 1; end if;
  update import_review set status = 'resolved', resolution = 'mapped to ' || p_tier_id, resolved_by = me.name, resolved_at = now()
   where status = 'open' and reason = 'unknown_tier' and name_key(details ->> 'tier_purchased') = name_key(p_givelively_name)
     and name_key(details ->> 'page') = v_page;
  perform write_audit('staff', me.name, 'tier_mapping', name_key(p_givelively_name), null, 'tier_mapping.set', v_old, p_tier_id, false,
    format('Give Lively tier "%s"%s mapped to %s.%s', btrim(p_givelively_name),
           case when v_page <> '' then format(' on "%s"', btrim(p_page)) else '' end, p_tier_id,
           case when v_lookback then ' The next sync looks back over all purchases for the ones it held.' else '' end));
end $$;

-- The Give Lively pages of the gala being run now, for the sync (service role only): its main page and any others.
-- The same rule as every other function, current_event_id(): next year's gala in planning doesn't take the sync over
-- (it read "the newest open year" until Oct 15, the rule #137 removed from the staff app).
drop function if exists sync_gala_page();
create or replace function sync_gala_pages() returns text[]
language sql stable security definer set search_path = public as $$
  select array_remove(array[givelively_page_name], null) || givelively_other_pages from gala_events where id = current_event_id()
$$;

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

-- Another Give Lively page for this gala (Oct 15, Gate 1b): AAFE sells discounted tickets to partners on a private
-- "Community Tickets" page. Its purchases import once staff link each of its ticket types to a level for that page.
-- Adding a page makes the sync look back once: it asks Give Lively only for what changed since its last run, so
-- purchases made before the page was added would never arrive. Re-importing them is safe: each purchase is matched
-- by its purchase key or Give Lively transaction ID.
create or replace function staff_add_gala_page(p_page_name text) returns void
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin']); e gala_events; v text := btrim(coalesce(p_page_name, ''));
begin
  if v = '' then raise exception 'invalid_input: page name is required'; end if;
  select * into e from gala_events where id = current_event_id();
  if name_key(v) = name_key(e.givelively_page_name) or name_key(v) = any (select name_key(x) from unnest(e.givelively_other_pages) x) then
    raise exception 'invalid_input: already one of this gala''s pages';
  end if;
  update gala_events set givelively_other_pages = givelively_other_pages || v where id = e.id;
  update givelively_sync_state set cursor_ms = null where id = 1;
  perform write_audit('staff', me.name, 'gala_event', e.id, null, 'gala.page_added', null, v, false,
    format('Give Lively page "%s" added; the next sync looks back over all purchases.', v));
end $$;

-- Take a page off the gala. Purchases already imported from it stay; uploads and the sync skip it from now on.
create or replace function staff_remove_gala_page(p_page_name text) returns void
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin']); e gala_events; v_left text[];
begin
  select * into e from gala_events where id = current_event_id();
  v_left := array(select p from unnest(e.givelively_other_pages) with ordinality u(p, n) where name_key(p) <> name_key(p_page_name) order by n);
  if cardinality(v_left) = cardinality(e.givelively_other_pages) then raise exception 'not_found: page'; end if;
  update gala_events set givelively_other_pages = v_left where id = e.id;
  perform write_audit('staff', me.name, 'gala_event', e.id, null, 'gala.page_removed', btrim(p_page_name), null, false,
    format('Give Lively page "%s" removed; purchases already imported from it stay.', btrim(p_page_name)));
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
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); m email_log; v_deadline date;
begin
  select * into m from email_log where id = p_email_id and status = 'queued' and approved_at is null for update;
  if m.id is null then raise exception 'not_found: no draft with that id'; end if;
  -- A guest-list link works through the end of the order's deadline day (email_mark_sent): after that day it would
  -- arrive already expired. Staff extend that order's deadline first (staff_set_order_deadline).
  if m.template in ('portal_link', 'guest_list_reminder') then
    select coalesce(o.guest_list_deadline, e.guest_list_deadline, e.event_date) into v_deadline
      from orders o join gala_events e on e.id = o.event_id where o.id = m.order_id;
    if v_deadline < (now() at time zone 'America/New_York')::date then
      raise exception 'invalid_input: this order''s guest-list deadline (%) has passed, so the link would arrive expired; extend the order''s deadline first',
        to_char(v_deadline, 'Mon FMDD, YYYY');
    end if;
  end if;
  update email_log set approved_by = me.name, approved_at = now() where id = m.id returning * into m;
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
  update email_log set status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = null, claimed_at = null
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
  update email_log set attempts = attempts + 1, last_error = left(p_error, 1000), claimed_at = null where id = p_email_id
$$;

-- The send-emails worker claims its batch before sending anything. The every-minute schedule and a
-- staff member's "send now" can overlap; without a claim both runs would send the same email, and
-- each would mint its own link, so the second run's email_mark_sent would replace the link the
-- sponsor actually received. SKIP LOCKED hands each email to exactly one run. A claim older than
-- 10 minutes belongs to a run that died mid-send, so the email can be claimed again.
create or replace function email_claim(p_limit int default 25) returns setof email_log
language sql security definer set search_path = public as $$
  update email_log set claimed_at = now()
   where id in (select id from email_log
                 where status = 'queued' and approved_at is not null and attempts < 5
                   and (claimed_at is null or claimed_at < now() - interval '10 minutes')
                 order by id limit greatest(coalesce(p_limit, 25), 0)
                 for update skip locked)
  returning *
$$;

-- ---------------------------------------------------------------------
-- 7b. SPONSOR PIPELINE  (AAFE's prospect tracker; table sponsor_prospects)
--     Staff move prospects through the early stages. An order moves its prospect on by itself:
--     a pledge or purchase to closed won, and the first payment to payment received.
-- ---------------------------------------------------------------------

create or replace function pipeline_stage_label(p_stage text) returns text
language sql immutable set search_path = public as $$
  select case p_stage when 'not_started' then 'Not started' when 'reached_out' then 'Reached out'
    when 'in_conversation' then 'In conversation' when 'closed_won' then 'Closed won'
    when 'payment_received' then 'Payment received' when 'lost' then 'Lost' end
$$;

-- Links an order to its prospect and moves the stage on: money received → payment received; a pledge,
-- invoice or purchase → closed won (only forward, or back from lost). Logs any stage change.
create or replace function pipeline_apply_order(p_prospect_id text, o orders, p_actor_type text, p_actor text)
returns void language plpgsql security definer set search_path = public as $$
declare p sponsor_prospects; v_to text; v_org text;
begin
  select * into p from sponsor_prospects where id = p_prospect_id for update;
  if p.id is null or (p.order_id is not null and p.order_id <> o.id) then return; end if;
  v_to := case
    -- Refunded or failed in Give Lively, or cancelled by staff (Oct 12 audit: it stayed at payment received and
    -- counted its ask in the forecast at 100%).
    when o.status = 'cancelled' and p.stage in ('closed_won', 'payment_received') then 'lost'
    when o.status in ('paid', 'partially_paid') then 'payment_received'
    when o.status in ('pledged', 'invoice_sent') and p.stage in ('not_started', 'reached_out', 'in_conversation', 'lost') then 'closed_won'
    else p.stage end;
  update sponsor_prospects set order_id = o.id, stage = v_to, updated_at = now(),
         stage_changed_at = case when v_to <> p.stage then now() else stage_changed_at end
   where id = p.id;
  if v_to <> p.stage then
    select organization_name into v_org from sponsors where id = p.sponsor_id;
    perform write_audit(p_actor_type, p_actor, 'prospect', p.id, o.id, 'prospect.stage', p.stage, v_to, false,
      format('%s: %s → %s (%s).', v_org, pipeline_stage_label(p.stage), pipeline_stage_label(v_to),
             case when v_to = 'payment_received' then 'payment recorded' when v_to = 'lost' then 'refunded or cancelled'
                  else 'pledge or purchase recorded' end));
  end if;
end $$;

-- Every order passes through here: it moves its sponsor's prospect on. A sponsorship bought or pledged
-- with no prospect yet (a Give Lively purchase, say) gets one, so the board counts it; a ticket only
-- counts when its buyer is already a prospect.
create or replace function orders_pipeline() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id text; v_cat text;
begin
  -- Sponsorships and tickets count toward a prospect; ads (an add-on) and comps don't.
  select tier_category into v_cat from sponsorship_tiers where id = new.tier_id;
  if new.status = 'comp' or v_cat not in ('sponsorship', 'ticket') then return new; end if;
  -- A cancelled order only moves the prospect it's linked to (to lost); it never creates or claims one.
  if new.status = 'cancelled' then
    select id into v_id from sponsor_prospects where order_id = new.id;
    if v_id is not null then perform pipeline_apply_order(v_id, new, 'system', 'Pipeline'); end if;
    return new;
  end if;
  -- The prospect this order is already linked to, else this sponsor's prospect.
  select id into v_id from sponsor_prospects where order_id = new.id;
  if v_id is null then
    select id into v_id from sponsor_prospects where event_id = new.event_id and sponsor_id = new.sponsor_id;
  end if;
  -- A pledge or purchase recorded under a new sponsor record (staff_add_pledge and the Give Lively import
  -- create one) belongs to the prospect with the same organization name, if it has no order yet.
  if v_id is null then
    select p.id into v_id from sponsor_prospects p join sponsors s on s.id = p.sponsor_id
     where p.event_id = new.event_id and p.order_id is null
       and lower(btrim(s.organization_name)) = (select lower(btrim(organization_name)) from sponsors where id = new.sponsor_id)
     order by p.created_at limit 1;
  end if;
  if v_id is null then
    if v_cat <> 'sponsorship' then return new; end if;
    v_id := new_id('pr');
    insert into sponsor_prospects (id, event_id, sponsor_id, stage, ask_amount, ask_tier_id)
    values (v_id, new.event_id, new.sponsor_id, 'not_started', new.commitment_amount, new.tier_id);
  end if;
  perform pipeline_apply_order(v_id, new, 'system', 'Pipeline');
  return new;
end $$;
drop trigger if exists orders_pipeline on orders;
create trigger orders_pipeline after insert or update of status, sponsor_id on orders for each row execute function orders_pipeline();

-- Sponsorship orders already on this gala's list join the pipeline once (backend.sql re-runs are safe).
do $$
declare o orders;
begin
  for o in select ord.* from orders ord join sponsorship_tiers t on t.id = ord.tier_id
            where ord.event_id = current_event_id() and t.tier_category = 'sponsorship' and ord.status not in ('cancelled', 'comp')
              and not exists (select 1 from sponsor_prospects p where p.event_id = ord.event_id and p.sponsor_id = ord.sponsor_id)
  loop
    update orders set status = status where id = o.id;   -- fires orders_pipeline
  end loop;
end $$;

-- The pipeline board: totals per stage against the goal, and every prospect with its ask, commitment,
-- money received, and the last two galas' giving. No emails or phone numbers.
create or replace function staff_pipeline() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e gala_events; v jsonb;
begin
  perform require_staff(array['gala_admin','relationship_manager']);
  select * into e from gala_events where id = current_event_id();
  with st(ord, stage, probability) as (values (1, 'not_started', 0.0), (2, 'reached_out', 0.1), (3, 'in_conversation', 0.5),
                                               (4, 'closed_won', 0.9), (5, 'payment_received', 1.0), (6, 'lost', 0.0)),
  p as (
    select sp.*, s.organization_name, s.primary_contact_name, rm.name rm_name, fu.name fu_name, st.probability, st.ord,
           o.commitment_amount commitment, t.name tier_name, ta.name ask_tier_name,
           -- Per payment, never below 0: a full Give Lively refund returns the donor-covered fee too.
           coalesce((select sum(greatest(pay.original_amount - pay.refunded_amount, 0)) from payments pay where pay.order_id = o.id), 0) received,
           (select coalesce(jsonb_agg(jsonb_build_object('year', ge.year, 'given',
                     coalesce((select sum(greatest(pay.original_amount - pay.refunded_amount, 0)) from orders oo join payments pay on pay.order_id = oo.id
                                where oo.sponsor_id = sp.sponsor_id and oo.event_id = ge.id and oo.status <> 'cancelled'), 0))
                     order by ge.year desc), '[]')
              from gala_events ge where ge.year in (e.year - 1, e.year - 2)) prior_years
      from sponsor_prospects sp join st on st.stage = sp.stage join sponsors s on s.id = sp.sponsor_id
      left join staff_users rm on rm.id = s.relationship_owner_id
      left join staff_users fu on fu.id = sp.follow_up_owner_id
      left join orders o on o.id = sp.order_id and o.status <> 'cancelled'
      left join sponsorship_tiers t on t.id = o.tier_id
      left join sponsorship_tiers ta on ta.id = sp.ask_tier_id
     where sp.event_id = e.id)
  select jsonb_build_object(
    'event_id', e.id, 'event_name', e.name, 'goal', e.sponsorship_goal,
    'totals', (select jsonb_build_object(
        'committed', coalesce(sum(commitment) filter (where stage in ('closed_won', 'payment_received')), 0),
        'received', coalesce(sum(received), 0),
        -- What the pipeline is likely to bring in: each prospect's commitment (or ask) times its stage's likelihood.
        'weighted', coalesce(round(sum(probability * coalesce(commitment, ask_amount, 0)), 2), 0),
        'open_ask', coalesce(sum(ask_amount) filter (where stage in ('not_started', 'reached_out', 'in_conversation')), 0),
        'prospects', count(*)) from p),
    'stages', (select jsonb_agg(x order by x.ord) from (
        select st.ord, st.stage, pipeline_stage_label(st.stage) label, st.probability, count(p.id) count,
               coalesce(sum(p.ask_amount), 0) ask, coalesce(sum(p.commitment), 0) committed, coalesce(sum(p.received), 0) received
          from st left join p on p.stage = st.stage group by st.ord, st.stage, st.probability) x),
    'prospects', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'sponsor_id', sponsor_id, 'organization', organization_name, 'contact', primary_contact_name,
        'relationship_manager', rm_name, 'follow_up', fu_name, 'sector', sector, 'stage', stage,
        'stage_label', pipeline_stage_label(stage), 'probability', probability, 'stage_changed_at', stage_changed_at,
        'ask', ask_amount, 'ask_tier', ask_tier_name, 'order_id', order_id, 'tier', tier_name, 'commitment', commitment,
        'received', received, 'balance', greatest(coalesce(commitment, 0) - received, 0), 'prior_years', prior_years, 'notes', notes)
        order by ord, organization_name) from p), '[]'))
  into v;
  return v;
end $$;

-- Add a prospect, or edit one. p: { id? (edit), sponsor_id? or organization + contact_name (+ contact_email)
-- for a new sponsor, sector, ask_amount, ask_tier_id, follow_up_owner_id, notes, order_id? (link a
-- pledge or purchase made under another sponsor record) }. Returns the prospect id.
create or replace function staff_save_prospect(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  me staff_users := require_staff(array['gala_admin','relationship_manager']);
  fields text[] := array['sector','ask_amount','ask_tier_id','follow_up_owner_id','notes'];
  old sponsor_prospects; n sponsor_prospects; v_sp text; v_org text; v_changed text[]; o orders;
begin
  p := coalesce(p, '{}');
  if p ? 'sector' and nullif(p ->> 'sector', '') is not null
     and p ->> 'sector' not in ('board','community','corporate','foundation','individual','small_business') then
    raise exception 'invalid_input: sector must be board, community, corporate, foundation, individual or small_business';
  end if;
  if nullif(p ->> 'ask_amount', '') is not null and (p ->> 'ask_amount')::numeric < 0 then raise exception 'invalid_input: the ask cannot be negative'; end if;
  if nullif(p ->> 'ask_tier_id', '') is not null and not exists (select 1 from sponsorship_tiers where id = p ->> 'ask_tier_id' and event_id = current_event_id()) then
    raise exception 'not_found: tier';
  end if;
  if nullif(p ->> 'follow_up_owner_id', '') is not null and not exists (select 1 from staff_users where id = p ->> 'follow_up_owner_id') then
    raise exception 'not_found: staff member';
  end if;

  if nullif(p ->> 'id', '') is null then
    v_sp := nullif(p ->> 'sponsor_id', '');
    if v_sp is null then
      v_org := btrim(coalesce(p ->> 'organization', ''));
      if v_org = '' or btrim(coalesce(p ->> 'contact_name', '')) = '' then
        raise exception 'invalid_input: organization and contact name are required';
      end if;
      select id into v_sp from sponsors where lower(btrim(organization_name)) = lower(v_org) limit 1;
      if v_sp is not null then   -- named as staff will find them in the list
        raise exception 'invalid_input: % is already a sponsor: choose them from the existing sponsors instead', (select organization_name from sponsors where id = v_sp);
      end if;
      v_sp := new_id('sp');
      insert into sponsors (id, organization_name, primary_contact_name, primary_contact_email, phone, relationship_owner_id)
      values (v_sp, v_org, btrim(p ->> 'contact_name'), btrim(coalesce(p ->> 'contact_email', '')), '', me.id);
    elsif not exists (select 1 from sponsors where id = v_sp) then
      raise exception 'not_found: sponsor';
    end if;
    if exists (select 1 from sponsor_prospects where event_id = current_event_id() and sponsor_id = v_sp) then
      raise exception 'invalid_input: this sponsor is already in this gala''s pipeline';
    end if;
    n.id := new_id('pr');
    insert into sponsor_prospects (id, event_id, sponsor_id, sector, ask_amount, ask_tier_id, follow_up_owner_id, notes)
    values (n.id, current_event_id(), v_sp, nullif(p ->> 'sector', ''), nullif(p ->> 'ask_amount', '')::numeric,
            nullif(p ->> 'ask_tier_id', ''), nullif(p ->> 'follow_up_owner_id', ''), nullif(btrim(coalesce(p ->> 'notes', '')), ''));
    select organization_name into v_org from sponsors where id = v_sp;
    perform write_audit('staff', me.name, 'prospect', n.id, null, 'prospect.created', null, 'not_started', false,
      format('%s added to the pipeline%s.', v_org,
             case when nullif(p ->> 'ask_amount', '') is not null then ', ask ' || money_fmt((p ->> 'ask_amount')::numeric) else '' end));
  else
    select * into old from sponsor_prospects where id = p ->> 'id' and event_id = current_event_id() for update;
    if old.id is null then raise exception 'not_found'; end if;
    n := jsonb_populate_record(old, (select coalesce(jsonb_object_agg(key, case when value = '""'::jsonb then 'null'::jsonb else value end), '{}')
                                       from jsonb_each(p) where key = any (fields)));
    select coalesce(array_agg(k), '{}') into v_changed from unnest(fields) k where to_jsonb(n) -> k is distinct from to_jsonb(old) -> k;
    if cardinality(v_changed) > 0 then
      update sponsor_prospects set sector = n.sector, ask_amount = n.ask_amount, ask_tier_id = n.ask_tier_id,
             follow_up_owner_id = n.follow_up_owner_id, notes = n.notes, updated_at = now()
       where id = old.id;
      select organization_name into v_org from sponsors where id = old.sponsor_id;
      perform write_audit('staff', me.name, 'prospect', old.id, old.order_id, 'prospect.updated', null, null, false,
        format('%s: %s edited.', v_org, array_to_string(v_changed, ', ')), audit_changes(to_jsonb(old), to_jsonb(n), v_changed));
    end if;
  end if;

  -- Link a pledge or purchase recorded under another sponsor record.
  if nullif(p ->> 'order_id', '') is not null then
    select * into o from orders where id = p ->> 'order_id' and event_id = current_event_id();
    if o.id is null then raise exception 'not_found: order'; end if;
    if exists (select 1 from sponsor_prospects where order_id = o.id and id <> n.id) then
      raise exception 'invalid_input: that order belongs to another prospect';
    end if;
    select * into old from sponsor_prospects where id = n.id;
    if old.order_id is not null and old.order_id <> o.id then raise exception 'invalid_input: this prospect already has an order'; end if;
    if old.order_id is null then
      update sponsor_prospects set order_id = o.id, updated_at = now() where id = n.id;
      select organization_name into v_org from sponsors where id = old.sponsor_id;
      perform write_audit('staff', me.name, 'prospect', n.id, o.id, 'prospect.order_linked', null, null, false,
        format('%s: order %s linked.', v_org, o.id));
      perform pipeline_apply_order(n.id, o, 'staff', me.name);
    end if;
  end if;
  return n.id;
end $$;

-- Move a prospect to a stage. Payment received comes from recording a payment (staff_record_payment or
-- the Give Lively import), and a prospect that has paid stays there.
create or replace function staff_set_prospect_stage(p_id text, p_stage text) returns void
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); p sponsor_prospects; v_paid boolean; v_org text;
begin
  if p_stage is null or pipeline_stage_label(p_stage) is null then
    raise exception 'invalid_input: stage must be not_started, reached_out, in_conversation, closed_won, payment_received or lost';
  end if;
  select * into p from sponsor_prospects where id = p_id and event_id = current_event_id() for update;
  if p.id is null then raise exception 'not_found'; end if;
  if p.stage = p_stage then return; end if;
  v_paid := exists (select 1 from payments where order_id = p.order_id and original_amount - refunded_amount > 0);
  if p_stage = 'payment_received' and not v_paid then raise exception 'invalid_transition: record the payment first'; end if;
  if v_paid and p_stage <> 'payment_received' then raise exception 'invalid_transition: this sponsor has paid; their stage stays payment received'; end if;
  update sponsor_prospects set stage = p_stage, stage_changed_at = now(), updated_at = now() where id = p.id;
  select organization_name into v_org from sponsors where id = p.sponsor_id;
  perform write_audit('staff', me.name, 'prospect', p.id, p.order_id, 'prospect.stage', p.stage, p_stage, false,
    format('%s: %s → %s.', v_org, pipeline_stage_label(p.stage), pipeline_stage_label(p_stage)));
end $$;

-- The board's goal for the current gala (gala admins).
create or replace function staff_set_sponsorship_goal(p_amount numeric) returns void
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin']); v_old numeric;
begin
  if p_amount is not null and p_amount < 0 then raise exception 'invalid_input: the goal cannot be negative'; end if;
  select sponsorship_goal into v_old from gala_events where id = current_event_id();
  if v_old is not distinct from p_amount then return; end if;
  update gala_events set sponsorship_goal = p_amount where id = current_event_id();
  perform write_audit('staff', me.name, 'gala_event', current_event_id(), null, 'gala.goal_set', v_old::text, p_amount::text, false,
    format('Sponsorship goal set to %s.', coalesce(money_fmt(p_amount), 'none')));
end $$;

-- ---------------------------------------------------------------------
-- 7c. GALA SETTINGS
-- ---------------------------------------------------------------------

-- Sponsor-facing arrivals (gala admins). Switching on needs a note recording AAFE's privacy approval
-- (who and when); switching off needs nothing. Both are logged.
create or replace function staff_set_sponsor_arrivals(p_on boolean, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin']); e gala_events; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_on is null then raise exception 'invalid_input: on or off'; end if;
  if p_on and v_note is null then
    raise exception 'invalid_input: record AAFE''s privacy approval (who and when) to switch arrivals on';
  end if;
  select * into e from gala_events where id = current_event_id() for update;
  if e.sponsor_arrivals_visible = p_on then return; end if;
  update gala_events set sponsor_arrivals_visible = p_on, sponsor_arrivals_note = case when p_on then v_note else sponsor_arrivals_note end
   where id = e.id;
  perform write_audit('staff', me.name, 'gala_event', e.id, null, 'gala.sponsor_arrivals', e.sponsor_arrivals_visible::text, p_on::text, false,
    case when p_on then format('Sponsors can now see which of their guests have arrived (approval: %s).', v_note)
         else 'Sponsors can no longer see which of their guests have arrived.' end);
end $$;

-- Gala information page (gala admins): name, date, times, venue, dress code and the two deadlines.
-- Only these fields; status, year and the synthetic flag stay out of reach. Logged with each change.
create or replace function staff_update_gala_event(p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  me staff_users := require_staff(array['gala_admin']);
  allowed text[] := array['name','event_date','doors_time','program_time','venue_name','venue_address','dress_code',
                          'guest_list_deadline','program_ad_deadline'];
  e gala_events; n gala_events; v_patch jsonb; v_changes jsonb; v_n int;
begin
  select * into e from gala_events where id = current_event_id() for update;
  if e.id is null then raise exception 'not_found'; end if;
  select coalesce(jsonb_object_agg(key, case when jsonb_typeof(value) = 'string' and trim(value #>> '{}') = '' then 'null'::jsonb else value end), '{}')
    into v_patch from jsonb_each(coalesce(p_patch, '{}')) where key = any (allowed);
  n := jsonb_populate_record(e, v_patch);
  if coalesce(trim(n.name), '') = '' or n.event_date is null then
    raise exception 'invalid_input: the gala needs a name and a date';
  end if;
  v_changes := audit_changes(to_jsonb(e), to_jsonb(n), allowed);
  if v_changes is null then return; end if;
  update gala_events set name = n.name, event_date = n.event_date, doors_time = n.doors_time, program_time = n.program_time,
         venue_name = n.venue_name, venue_address = n.venue_address, dress_code = n.dress_code,
         guest_list_deadline = n.guest_list_deadline, program_ad_deadline = n.program_ad_deadline
   where id = e.id;
  perform write_audit('staff', me.name, 'gala_event', e.id, null, 'event.updated', null, null, false,
    'Gala information updated.', v_changes);

  -- What was already sent takes its dates when it's created, so move it with the gala (hard rule 6).
  -- A new gala date: QR e-tickets now expire the morning after the new date.
  if n.event_date is distinct from e.event_date then
    with moved as (
      update seats s set qr_token_expires_at = qr_expiry(e.id), updated_at = now()
        from orders o where o.id = s.order_id and o.event_id = e.id and s.qr_token_hash is not null and s.status <> 'cancelled'
      returning s.id)
    select count(*) into v_n from moved;
    if v_n > 0 then
      perform write_audit('staff', me.name, 'gala_event', e.id, null, 'event.qr_expiry_moved', null, null, false,
        format('%s QR e-tickets now expire after the new gala date, %s.', v_n, to_char(n.event_date, 'FMMonth FMDD, YYYY')));
    end if;
  end if;
  -- A new guest-list deadline: orders that took the gala's deadline follow it (a deadline set for one order stays).
  if n.guest_list_deadline is distinct from e.guest_list_deadline then
    with moved as (
      update orders set guest_list_deadline = n.guest_list_deadline, updated_at = now()
       where event_id = e.id and guest_list_deadline is not distinct from e.guest_list_deadline
      returning id)
    select count(*) into v_n from moved;
    if v_n > 0 then
      perform write_audit('staff', me.name, 'gala_event', e.id, null, 'event.deadline_moved', null, null, false,
        format('%s sponsors'' guest-list deadlines moved to %s.', v_n, coalesce(to_char(n.guest_list_deadline, 'FMMonth FMDD, YYYY'), 'no deadline')));
    end if;
  end if;
  -- Sponsor links expire after the order's deadline, else the gala's, else the gala date, as when the link was sent
  -- (email_mark_sent). Recomputed for every link, so orders without a deadline of their own move too.
  if n.guest_list_deadline is distinct from e.guest_list_deadline or n.event_date is distinct from e.event_date then
    with moved as (
      update orders set portal_token_expires_at = (coalesce(guest_list_deadline, n.guest_list_deadline, n.event_date) + 1)::timestamp at time zone 'America/New_York',
             updated_at = now()
       where event_id = e.id and portal_token is not null
         and portal_token_expires_at is distinct from (coalesce(guest_list_deadline, n.guest_list_deadline, n.event_date) + 1)::timestamp at time zone 'America/New_York'
      returning id)
    select count(*) into v_n from moved;
    if v_n > 0 then
      perform write_audit('staff', me.name, 'gala_event', e.id, null, 'event.links_moved', null, null, false,
        format('%s sponsor links now expire after the new deadline.', v_n));
    end if;
  end if;
end $$;

-- Sponsors page: a sponsor's logo or program ad status (pending / received / approved / not required).
create or replace function staff_set_material_status(p_order_id text, p_material text, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); o orders; v_old text;
begin
  -- `coalesce(... , false)`: a missing value must fail the check, not slip through it (NULL is neither in nor not in).
  if not coalesce(p_material in ('logo','program_ad'), false) then raise exception 'invalid_input: material must be logo or program_ad'; end if;
  if not coalesce(p_status in ('not_required','pending','received','approved'), false) then raise exception 'invalid_input: unknown status'; end if;
  select * into o from orders where id = p_order_id and event_id = current_event_id() for update;
  if o.id is null then raise exception 'not_found'; end if;
  v_old := case when p_material = 'logo' then o.logo_status else o.program_ad_status end;
  if v_old = p_status then return; end if;
  if p_material = 'logo' then update orders set logo_status = p_status, updated_at = now() where id = o.id;
  else update orders set program_ad_status = p_status, updated_at = now() where id = o.id; end if;
  perform write_audit('staff', me.name, 'order', o.id, o.id, 'materials.updated', v_old, p_status, false,
    format('%s marked %s.', case when p_material = 'logo' then 'Logo' else 'Program ad' end, replace(p_status, '_', ' ')));
end $$;

-- One order's guest-list deadline (gala admins): a sponsor who bought after the gala's deadline, or needs more time.
-- A link already sent moves with it: it works through the end of the new deadline day, New York time.
create or replace function staff_set_order_deadline(p_order_id text, p_deadline date) returns void
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin']); o orders; v_gala date;
begin
  if p_deadline is null then raise exception 'invalid_input: a deadline is required'; end if;
  select * into o from orders where id = p_order_id and event_id = current_event_id() for update;
  if o.id is null then raise exception 'not_found: order'; end if;
  select event_date into v_gala from gala_events where id = o.event_id;
  if p_deadline > v_gala then raise exception 'invalid_input: the deadline can''t be after the gala (%)', to_char(v_gala, 'Mon FMDD, YYYY'); end if;
  update orders set guest_list_deadline = p_deadline, updated_at = now(),
         portal_token_expires_at = case when portal_token is not null
                                        then (p_deadline + 1)::timestamp at time zone 'America/New_York' else portal_token_expires_at end
   where id = o.id;
  perform write_audit('staff', me.name, 'order', o.id, o.id, 'order.deadline_changed', o.guest_list_deadline::text, p_deadline::text, true,
    format('Guest-list deadline for this order moved to %s.', to_char(p_deadline, 'Mon FMDD, YYYY')));
end $$;

-- ---------------------------------------------------------------------
-- 7d. SPONSORSHIP LEVELS  (one list per gala, decided Oct 14; gala admins)
-- ---------------------------------------------------------------------

-- This gala's complimentary level, for comp guests. A new gala without one gets it on the first comp.
create or replace function comp_level() returns text
language plpgsql security definer set search_path = public as $$
declare e gala_events; v text;
begin
  select * into e from gala_events where id = current_event_id();
  select id into v from sponsorship_tiers where event_id = e.id and tier_category = 'complimentary' order by sort_order limit 1;
  if v is null then
    v := 'comp-' || e.year;
    insert into sponsorship_tiers (id, event_id, sort_order, name, contribution_amount, included_seat_count, tier_category, required_materials)
    values (v, e.id, 999, 'Complimentary — Relationship Guests', 0, 0, 'complimentary', '{}');
  end if;
  return v;
end $$;

-- Add or edit a level of a gala that isn't closed. p: { event_id? (default: the current gala), id? (edit), name, contribution_amount, included_seat_count, tier_category,
-- guaranteed_seating, required_materials[] }. A level already bought keeps its orders' amounts and guests; a new
-- guest count applies to pledges and purchases made after the change. Logged with old and new values.
create or replace function staff_save_level(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  me staff_users := require_staff(array['gala_admin']);
  e gala_events; old sponsorship_tiers; v_id text; v_name text := btrim(coalesce(p ->> 'name', ''));
  v_amount numeric := nullif(p ->> 'contribution_amount', '')::numeric; v_guests int := nullif(p ->> 'included_seat_count', '')::int;
  v_cat text := coalesce(nullif(p ->> 'tier_category', ''), 'sponsorship'); v_seated boolean := coalesce((p ->> 'guaranteed_seating')::boolean, false);
  v_mats text[] := coalesce(array(select jsonb_array_elements_text(p -> 'required_materials')), '{}');
  new_row sponsorship_tiers; v_changes jsonb;
begin
  -- Any gala not closed: next year's levels can be set up while this year's gala is still running.
  select * into e from gala_events where id = coalesce(nullif(p ->> 'event_id', ''), current_event_id()) and status <> 'closed';
  if e.id is null then raise exception 'not_found: no open gala with that id'; end if;
  if v_name = '' then raise exception 'invalid_input: the level needs a name'; end if;
  if v_amount is null or v_amount < 0 then raise exception 'invalid_input: the amount must be 0 or more'; end if;
  if v_guests is null or v_guests < 0 or v_guests > 500 then raise exception 'invalid_input: guests included must be between 0 and 500'; end if;
  if v_cat not in ('sponsorship','ticket','advertising_only','complimentary') then raise exception 'invalid_input: unknown kind of level'; end if;
  if exists (select 1 from sponsorship_tiers where event_id = e.id and lower(btrim(name)) = lower(v_name) and id is distinct from nullif(p ->> 'id', '')) then
    raise exception 'invalid_input: this gala already has a level called %', v_name;
  end if;

  if nullif(p ->> 'id', '') is null then
    v_id := 'lv-' || e.year || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
    insert into sponsorship_tiers (id, event_id, sort_order, name, contribution_amount, included_seat_count, tier_category, guaranteed_seating, required_materials)
    values (v_id, e.id, coalesce((select max(sort_order) from sponsorship_tiers where event_id = e.id), 0) + 1,
            v_name, v_amount, v_guests, v_cat, v_seated, v_mats)
    returning * into new_row;
    perform write_audit('staff', me.name, 'sponsorship_level', v_id, null, 'level.created', null, null, false,
      format('Sponsorship level "%s" added for %s: %s, %s guest(s).', v_name, e.name, money_fmt(v_amount), v_guests));
  else
    select * into old from sponsorship_tiers where id = p ->> 'id' and event_id = e.id for update;
    if old.id is null then raise exception 'not_found: no such level on that gala'; end if;
    update sponsorship_tiers set name = v_name, contribution_amount = v_amount, included_seat_count = v_guests, tier_category = v_cat,
           guaranteed_seating = v_seated, required_materials = v_mats
     where id = old.id returning * into new_row;
    v_changes := audit_changes(to_jsonb(old), to_jsonb(new_row),
      array['name','contribution_amount','included_seat_count','tier_category','guaranteed_seating','required_materials']);
    if v_changes is null then return old.id; end if;
    v_id := old.id;
    perform write_audit('staff', me.name, 'sponsorship_level', v_id, null, 'level.updated', null, null, false,
      format('Sponsorship level "%s" edited (%s).', v_name, (select string_agg(k, ', ') from jsonb_object_keys(v_changes) k)), v_changes);
  end if;
  return v_id;
end $$;

-- Start a gala's levels (default: the current gala; any gala not closed) from another gala's, normally last year's.
-- Only while that gala has no levels of its own besides comps, so nothing is doubled. Retired levels aren't copied. Returns how many were copied.
drop function if exists staff_copy_levels(text);
create or replace function staff_copy_levels(p_from_event text, p_to_event text default null) returns int
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin']); e gala_events; src gala_events; v_n int;
begin
  select * into e from gala_events where id = coalesce(p_to_event, current_event_id()) and status <> 'closed';
  select * into src from gala_events where id = p_from_event;
  if e.id is null or src.id is null or src.id = e.id then raise exception 'not_found: choose an earlier gala to copy from'; end if;
  if exists (select 1 from sponsorship_tiers where event_id = e.id and tier_category <> 'complimentary') then
    raise exception 'invalid_input: % already has levels; edit them instead', e.name;
  end if;
  with ins as (
    insert into sponsorship_tiers (id, event_id, sort_order, name, contribution_amount, included_seat_count, tier_category, guaranteed_seating, required_materials)
    select 'lv-' || e.year || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8), e.id, sort_order, name, contribution_amount,
           included_seat_count, tier_category, guaranteed_seating, required_materials
      from sponsorship_tiers where event_id = src.id and not retired and tier_category <> 'complimentary'
    returning 1)
  select count(*) into v_n from ins;
  perform write_audit('staff', me.name, 'sponsorship_level', e.id, null, 'level.copied', null, null, false,
    format('%s level(s) copied from %s to %s.', v_n, src.name, e.name));
  return v_n;
end $$;

-- Stop offering a level (or offer it again). Orders already on it keep it; it just leaves the pickers.
create or replace function staff_retire_level(p_id text, p_retired boolean) returns void
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin']); t sponsorship_tiers;
begin
  select * into t from sponsorship_tiers where id = p_id and event_id in (select id from gala_events where status <> 'closed') for update;
  if t.id is null then raise exception 'not_found: no such level on an open gala'; end if;
  if p_retired is null or t.retired = p_retired then return; end if;
  update sponsorship_tiers set retired = p_retired where id = t.id;
  perform write_audit('staff', me.name, 'sponsorship_level', t.id, null, case when p_retired then 'level.retired' else 'level.restored' end,
    t.retired::text, p_retired::text, false,
    format('Sponsorship level "%s" %s.', t.name, case when p_retired then 'no longer offered' else 'offered again' end));
end $$;

-- Start next year's gala (gala admins). p: { year, name, event_date, doors_time?, program_time?, venue_name?,
-- venue_address?, dress_code?, guest_list_deadline?, program_ad_deadline?, copy_levels_from? }. The new gala is in
-- planning: it doesn't take check-in, imports or exports away from this year's gala (current_event_id), and its levels
-- can be set up at once. Demo or real follows the galas already in the project (demo and real never mix).
-- With copy_levels_from (normally this year's gala), it starts with that gala's levels still offered.
create or replace function staff_start_gala(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  me staff_users := require_staff(array['gala_admin']);
  v_year int := nullif(p ->> 'year', '')::int; v_name text := btrim(coalesce(p ->> 'name', ''));
  v_date date := nullif(p ->> 'event_date', '')::date; v_dl date := nullif(p ->> 'guest_list_deadline', '')::date;
  v_ad date := nullif(p ->> 'program_ad_deadline', '')::date; v_id text; v_demo boolean; v_copied int := 0;
begin
  if v_year is null or v_year < 2000 or v_year > 2200 then raise exception 'invalid_input: the gala needs a year'; end if;
  if v_name = '' or v_date is null then raise exception 'invalid_input: the gala needs a name and a date'; end if;
  if extract(year from v_date) <> v_year then raise exception 'invalid_input: the date isn''t in %', v_year; end if;
  if v_dl is not null and v_dl > v_date then raise exception 'invalid_input: the guest-list deadline is after the gala'; end if;
  if exists (select 1 from gala_events where year = v_year) then raise exception 'invalid_input: there is already a % gala', v_year; end if;
  -- Only the next one: a past year would sit in planning for ever, and could even take over as the current gala.
  if v_year < (select max(year) from gala_events) then
    raise exception 'invalid_input: % is before the newest gala (%)', v_year, (select max(year) from gala_events); end if;
  if v_ad is not null and v_ad > v_date then raise exception 'invalid_input: the program-ad deadline is after the gala'; end if;
  v_id := 'ev-' || v_year;
  v_demo := coalesce((select bool_or(is_synthetic) from gala_events), false);
  insert into gala_events (id, year, name, event_date, doors_time, program_time, venue_name, venue_address, dress_code,
                           guest_list_deadline, program_ad_deadline, status, is_synthetic)
  values (v_id, v_year, v_name, v_date, nullif(btrim(p ->> 'doors_time'), ''), nullif(btrim(p ->> 'program_time'), ''),
          nullif(btrim(p ->> 'venue_name'), ''), nullif(btrim(p ->> 'venue_address'), ''), nullif(btrim(p ->> 'dress_code'), ''),
          v_dl, v_ad, 'planning', v_demo);
  perform write_audit('staff', me.name, 'gala_event', v_id, null, 'gala.started', null, 'planning', false,
    format('%s started for %s (in planning).', v_name, to_char(v_date, 'FMMonth FMDD, YYYY')));
  if nullif(p ->> 'copy_levels_from', '') is not null then
    v_copied := staff_copy_levels(p ->> 'copy_levels_from', v_id);
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 8. EXPORTS  (rows for the staff app to save as CSV; every export is logged)
-- Columns are a first proposal until AAFE sends its badge and check-in templates.
-- ---------------------------------------------------------------------

-- Badge mail merge. Only what prints on a badge: never email, dietary or accessibility needs,
-- payment, or staff notes. A guest with no table is admitted without a guaranteed seat.
drop function if exists public.staff_export_badges(boolean);
drop function if exists private.staff_export_badges(boolean);
create or replace function staff_export_badges(p_include_printed boolean default false)
returns table (display_name text, first_name text, last_name text, title text, organization text,
               table_number int, seat_number int, sponsor text, guest_type text, badge_status text)
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); v_n int;
begin
  return query
    select g.display_name, g.first_name, g.last_name, g.title, g.organization, t.number, g.seat_number,
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
-- Volunteers may export it; it carries no email, phone, payment, dietary needs, staff notes, or accessibility
-- details (a yes/no flag only).
drop function if exists public.staff_export_checkin();
drop function if exists private.staff_export_checkin();
create or replace function staff_export_checkin()
returns table (last_name text, first_name text, display_name text, organization text, sponsor text, table_number int,
               seat_number int, guest_type text, access_needs boolean, arrived boolean)
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager','check_in_volunteer']); v_n int;
begin
  return query
    select * from (
      select g.last_name, g.first_name, g.display_name, g.organization, sp.organization_name, t.number, g.seat_number,
             g.guest_type, has_need(g.accessibility_needs), g.attendance_status = 'checked_in'
      from guests g join orders o on o.id = g.order_id join sponsors sp on sp.id = o.sponsor_id
      left join event_tables t on t.id = g.table_id
      where o.event_id = current_event_id() and o.status <> 'cancelled'
      union all
      select 'Unnamed seat', null, 'Unnamed seat', null, sp.organization_name, null, s.slot_number, 'unnamed_seat', false, false
      from seats s join orders o on o.id = s.order_id join sponsors sp on sp.id = o.sponsor_id
      where o.event_id = current_event_id() and o.status <> 'cancelled' and s.guest_id is null and s.status <> 'cancelled'
    ) x
    order by (x.guest_type = 'unnamed_seat'), x.last_name, x.first_name nulls last, x.organization_name, x.seat_number;
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
    select case when g.last_name <> '' then g.first_name end, coalesce(nullif(g.last_name, ''), g.display_name, g.first_name),
           nullif(g.email, ''), g.title, g.organization, sp.organization_name,
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
-- 8b. SALESFORCE STAND-IN  (the salesforce-push edge function; _shared/salesforce.ts maps the rows)
-- Give Lively's own connector already sends its online purchases to AAFE's Salesforce (NPSP): the buyer (Contact,
-- matched by email), the Opportunity, and the event's Campaign. This sends what Give Lively doesn't know, for the
-- current gala: check, ACH, wire and staff-entered orders (Opportunity) with their sponsors (Account) and payments
-- (npe01__OppPayment__c), and every named guest, comps included (Contact, matched by email) with their gala-night
-- status (CampaignMember of the gala's Campaign, Give Lively's own when it has one). No phones, dietary or
-- accessibility details. A comp is guests only: no Account or Opportunity (Gate 1, box 5).
-- In the demo it goes to the salesforce-mock function, never a real org (requirements: Salesforce push, simulated).
-- ponytail: each run sends the whole gala; upserts on our ids make that safe. Send only what changed since the last
-- sync (salesforce_sync.last_synced_at) if a gala ever outgrows a few thousand records.
-- ---------------------------------------------------------------------
create unique index if not exists salesforce_sync_record on salesforce_sync (entity, entity_id, sf_object);

create or replace function salesforce_outbox() returns jsonb
language sql stable security definer set search_path = public as $$
  with e as (select * from gala_events where id = current_event_id()),
  o as (select o.* from orders o join e on e.id = o.event_id
         where o.source not in ('givelively', 'comp') and o.status <> 'comp')
  select jsonb_build_object(
    -- Give Lively names the event's Campaign after its page: that's the one to use when it exists.
    'campaign', (select jsonb_build_object('id', e.id, 'name', e.name, 'date', e.event_date, 'givelively_name', e.givelively_page_name) from e),
    'accounts', coalesce((select jsonb_agg(jsonb_build_object('id', sp.id, 'name', sp.organization_name) order by sp.id)
                            from sponsors sp where sp.id in (select sponsor_id from o)), '[]'),
    'opportunities', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'account_id', o.sponsor_id,
                                 'name', sp.organization_name || ' — ' || t.name || ' — ' || e.name, 'amount', o.commitment_amount,
                                 'status', o.status, 'close_date', o.created_at::date) order by o.id)
                                 from o join sponsors sp on sp.id = o.sponsor_id join sponsorship_tiers t on t.id = o.tier_id cross join e), '[]'),
    -- Checks, direct ACH and wires that staff recorded; Give Lively's own payments (processor stripe) are its connector's.
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'order_id', p.order_id, 'amount', p.original_amount - p.refunded_amount,
                            'date', p.received_at::date, 'method', p.method) order by p.id)
                            from payments p join o on o.id = p.order_id where p.processor = 'none'), '[]'),
    -- Every named guest of the gala, Give Lively's buyers' guests included: Give Lively never sees guest names.
    -- LastName is required in Salesforce: a one-word name goes there (as in staff_export_salesforce).
    'contacts', coalesce((select jsonb_agg(jsonb_build_object('id', g.id,
                            'first', case when g.last_name <> '' then g.first_name end,
                            'last', coalesce(nullif(g.last_name, ''), nullif(g.display_name, ''), g.first_name),
                            'email', nullif(g.email, ''),
                            'status', case g.attendance_status when 'checked_in' then 'Attended' when 'no_show' then 'No Show' else 'Registered' end)
                            order by g.id)
                            from guests g join orders og on og.id = g.order_id join e on e.id = og.event_id
                           where og.status <> 'cancelled'), '[]'))
$$;

-- What Salesforce said about each record (from salesforce-push): kept in salesforce_sync, and the Account and
-- Opportunity ids on the sponsor and order, as the CSV export reads them. One change-log line per run.
create or replace function salesforce_mark_synced(p_results jsonb, p_actor text default 'Salesforce sync') returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; v_ok int := 0; v_err int := 0; v_failed boolean;
begin
  for r in select * from jsonb_array_elements(coalesce(p_results, '[]')) loop
    v_failed := coalesce(r ->> 'error', '') <> '';
    insert into salesforce_sync (entity, entity_id, sf_object, sf_id, status, last_synced_at, error_message)
    values (r ->> 'entity', r ->> 'entity_id', r ->> 'sf_object', nullif(r ->> 'sf_id', ''),
            case when v_failed then 'error' else 'synced' end, now(), left(nullif(r ->> 'error', ''), 1000))
    on conflict (entity, entity_id, sf_object) do update
      set sf_id = coalesce(excluded.sf_id, salesforce_sync.sf_id), status = excluded.status,
          last_synced_at = excluded.last_synced_at, error_message = excluded.error_message;
    if v_failed then v_err := v_err + 1; continue; end if;
    v_ok := v_ok + 1;
    if r ->> 'sf_object' = 'Account' then update sponsors set salesforce_account_id = r ->> 'sf_id' where id = r ->> 'entity_id'; end if;
    if r ->> 'sf_object' = 'Opportunity' then update orders set salesforce_opportunity_id = r ->> 'sf_id' where id = r ->> 'entity_id'; end if;
  end loop;
  perform write_audit('system', p_actor, 'salesforce', 'batch', null, 'salesforce.synced', null, null, false,
    format('%s record(s) sent to Salesforce%s.', v_ok, case when v_err > 0 then format('; %s failed', v_err) else '' end));
  return jsonb_build_object('synced', v_ok, 'failed', v_err);
end $$;

-- ---------------------------------------------------------------------
-- 8b. REPORTS  (CSV downloads AAFE charts itself; no charts in the app; decided Oct 14)
-- Each returns a JSON list of rows for the current gala; the staff app writes the CSV. Every download is logged.
-- Times are New York time, 24-hour ("2027-05-20 19:04"), so they sort; money is plain numbers, so a spreadsheet can add them up.
-- "Individual": a ticket bought by a person, not an organization (the buyer's name is the sponsor record's name).
-- ---------------------------------------------------------------------

create or replace function report_ny(t timestamptz) returns text
language sql immutable set search_path = public as $$ select to_char(t at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI') $$;   -- sorts as text; spreadsheets read it as a date and time

-- What each order has paid so far (refunds taken off).
create or replace function report_paid(p_order_id text) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(greatest(original_amount - refunded_amount, 0)), 0) from payments where order_id = p_order_id
$$;

-- Who came, the end-of-night report: one row per guest of this gala and one per walk-in. Includes guests' emails,
-- so gala admins only.
create or replace function staff_report_attendance() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin']); v jsonb;
begin
  select coalesce(jsonb_agg(r order by r ->> 'last_name', r ->> 'first_name'), '[]') into v from (
    select jsonb_build_object(
      'name', coalesce(nullif(g.display_name, ''), btrim(g.first_name || ' ' || g.last_name)), 'first_name', g.first_name, 'last_name', g.last_name,
      'email', g.email, 'title', g.title, 'organization', g.organization, 'category', g.guest_type,
      'sponsor', sp.organization_name, 'buyer_type', case when t.tier_category = 'ticket' and sp.organization_name = sp.primary_contact_name then 'Individual' else 'Organization' end,
      'level', t.name, 'committed', o.commitment_amount, 'paid', report_paid(o.id), 'table', et.number,
      'came', ci.id is not null, 'checked_in_at', report_ny(ci.checked_in_at), 'method', ci.method, 'device', ci.device, 'checked_in_by', ci.checked_in_by) r
    from guests g join orders o on o.id = g.order_id join sponsors sp on sp.id = o.sponsor_id join sponsorship_tiers t on t.id = o.tier_id
    left join event_tables et on et.id = g.table_id
    left join check_ins ci on ci.guest_id = g.id and ci.event_id = o.event_id
    where o.event_id = current_event_id() and o.status <> 'cancelled'
    union all
    select jsonb_build_object(
      'name', ci.arrival_name, 'first_name', null, 'last_name', ci.arrival_name, 'email', null, 'title', null, 'organization', null,
      'category', 'walk_in', 'sponsor', sp.organization_name, 'buyer_type', null, 'level', t.name, 'committed', null, 'paid', null, 'table', null,
      'came', true, 'checked_in_at', report_ny(ci.checked_in_at), 'method', ci.method, 'device', ci.device, 'checked_in_by', ci.checked_in_by,
      'walk_in_reason', ci.type)
    from check_ins ci left join orders o on o.id = ci.order_id left join sponsors sp on sp.id = o.sponsor_id left join sponsorship_tiers t on t.id = o.tier_id
    where ci.event_id = current_event_id() and ci.guest_id is null) x;
  perform write_audit('staff', me.name, 'export', 'report_attendance', null, 'report.attendance', null, null, false,
    format('Who-came report downloaded: %s row(s).', jsonb_array_length(v)));
  return v;
end $$;

-- Sponsors and money: one row per sponsorship or ticket purchase on this gala, cancelled ones included (marked).
create or replace function staff_report_sponsors() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); v jsonb;
begin
  select coalesce(jsonb_agg(r order by (r ->> 'committed')::numeric desc nulls last, r ->> 'sponsor'), '[]') into v from (
    select jsonb_build_object(
      'sponsor', sp.organization_name, 'buyer_type', case when t.tier_category = 'ticket' and sp.organization_name = sp.primary_contact_name then 'Individual' else 'Organization' end,
      'contact', sp.primary_contact_name, 'contact_email', sp.primary_contact_email, 'relationship_manager', rm.name,
      'level', t.name, 'kind', t.tier_category, 'source', o.source, 'status', o.status,
      'committed', o.commitment_amount, 'paid', report_paid(o.id),
      'refunded', (select coalesce(sum(refunded_amount), 0) from payments where order_id = o.id),
      'balance', case when o.status in ('cancelled', 'comp') then 0 else greatest(o.commitment_amount - report_paid(o.id), 0) end,
      'paid_by', (select string_agg(distinct method, ', ') from payments where order_id = o.id),
      'guests_included', (select count(*) from seats where order_id = o.id and status <> 'cancelled'),
      'guests_named', (select count(*) from seats where order_id = o.id and status <> 'cancelled' and guest_id is not null),
      'guests_came', (select count(*) from check_ins where order_id = o.id and guest_id is not null),
      'walk_ins', (select count(*) from check_ins where order_id = o.id and guest_id is null),
      'logo', o.logo_status, 'program_ad', o.program_ad_status, 'created', report_ny(o.created_at)) r
    from orders o join sponsors sp on sp.id = o.sponsor_id join sponsorship_tiers t on t.id = o.tier_id
    left join staff_users rm on rm.id = sp.relationship_owner_id
    where o.event_id = current_event_id() and t.tier_category <> 'complimentary') x;
  perform write_audit('staff', me.name, 'export', 'report_sponsors', null, 'report.sponsors', null, null, false,
    format('Sponsors-and-money report downloaded: %s row(s).', jsonb_array_length(v)));
  return v;
end $$;

-- Food and accessibility: one row per guest of this gala, the answers as written (the staff app splits them into
-- one column per choice). Staff-only details, never sent to Salesforce or AI; deleted after the gala unless AAFE decides to keep them (data-handling.md).
create or replace function staff_report_needs() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); v jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', coalesce(nullif(g.display_name, ''), btrim(g.first_name || ' ' || g.last_name)), 'last_name', g.last_name, 'organization', g.organization,
      'sponsor', sp.organization_name, 'category', g.guest_type, 'table', et.number,
      'dietary_needs', g.dietary_needs, 'accessibility_needs', g.accessibility_needs)
      order by sp.organization_name, g.last_name, g.first_name), '[]') into v
    from guests g join orders o on o.id = g.order_id join sponsors sp on sp.id = o.sponsor_id left join event_tables et on et.id = g.table_id
   where o.event_id = current_event_id() and o.status <> 'cancelled';
  perform write_audit('staff', me.name, 'export', 'report_needs', null, 'report.needs', null, null, false,
    format('Food-and-access report downloaded: %s guest(s).', jsonb_array_length(v)));
  return v;
end $$;

-- One guest's answer, as the staff app reads it (shared/src/guestNeeds.ts; scripts/test-needs-totals.mts holds the
-- two to the same counts). need_status() is needStatus(): 'unanswered' (blank), 'none' ("None" or "No", any case),
-- else 'some'. need_choices() is parseNeeds(): the options chosen, older names read as today's, anything else written
-- counted as Other; none for exactly "None", "No" or "Yes".
create or replace function need_status(p_value text) returns text
language sql immutable set search_path = public as $$
  select case when v = '' then 'unanswered' when v ~* '^(none|no)$' then 'none' else 'some' end
    from (select regexp_replace(coalesce(p_value, ''), '^\s+|\s+$', '', 'g') v) x
$$;
create or replace function need_choices(p_value text, p_kind text) returns text[]
language sql immutable set search_path = public as $$
  select case when v in ('', 'No', 'Yes', 'None') then '{}'::text[]
    else (select coalesce(array_agg(distinct case when a = any (case p_kind
                    when 'dietary' then array['Vegetarian','Vegan','Halal','Kosher','Gluten-free','No pork','No beef','No shellfish','Nut allergy']
                    else array['Wheelchair access','Step-free access','Hearing support','Visual support'] end) then a else 'Other' end), '{}')
            from (select case w when 'Step-free seating' then 'Step-free access' when 'Hearing loop' then 'Hearing support' else w end a
                    from regexp_split_to_table(v, '\s*[;,]\s*') w where w <> '') parts)
  end from (select regexp_replace(coalesce(p_value, ''), '^\s+|\s+$', '', 'g') v) x
$$;

-- After the gala (decided Oct 18): save the gala's food and access totals, then delete every guest's answers, and
-- their old values in the change log. Once per gala, and only once its date has passed. Gala admins only.
-- The totals count the guests of the gala's orders that weren't cancelled, per option, as the Food and access report
-- does; 'Any need', 'None' and 'Not answered' count guests, not choices.
-- The change log keeps that a field of one of this gala's guests changed, not what it was: the one exception to
-- audit_log being append-only, since keeping the old values there would undo a deletion.
create or replace function audit_redact(p_event_id text, p_fields text[], p_label text) returns void
language sql security definer set search_path = public as $$
  update audit_log a set changes = (a.changes - p_fields)
       || (select coalesce(jsonb_object_agg(f, p_label), '{}') from unnest(p_fields) f where a.changes ? f)
   where a.changes ?| p_fields
     and (a.order_id in (select id from orders where event_id = p_event_id)
          or a.entity_id in (select g.id from guests g join orders o on o.id = g.order_id where o.event_id = p_event_id))
$$;

create or replace function staff_clear_needs(p_event_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin']); e gala_events;
begin
  select * into e from gala_events where id = p_event_id;
  if not found then raise exception 'not_found: gala'; end if;
  if e.event_date >= (now() at time zone 'America/New_York')::date then
    raise exception 'invalid_input: % hasn''t happened yet: food and access answers are cleared after the gala', e.name;
  end if;
  if exists (select 1 from gala_need_totals where event_id = e.id) then
    raise exception 'invalid_input: food and access answers for % were already cleared, and its totals saved', e.name;
  end if;
  return needs_clear(e, 'staff', me.name);
end $$;

-- The step itself, shared with the deletion of contact details (contacts_delete), which runs it when staff haven't.
create or replace function needs_clear(e gala_events, p_actor_type text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_cleared int; v jsonb;
begin
  insert into gala_need_totals (event_id, kind, choice, guests)
  select e.id, k.kind, k.choice, count(n.status) filter (where case k.choice
           when 'Any need' then n.status = 'some'
           when 'None' then n.status = 'none'
           when 'Not answered' then n.status = 'unanswered'
           else n.status = 'some' and k.choice = any (n.choices) end)::int
    from (select 'dietary' kind, unnest(array['Vegetarian','Vegan','Halal','Kosher','Gluten-free','No pork','No beef','No shellfish','Nut allergy',
                                               'Other','Any need','None','Not answered']) choice
          union all
          select 'accessibility', unnest(array['Wheelchair access','Step-free access','Hearing support','Visual support',
                                               'Other','Any need','None','Not answered'])) k
    left join (select 'dietary' kind, need_status(g.dietary_needs) status, need_choices(g.dietary_needs, 'dietary') choices
                 from guests g join orders o on o.id = g.order_id where o.event_id = e.id and o.status <> 'cancelled'
               union all
               select 'accessibility', need_status(g.accessibility_needs), need_choices(g.accessibility_needs, 'accessibility')
                 from guests g join orders o on o.id = g.order_id where o.event_id = e.id and o.status <> 'cancelled') n on n.kind = k.kind
   group by k.kind, k.choice;

  update guests g set dietary_needs = null, accessibility_needs = null, updated_at = now()
    from orders o where o.id = g.order_id and o.event_id = e.id and (g.dietary_needs is not null or g.accessibility_needs is not null);
  get diagnostics v_cleared = row_count;
  -- These answers can be health information.
  perform audit_redact(e.id, array['dietary_needs','accessibility_needs'], 'cleared after the gala');

  select jsonb_object_agg(kind, totals) into v from (
    select kind, jsonb_object_agg(choice, guests) totals from gala_need_totals where event_id = e.id group by kind) t;
  perform write_audit(p_actor_type, p_actor, 'gala', e.id, null, 'gala.needs_cleared', null, null, false,
    format('Food and access answers cleared for %s guest(s) of %s; only the totals are kept.', v_cleared, e.name));
  return v;
end $$;

-- Guests' contact details are deleted this many days after their gala (data-handling.md, "Retention"). The proposed
-- default; AAFE's answer (Oct 19) can change it here, the one place it's written (decisions.md, Oct 18).
create or replace function retention_days() returns int
language sql immutable set search_path = public as $$ select 60 $$;

-- After the gala: delete the guests' contact details, and every copy of them. Names stay (attendance history and
-- Salesforce), and so do sponsors' own contact details, AAFE's ongoing relationship records. Food and access answers
-- go too, their totals saved first, if staff haven't cleared them already.
--   * guests' emails, and their old values in the change log;
--   * the address on every email sent to one of the gala's guests (a QR invitation still waiting is cancelled, as on
--     any email change, by guests_void_qr);
--   * email addresses inside the gala's import review items and Give Lively's free-text guest lists;
--   * Give Lively's raw records of the gala's purchases (the orders and payments keep what the app needs).
create or replace function contacts_delete(e gala_events, p_actor_type text, p_actor text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  email_re constant text := '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}';
  v_needs jsonb; v_guests int; v_emails int; v_reviews int; v_texts int; v_raw int;
begin
  if not exists (select 1 from gala_need_totals where event_id = e.id) then v_needs := needs_clear(e, p_actor_type, p_actor); end if;

  update guests g set email = null, updated_at = now()
    from orders o where o.id = g.order_id and o.event_id = e.id and g.email is not null;
  get diagnostics v_guests = row_count;
  perform audit_redact(e.id, array['email'], 'deleted after the gala');

  -- (A QR invitation still waiting was cancelled by guests_void_qr when the email changed: it can't go now.)
  update email_log set to_email = ''
   where to_email <> '' and guest_id in (select g.id from guests g join orders o on o.id = g.order_id where o.event_id = e.id);
  get diagnostics v_emails = row_count;
  update import_review set details = regexp_replace(details::text, email_re, 'deleted after the gala', 'g')::jsonb
   where event_id = e.id and details::text ~ email_re;
  get diagnostics v_reviews = row_count;
  update orders set imported_guest_text = regexp_replace(imported_guest_text, email_re, 'deleted after the gala', 'g'), updated_at = now()
   where event_id = e.id and imported_guest_text ~ email_re;
  get diagnostics v_texts = row_count;
  delete from givelively_raw where transaction_id in (select p.givelively_transaction_id from payments p join orders o on o.id = p.order_id
                                                       where o.event_id = e.id and p.givelively_transaction_id is not null);
  get diagnostics v_raw = row_count;

  update gala_events set contacts_deleted_at = now() where id = e.id;
  perform write_audit(p_actor_type, p_actor, 'gala', e.id, null, 'gala.contacts_deleted', null, null, false,
    format('Guests'' contact details of %s deleted: %s guest email(s), %s sent email(s), %s review item(s), %s Give Lively guest list(s), %s Give Lively record(s).',
           e.name, v_guests, v_emails, v_reviews, v_texts, v_raw));
  return jsonb_build_object('guests', v_guests, 'emails', v_emails, 'review_items', v_reviews, 'guest_lists', v_texts,
                            'givelively_records', v_raw, 'needs_cleared', v_needs is not null);
end $$;

-- A gala admin can do it any time after the gala, e.g. once the Salesforce attendee file is downloaded. Once per gala.
create or replace function staff_delete_guest_contacts(p_event_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin']); e gala_events;
begin
  select * into e from gala_events where id = p_event_id;
  if not found then raise exception 'not_found: gala'; end if;
  if e.event_date >= (now() at time zone 'America/New_York')::date then
    raise exception 'invalid_input: % hasn''t happened yet: guests'' contact details are deleted after the gala', e.name;
  end if;
  if e.contacts_deleted_at is not null then
    raise exception 'invalid_input: guests'' contact details for % were already deleted (%)', e.name, report_ny(e.contacts_deleted_at);
  end if;
  return contacts_delete(e, 'staff', me.name);
end $$;

-- Daily (database/cron.sql), so the promise holds even if nobody remembers: every gala retention_days() or more in
-- the past with something left to delete, including anything added after an earlier deletion (a late edit). Run by
-- the system, and logged like a staff run.
create or replace function retention_sweep() returns jsonb
language plpgsql security definer set search_path = public as $$
declare e gala_events; v jsonb := '[]';
begin
  for e in select * from gala_events g
            where g.event_date <= (now() at time zone 'America/New_York')::date - retention_days()
              and (exists (select 1 from guests x join orders o on o.id = x.order_id where o.event_id = g.id
                            and (x.email is not null or x.dietary_needs is not null or x.accessibility_needs is not null))
                   or exists (select 1 from payments p join orders o on o.id = p.order_id
                               join givelively_raw r on r.transaction_id = p.givelively_transaction_id where o.event_id = g.id))
            order by g.event_date loop
    v := v || jsonb_build_array(jsonb_build_object('gala', e.id)
                                || contacts_delete(e, 'system', format('Retention, %s days after the gala', retention_days())));
  end loop;
  return v;
end $$;

-- Payments: one row per payment on this gala's orders.
create or replace function staff_report_payments() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin','relationship_manager']); v jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'received', report_ny(p.received_at), 'sponsor', sp.organization_name, 'level', t.name, 'method', p.method, 'method_detail', p.method_detail,
      'check_number', p.check_number,
      'amount', p.original_amount, 'fee_covered_by_donor', p.covered_fee_amount, 'gross', p.gross_amount, 'processor_fee', p.transaction_fee_amount,
      'refunded', p.refunded_amount, 'net', p.net_amount, 'givelively_transaction', p.givelively_transaction_id,
      'recorded_by', coalesce(rb.name, p.recorded_by), 'reconciliation', p.reconciliation_status)
      order by p.received_at), '[]') into v
    from payments p join orders o on o.id = p.order_id join sponsors sp on sp.id = o.sponsor_id join sponsorship_tiers t on t.id = o.tier_id
    left join staff_users rb on rb.id = p.recorded_by
   where o.event_id = current_event_id();
  perform write_audit('staff', me.name, 'export', 'report_payments', null, 'report.payments', null, null, false,
    format('Payments report downloaded: %s payment(s).', jsonb_array_length(v)));
  return v;
end $$;

-- Full guest list: everyone on this gala's list with every detail staff may see. It has guests' emails, so gala
-- admins only, like Who came (review of #135).
create or replace function staff_report_guests() returns jsonb
language plpgsql security definer set search_path = public as $$
declare me staff_users := require_staff(array['gala_admin']); v jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'name', coalesce(nullif(g.display_name, ''), btrim(g.first_name || ' ' || g.last_name)), 'first_name', g.first_name, 'last_name', g.last_name,
      'title', g.title, 'organization', g.organization, 'email', g.email, 'category', g.guest_type,
      'sponsor', sp.organization_name, 'level', t.name, 'table', et.number, 'name_status', s.status, 'badge', g.badge_status,
      'dietary_needs', g.dietary_needs, 'accessibility_needs', g.accessibility_needs, 'relationship_note', g.relationship_note,
      'came', g.attendance_status = 'checked_in', 'source', g.last_updated_by, 'added', report_ny(g.created_at), 'updated', report_ny(g.updated_at))
      order by g.last_name, g.first_name), '[]') into v
    from guests g join orders o on o.id = g.order_id join sponsors sp on sp.id = o.sponsor_id join sponsorship_tiers t on t.id = o.tier_id
    left join event_tables et on et.id = g.table_id left join seats s on s.guest_id = g.id and s.status <> 'cancelled'
   where o.event_id = current_event_id() and o.status <> 'cancelled';
  perform write_audit('staff', me.name, 'export', 'report_guests', null, 'report.guests', null, null, false,
    format('Full guest list downloaded: %s guest(s).', jsonb_array_length(v)));
  return v;
end $$;

-- What changed since the staff app last looked (Gate 3, data use; "Sync" near the top explains the cursor). It runs with
-- the caller's rights, so each role gets exactly the rows its access rules allow, and in one statement, so one
-- snapshot: every table in the answer agrees with the others. Everything comes when there's no cursor yet, when the
-- tombstones it needs were pruned, or when the gala being run changed. `counts` lets the app check its copy and reload
-- everything if it drifted (the change log is left out: the app keeps only its newest 1,000 entries).
create or replace function staff_sync(p_cursor xid8 default null, p_event text default null) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare v_full boolean; v_out jsonb;
begin
  if coalesce(staff_role(), '') not in ('gala_admin', 'relationship_manager') then raise exception 'forbidden'; end if;
  v_full := p_cursor is null or p_cursor <= (select floor from sync_state where id = 1) or p_event is distinct from current_event_id();
  select jsonb_build_object(
    'cursor', pg_snapshot_xmin(pg_current_snapshot())::text,
    'full', v_full,
    'event', current_event_id(),
    'rows', jsonb_build_object(
      'gala_events', (select coalesce(jsonb_agg(to_jsonb(r) - 'sync_txid'), '[]') from gala_events r where v_full or r.sync_txid >= p_cursor),
      'staff_users', (select coalesce(jsonb_agg(to_jsonb(r) - 'sync_txid'), '[]') from staff_users r where v_full or r.sync_txid >= p_cursor),
      'sponsorship_tiers', (select coalesce(jsonb_agg(to_jsonb(r) - 'sync_txid'), '[]') from sponsorship_tiers r where v_full or r.sync_txid >= p_cursor),
      'sponsors', (select coalesce(jsonb_agg(to_jsonb(r) - 'sync_txid'), '[]') from sponsors r where v_full or r.sync_txid >= p_cursor),
      'orders', (select coalesce(jsonb_agg(to_jsonb(r) - 'sync_txid'), '[]') from orders r where v_full or r.sync_txid >= p_cursor),
      'payments', (select coalesce(jsonb_agg(to_jsonb(r) - 'sync_txid'), '[]') from payments r where v_full or r.sync_txid >= p_cursor),
      'event_tables', (select coalesce(jsonb_agg(to_jsonb(r) - 'sync_txid'), '[]') from event_tables r where v_full or r.sync_txid >= p_cursor),
      'guests', (select coalesce(jsonb_agg(to_jsonb(r) - 'sync_txid'), '[]') from guests r where v_full or r.sync_txid >= p_cursor),
      'seats', (select coalesce(jsonb_agg(to_jsonb(r) - 'sync_txid'), '[]') from seats r where v_full or r.sync_txid >= p_cursor),
      'check_ins', (select coalesce(jsonb_agg(to_jsonb(r) - 'sync_txid'), '[]') from check_ins r where v_full or r.sync_txid >= p_cursor),
      'email_log', (select coalesce(jsonb_agg(to_jsonb(r) - 'sync_txid'), '[]') from email_log r where v_full or r.sync_txid >= p_cursor),
      'salesforce_sync', (select coalesce(jsonb_agg(to_jsonb(r) - 'sync_txid'), '[]') from salesforce_sync r where v_full or r.sync_txid >= p_cursor),
      'import_runs', (select coalesce(jsonb_agg(to_jsonb(r) - 'sync_txid'), '[]') from import_runs r where v_full or r.sync_txid >= p_cursor),
      'import_review', (select coalesce(jsonb_agg(to_jsonb(r) - 'sync_txid'), '[]') from import_review r where v_full or r.sync_txid >= p_cursor),
      'tier_mappings', (select coalesce(jsonb_agg(to_jsonb(r) - 'sync_txid'), '[]') from tier_mappings r where v_full or r.sync_txid >= p_cursor),
      'audit_log', (select coalesce(jsonb_agg(to_jsonb(a) order by a.id), '[]') from (
        select id, at, actor_type, actor, entity, entity_id, order_id, action, from_state, to_state, guest_visible, summary
          from audit_log where v_full or sync_txid >= p_cursor order by id desc limit case when v_full then 1000 end) a)),
    -- Only rows that are gone in this same snapshot. Transaction ids don't follow commit order, so a tombstone can come
    -- again after its row was created anew under the same id (a seat, a re-imported order); the app would delete it.
    'deleted', case when v_full then '[]'::jsonb else (select coalesce(jsonb_agg(jsonb_build_object('table', table_name, 'id', row_id)), '[]') from (
          select d.table_name, d.row_id from sync_deleted d where d.table_name = 'gala_events' and d.sync_txid >= p_cursor and not exists (select 1 from gala_events x where x.id::text = d.row_id)
          union all select d.table_name, d.row_id from sync_deleted d where d.table_name = 'staff_users' and d.sync_txid >= p_cursor and not exists (select 1 from staff_users x where x.id::text = d.row_id)
          union all select d.table_name, d.row_id from sync_deleted d where d.table_name = 'sponsorship_tiers' and d.sync_txid >= p_cursor and not exists (select 1 from sponsorship_tiers x where x.id::text = d.row_id)
          union all select d.table_name, d.row_id from sync_deleted d where d.table_name = 'sponsors' and d.sync_txid >= p_cursor and not exists (select 1 from sponsors x where x.id::text = d.row_id)
          union all select d.table_name, d.row_id from sync_deleted d where d.table_name = 'orders' and d.sync_txid >= p_cursor and not exists (select 1 from orders x where x.id::text = d.row_id)
          union all select d.table_name, d.row_id from sync_deleted d where d.table_name = 'payments' and d.sync_txid >= p_cursor and not exists (select 1 from payments x where x.id::text = d.row_id)
          union all select d.table_name, d.row_id from sync_deleted d where d.table_name = 'event_tables' and d.sync_txid >= p_cursor and not exists (select 1 from event_tables x where x.id::text = d.row_id)
          union all select d.table_name, d.row_id from sync_deleted d where d.table_name = 'guests' and d.sync_txid >= p_cursor and not exists (select 1 from guests x where x.id::text = d.row_id)
          union all select d.table_name, d.row_id from sync_deleted d where d.table_name = 'seats' and d.sync_txid >= p_cursor and not exists (select 1 from seats x where x.id::text = d.row_id)
          union all select d.table_name, d.row_id from sync_deleted d where d.table_name = 'check_ins' and d.sync_txid >= p_cursor and not exists (select 1 from check_ins x where x.id::text = d.row_id)
          union all select d.table_name, d.row_id from sync_deleted d where d.table_name = 'email_log' and d.sync_txid >= p_cursor and not exists (select 1 from email_log x where x.id::text = d.row_id)
          union all select d.table_name, d.row_id from sync_deleted d where d.table_name = 'salesforce_sync' and d.sync_txid >= p_cursor and not exists (select 1 from salesforce_sync x where x.id::text = d.row_id)
          union all select d.table_name, d.row_id from sync_deleted d where d.table_name = 'import_runs' and d.sync_txid >= p_cursor and not exists (select 1 from import_runs x where x.id::text = d.row_id)
          union all select d.table_name, d.row_id from sync_deleted d where d.table_name = 'import_review' and d.sync_txid >= p_cursor and not exists (select 1 from import_review x where x.id::text = d.row_id)
          union all select d.table_name, d.row_id from sync_deleted d where d.table_name = 'tier_mappings' and d.sync_txid >= p_cursor and not exists (select 1 from tier_mappings x where x.id::text = d.row_id)) d) end,
    'counts', jsonb_build_object('gala_events', (select count(*) from gala_events), 'staff_users', (select count(*) from staff_users), 'sponsorship_tiers', (select count(*) from sponsorship_tiers), 'sponsors', (select count(*) from sponsors), 'orders', (select count(*) from orders), 'payments', (select count(*) from payments), 'event_tables', (select count(*) from event_tables), 'guests', (select count(*) from guests), 'seats', (select count(*) from seats), 'check_ins', (select count(*) from check_ins), 'email_log', (select count(*) from email_log), 'salesforce_sync', (select count(*) from salesforce_sync), 'import_runs', (select count(*) from import_runs), 'import_review', (select count(*) from import_review), 'tier_mappings', (select count(*) from tier_mappings))
  ) into v_out;
  return v_out;
end $$;

-- Tombstones older than a week go (cron.sql, daily); a cursor at or below the newest one removed gets everything again.
create or replace function sync_prune() returns int
language plpgsql security definer set search_path = public as $$
declare n int; v_max xid8;
begin
  with d as (delete from sync_deleted where deleted_at < now() - interval '7 days' returning sync_txid)
  select count(*), max(sync_txid) into n, v_max from d;
  if v_max is not null then update sync_state set floor = greatest(floor, v_max) where id = 1; end if;
  return n;
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
              'portal_release_seat','staff_me','staff_current_event','staff_update_guest','staff_set_seat_status','staff_mark_printed',
              'staff_assign_seat','staff_seat_order_at_table','staff_record_payment','staff_add_pledge','staff_add_comp_guest',
              'staff_send_qr_invite','staff_resend_portal_link','staff_approve_email','staff_cancel_email','checkin_list','staff_check_in','staff_check_in_qr',
              'staff_check_in_exception','gl_import','staff_import_givelively','email_mark_sent','email_mark_failed','email_claim',
              'purchase_key','payment_method_of','payment_method_detail','name_key','has_need','add_import_review','import_fill_guests','staff_set_tier_mapping','staff_set_gala_page','sync_gala_pages','staff_add_gala_page','staff_remove_gala_page',
              'staff_resolve_import_review','seats_void_qr','guests_void_qr','gala_events_no_mixing','require_gala_order',
              'staff_export_badges','staff_export_checkin','staff_export_salesforce',
              'staff_queue_guest_list_reminders','staff_email_queue','staff_checkin_snapshot','staff_sync_check_ins','staff_undo_check_in',
              'pipeline_stage_label','pipeline_apply_order','orders_pipeline','staff_pipeline','staff_save_prospect',
              'staff_set_prospect_stage','staff_set_sponsorship_goal','staff_set_sponsor_arrivals',
              'staff_update_gala_event','staff_set_material_status','staff_set_order_deadline','salesforce_outbox','salesforce_mark_synced',
              'comp_level','staff_save_level','staff_copy_levels','staff_retire_level','staff_start_gala',
              'report_ny','report_paid','staff_report_attendance','staff_report_sponsors','staff_report_needs','staff_report_payments','staff_report_guests',
              'need_status','need_choices','staff_clear_needs','audit_redact','needs_clear','retention_days','contacts_delete',
              'staff_delete_guest_contacts','retention_sweep',
              'staff_sync','sync_touch','sync_tombstone','sync_prune','door_entries','door_unnamed_seats','door_exceptions','door_sync',
              'upgrade_step')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- staff_role() and current_event_id() are used inside RLS policies, so logged-in users need them.
grant execute on function staff_role(), current_event_id() to authenticated;

-- Guest Portal
grant execute on function portal_get_view(text), portal_save_guest(text, int, jsonb), portal_release_seat(text, int)
  to anon, authenticated;

-- Staff App
grant execute on function
  staff_me(), staff_current_event(), staff_update_guest(text, jsonb), staff_set_seat_status(text, text), staff_mark_printed(text[]),
  staff_assign_seat(text, text, int), staff_seat_order_at_table(text, text),
  staff_record_payment(text, text, numeric, date, text), staff_add_pledge(text, text, text, text, text),
  staff_add_comp_guest(jsonb), staff_send_qr_invite(text), staff_resend_portal_link(text), staff_approve_email(text), staff_cancel_email(text),
  checkin_list(), staff_check_in(text, text), staff_check_in_qr(text), staff_check_in_exception(text, text, text, text),
  staff_checkin_snapshot(), staff_sync_check_ins(jsonb), staff_undo_check_in(text),
  staff_pipeline(), staff_save_prospect(jsonb), staff_set_prospect_stage(text, text), staff_set_sponsorship_goal(numeric),
  staff_set_sponsor_arrivals(boolean, text), staff_update_gala_event(jsonb), staff_set_material_status(text, text, text), staff_set_order_deadline(text, date),
  staff_save_level(jsonb), staff_copy_levels(text, text), staff_retire_level(text, boolean), staff_start_gala(jsonb),
  staff_report_attendance(), staff_report_sponsors(), staff_report_needs(), staff_report_payments(), staff_report_guests(),
  staff_clear_needs(text), staff_delete_guest_contacts(text),
  staff_import_givelively(jsonb, jsonb), staff_set_tier_mapping(text, text, text), staff_set_gala_page(text),
  staff_add_gala_page(text), staff_remove_gala_page(text),
  staff_resolve_import_review(text, text),
  staff_export_badges(boolean), staff_export_checkin(), staff_export_salesforce(),
  staff_queue_guest_list_reminders(int), staff_email_queue(), staff_sync(xid8, text), door_sync(xid8, text)
  to authenticated;

-- Edge functions (service role)
grant execute on function gl_import(jsonb, text, text), email_mark_sent(text, text), email_mark_failed(text, text), email_claim(int), hash_token(text),
  salesforce_outbox(), salesforce_mark_synced(jsonb, text), sync_gala_pages(), sync_prune()
  to service_role;

-- ---------------------------------------------------------------------
-- 10. API WRAPPERS  (Supabase advisor, lints 0028 and 0029)
--    Every function the apps call runs with the owner's rights (SECURITY DEFINER) and checks the caller
--    itself, so the tables can stay closed to the API. Supabase's advisor warns about any such function in
--    the schema the API exposes ("public"). Its recommended fix: the real function moves to schema
--    "private", which the API doesn't expose, and "public" keeps a SECURITY INVOKER wrapper with the same
--    name, arguments, defaults and grants that only calls it. The apps, the tests and the role checks see
--    no difference. staff_role() stays in public: the access rules call it directly.
--    Picks up every function granted to anon or authenticated above, so a new one needs nothing here.
--    Re-running backend.sql recreates each function in public, and this block moves it again.
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

do $$
declare f record; r text;
begin
  for f in select p.proname, pg_get_function_identity_arguments(p.oid) ident, pg_get_function_arguments(p.oid) args,
                  pg_get_function_result(p.oid) result, p.proretset, p.pronargs,
                  array_remove(array[case when has_function_privilege('anon', p.oid, 'execute') then 'anon' end,
                                     case when has_function_privilege('authenticated', p.oid, 'execute') then 'authenticated' end], null) roles
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosecdef and p.proname <> 'staff_role'
              and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
  loop
    execute format('drop function if exists private.%I(%s)', f.proname, f.ident);
    execute format('alter function public.%I(%s) set schema private', f.proname, f.ident);
    execute format('create function public.%I(%s) returns %s language sql security invoker set search_path = '''' as $w$ select %s private.%I(%s) $w$',
                   f.proname, f.args, f.result, case when f.proretset then '* from' else '' end, f.proname,
                   coalesce((select string_agg('$' || i, ', ') from generate_series(1, f.pronargs) i), ''));
    -- Supabase grants every new function to anon and authenticated by default, so revoking from public alone left the
    -- wrappers callable by anyone (Gate 2; the call still failed at the private function).
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated', f.proname, f.ident);
    foreach r in array f.roles loop
      execute format('grant execute on function public.%I(%s) to %I', f.proname, f.ident, r);
    end loop;
  end loop;
end $$;
