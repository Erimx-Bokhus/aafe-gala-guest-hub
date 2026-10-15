-- =====================================================================
-- AAFE Gala Guest Operations — Postgres / Supabase schema
-- Capstone prototype by ERIMX BOKHUS. SYNTHETIC DATA ONLY.
--
-- Two apps share this one database:
--   1. Guest Portal  (sponsors / ticket buyers, via emailed private link)
--   2. AAFE Staff App (gala team, relationship managers, check-in volunteers)
--
-- Run order in Supabase SQL editor:  schema.sql  ->  seed.sql
-- Row-level security notes are at the bottom of this file.
-- =====================================================================

create table if not exists gala_events (
  id               text primary key,
  year             int  not null unique,
  name             text not null,
  event_date       date not null,
  doors_time       text,
  program_time     text,
  venue_name       text,
  venue_address    text,
  dress_code       text,
  guest_list_deadline date,
  program_ad_deadline date,
  status           text not null check (status in ('planning','live','closed')),
  is_synthetic     boolean not null default true
);

create table if not exists staff_users (
  id     text primary key,
  name   text not null,
  email  text not null unique,
  role   text not null check (role in ('gala_admin','relationship_manager','check_in_volunteer'))
  -- In Supabase, link to auth.users(id) and store role in a profiles table or JWT claim.
);

create table if not exists sponsorship_tiers (
  id                   text primary key,
  event_id             text references gala_events(id),   -- each gala has its own levels (decided Oct 14)
  sort_order           int  not null default 0,
  retired              boolean not null default false,    -- no longer offered; past orders keep it
  guaranteed_seating   boolean not null default false,    -- comes with a table (sponsorships); else admittance only
  name                 text not null,
  contribution_amount  numeric(12,2) not null,
  included_seat_count  int not null,
  tier_category        text not null check (tier_category in ('sponsorship','ticket','advertising_only','complimentary')),
  required_materials   text[] not null default '{}'
);

-- Organization or individual who buys/pledges. Persists across years (historical ledger).
create table if not exists sponsors (
  id                    text primary key,
  organization_name     text not null,
  primary_contact_name  text not null,
  primary_contact_email text not null,
  phone                 text,
  relationship_owner_id text references staff_users(id),
  salesforce_account_id text,           -- NPSP Account Id once synced
  created_at            timestamptz not null default now()
);

-- One purchase / pledge / comp grant for one gala year.
create table if not exists orders (
  id                   text primary key,
  event_id             text not null references gala_events(id),
  sponsor_id           text not null references sponsors(id),
  tier_id              text not null references sponsorship_tiers(id),
  source               text not null check (source in ('givelively','check','ach_direct','wire','comp','staff_entry')),
  commitment_amount    numeric(12,2) not null,
  status               text not null check (status in ('pledged','partially_paid','paid','comp','invoice_sent','cancelled')),
  portal_token         text unique,     -- production: store a HASH; token is random, expiring, revocable
  portal_token_expires_at timestamptz,
  portal_link_sent_at  timestamptz,
  guest_list_deadline  date,
  logo_status          text not null default 'not_required' check (logo_status in ('not_required','pending','received','approved')),
  program_ad_status    text not null default 'not_required' check (program_ad_status in ('not_required','pending','received','approved')),
  givelively_order_ref text,            -- Give Lively donation / line-item reference
  salesforce_opportunity_id text,
  internal_notes       text,            -- STAFF ONLY
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Every money movement. Give Lively fields mirror the "Line Items (All)" report.
create table if not exists payments (
  id                      text primary key,
  order_id                text not null references orders(id),
  method                  text not null check (method in ('card','amex','givelively_ach','check','ach_direct','wire')),
  processor               text not null check (processor in ('stripe','none')),
  givelively_transaction_id text,
  check_number            text,
  original_amount         numeric(12,2) not null,   -- before donor-covered fee
  covered_fee_amount      numeric(12,2) not null default 0,  -- donor chose to cover fees
  gross_amount            numeric(12,2) not null,   -- original + covered
  transaction_fee_amount  numeric(12,2) not null default 0,  -- third-party processor fee (Stripe)
  refunded_amount         numeric(12,2) not null default 0,
  net_amount              numeric(12,2) not null,   -- gross - fee - refunded
  received_at             timestamptz not null,
  recorded_by             text,         -- 'givelively_sync' or staff_users.id
  reconciliation_status   text not null default 'unreconciled' check (reconciliation_status in ('unreconciled','matched','needs_review')),
  salesforce_opportunity_id text,
  created_at              timestamptz not null default now()
);

create table if not exists event_tables (
  id         text primary key,
  event_id   text not null references gala_events(id),
  number     int  not null,
  label      text,
  capacity   int  not null default 10,
  pos_x      int  not null,   -- seating-chart position (0-100)
  pos_y      int  not null,
  unique (event_id, number)
);

create table if not exists guests (
  id                  text primary key,
  order_id            text not null references orders(id),
  first_name          text not null,
  last_name           text not null,
  title               text,
  organization        text,
  email               text,
  dietary_needs       text,
  accessibility_needs text,
  guest_type          text not null check (guest_type in ('sponsor_guest','ticket_holder','comp_relationship')),
  relationship_note   text,            -- STAFF ONLY (why a comp guest was invited)
  table_id            text references event_tables(id),
  seat_number         int,
  badge_status        text not null default 'needs_review' check (badge_status in ('needs_review','ready','printed','reprint_needed')),
  attendance_status   text not null default 'expected' check (attendance_status in ('expected','checked_in','no_show')),
  qr_token            text unique,     -- seed/demo only: backend.sql moves these to seats.qr_token_hash and clears them
  last_updated_by     text not null check (last_updated_by in ('guest_portal','staff','givelively_sync')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (table_id, seat_number)
);

-- Seat slots purchased by an order. State machine lives here.
create table if not exists seats (
  id          text primary key,
  order_id    text not null references orders(id),
  slot_number int  not null,
  guest_id    text references guests(id),
  status      text not null check (status in ('unnamed','submitted','reviewed','badge_ready','checked_in','cancelled')),
  updated_at  timestamptz not null default now(),
  unique (order_id, slot_number)
);
-- Allowed transitions (enforce in an RPC / edge function):
--   unnamed   -> submitted          (guest portal adds a name)
--   submitted -> submitted          (guest edits; timestamped)
--   submitted -> reviewed           (staff confirms spelling/title/org)
--   reviewed  -> badge_ready        (requires table_id + seat_number)
--   badge_ready -> submitted        (guest edits after review -> badge reprint_needed if printed)
--   badge_ready -> checked_in       (event day)
--   any named -> unnamed            (guest removes / staff releases)

create table if not exists check_ins (
  id            text primary key,
  event_id      text not null references gala_events(id),
  guest_id      text references guests(id),
  order_id      text references orders(id),
  arrival_name  text,                 -- exceptions where no guest record exists yet
  method        text not null check (method in ('qr','search','exception')),
  type          text not null,        -- 'standard' or approved exception type
  checked_in_by text not null,
  note          text,
  checked_in_at timestamptz not null default now()
);

create table if not exists email_log (
  id          text primary key,
  template    text not null check (template in ('portal_link','qr_invitation','guest_list_reminder','payment_receipt')),
  to_email    text not null,
  to_name     text,
  order_id    text references orders(id),
  guest_id    text references guests(id),
  trigger     text not null,          -- 'givelively_sync', 'payment_recorded', 'staff_manual', 'scheduled'
  status      text not null check (status in ('queued','sent','opened','bounced')),
  sent_at     timestamptz
);

-- Append-only history: every change, who, when. This is the "historical ledger".
create table if not exists audit_log (
  id          bigserial primary key,
  at          timestamptz not null default now(),
  actor_type  text not null check (actor_type in ('guest_portal','staff','system')),
  actor       text not null,
  entity      text not null,          -- 'order','guest','seat','payment','check_in','email'
  entity_id   text not null,
  order_id    text,
  action      text not null,          -- e.g. 'guest.submitted', 'payment.recorded'
  from_state  text,
  to_state    text,
  guest_visible boolean not null default false,  -- shown in the guest's "Your activity" list
  summary     text not null
);

create table if not exists salesforce_sync (
  id            bigserial primary key,
  entity        text not null,        -- 'sponsor','order','payment','guest'
  entity_id     text not null,
  sf_object     text not null,        -- 'Account','Contact','Opportunity','npe01__OppPayment__c','CampaignMember'
  sf_id         text,
  status        text not null check (status in ('pending','synced','error')),
  last_synced_at timestamptz,
  error_message text
);

-- Handy views for the staff app
create or replace view v_payment_ledger as
select p.*, o.event_id, o.sponsor_id, o.tier_id, s.organization_name
from payments p join orders o on o.id = p.order_id join sponsors s on s.id = o.sponsor_id;

create or replace view v_fee_totals as
select o.event_id,
       count(*)                       as payment_count,
       sum(p.gross_amount)            as total_gross,
       sum(p.covered_fee_amount)      as total_donor_covered_fees,
       sum(p.transaction_fee_amount)  as total_processor_fees,
       sum(p.net_amount)              as total_net
from payments p join orders o on o.id = p.order_id
group by o.event_id;

-- =====================================================================
-- ROW-LEVEL SECURITY (production sketch)
--   * Guest portal never queries tables directly. It calls ONE RPC / edge
--     function:  get_portal_view(token)  and  save_portal_guest(token, slot, ...)
--     which validates the token hash + expiry and returns only: org name,
--     package, seat count, amount paid, payment date(s), balance, seats,
--     attendee fields, and guest-visible audit entries.
--     It never returns: payment method/processor/fees, internal notes,
--     relationship owner, relationship_note, other orders.
--   * Staff app: authenticated users; policies by role:
--       gala_admin            full access
--       relationship_manager  read all, write orders they own + guests
--       check_in_volunteer    read guests (name/title/org/table/seat/status)
--                             + insert check_ins only
-- =====================================================================
