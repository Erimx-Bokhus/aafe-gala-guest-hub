# Architecture
<!-- reviewed 2026-10-08 Aisling -->

Three small web apps (staff, sponsor portal, iPad check-in) on one database. A small import-and-matching module sits between Give Lively and the database, and every screen reads from the same tables. The stack was decided October 5: React and TypeScript on Supabase. <!-- modified 2026-10-08 08:15 Aisling -->

```layers
Sources | Give Lively attendee export — CSV, or the live link; Give Lively donation feed — read-only JSON; Staff entry — checks, ACH, comps; Legacy spreadsheet — one-time migration
Import and matching | Parse and validate — columns found by name, clear errors; Match and dedupe — purchase key, then email and last name, then name; Review queue — staff confirm close calls
Shared data | Postgres — guests, seats, sources, history; Staff sign-in — emailed link (Supabase Auth), Google later; No AI in the first version
Screens | Staff dashboard — gaps by owner, goals; Sponsor form — private link, no account; Check-in — iPad, works offline
Outputs | Badge file — mail merge with table number; Follow-up drafts — staff approve and send; Salesforce file — who actually attended
```

## What's built
<!-- new 2026-10-05 22:58 Aisling -->

As of October 8, in the team repo. The build follows Natalie's Supabase schema. Test counts are kept in [Build plan](#build-plan.where-each-component-stands), C11. <!-- modified 2026-10-08 08:15 Aisling -->

| Part | Where | What it does <!-- new 2026-10-05 22:58 Aisling --> |
| --- | --- | --- |
| Import engine | `import-engine/` | Reads AAFE's Give Lively export, converts times to UTC, splits free-text guest lists, matches buyers and guests, builds the import report. Plain TypeScript, no screens, 116 tests <!-- modified 2026-10-08 08:15 Aisling --> |
| Database and server functions | `prototype/database/` | Natalie's schema and seed, plus the import tables (`import_runs`, `import_review`, `tier_mappings`). Every staff action goes through a function that writes the history <!-- new 2026-10-05 22:58 Aisling --> |
| Email approval queue | `prototype/database/backend.sql` | Portal links, QR invitations, guest-list reminders and payment confirmations wait as drafts until a staff member approves each one, with its sponsor, seats and payment shown (PR #44) <!-- new 2026-10-08 08:15 Aisling --> |
| Offline check-in | `prototype/shared/src/offlineCheckin.ts`, `checkinSync.ts` | The iPad keeps its door list, queues check-ins while offline, and sends them later; the first arrival wins (PRs #46, #60) <!-- new 2026-10-08 08:15 Aisling --> |
| Sponsor pipeline | `prototype/database/backend.sql` | AAFE's stages from reached out to payment received, the ask against the commitment, and the last two galas' giving (PR #48) <!-- new 2026-10-08 08:15 Aisling --> |
| Sponsor arrivals | `prototype/database/backend.sql` | Sponsors can see which of their guests have arrived (arrived or not, never a time); switched off until AAFE approves (PR #49) <!-- new 2026-10-08 08:15 Aisling --> |
| Translation sheet | `prototype/docs/translations/` | Every phrase in English, 中文, 한국어 and Español for AAFE to review; no silent fallback to English (PR #50) <!-- new 2026-10-08 08:15 Aisling --> |
| Demo data sets | `prototype/database/generate_full_seed.py`, `prototype/scripts/load-demo-data.mjs` | Small, Full as sent, and Full fixed, one at a time: a picker in the staff app and portal, `npm run db:load` for Supabase (PR #66) <!-- new 2026-10-08 08:15 Aisling --> |
| Server jobs | `prototype/supabase/functions/` | Give Lively sync (this gala's page only) and the email sender (staff-approved only) <!-- new 2026-10-05 22:58 Aisling --> |
| Exports | `prototype/database/backend.sql` | Badge file, printed check-in list, and Salesforce attendee file: role-checked, logged, and returned as rows for the staff app's CSV download (PR #34) <!-- updated 2026-10-06 20:41 Aisling --> |
| Key protection | `prototype/shared/vite/`, `prototype/scripts/make_open_files.py`, `.gitleaks.toml` | A build stops if a secret key would reach the browser; demo files can't carry the project address; the secret scan knows Supabase's keys. Where every key lives: `docs/keys-and-secrets.md` (PR #36). Covers the staff app and portal; the iPad app doesn't have it yet <!-- modified 2026-10-08 08:15 Aisling --> |
| Staff app | `prototype/staff-app/` | Natalie's staff workspace; real sign-in merged (Cornell, PR #27): an emailed link when Supabase keys are set, demo accounts otherwise; pages still on demo data <!-- modified 2026-10-07 19:15 Aisling --> |
| Sponsor portal | `prototype/guest-portal/` | Natalie's guest-name form on a private link; English, 中文, 한국어 (Antonin, PR #51), Español. Antonin's design prototype (his branch) is the reference for tier layout and gala-night arrivals <!-- modified 2026-10-07 19:15 Aisling --> |
| iPad check-in app | `prototype/checkin-app/` | Natalie's door app for volunteers: tonight's gala only, A to Z, search, check in several at once with undo, QR scan, approved exceptions, offline queue (PR #56; sync fix #60; invented organizations #62). Runs on demo data with a local sync server until it's connected to Supabase <!-- new 2026-10-08 08:15 Aisling --> |
| Checks on pull requests | `.github/workflows/` | All six run on every PR and are required on `main`: secret scan, real-data guard, backend tests, import engine tests, app tests and build, and server function type-check (PR #40). Test counts: [Build plan](#build-plan.where-each-component-stands), C11 <!-- modified 2026-10-08 08:15 Aisling --> |

**Secrets are stored as hashes.** Sponsor links and QR e-tickets are random, shown only in the email that carries them, and stored only as hashes. A QR code belongs to one seat and stops working the morning after the gala, or as soon as the seat gets a different guest. Fingerprints are SHA-256; QR codes carry 128 random bits, sponsor links 192 (Oct 8). <!-- updated 2026-10-08 08:15 Aisling -->

## Stack
<!-- modified 2026-10-05 16:51 Aisling -->

| Layer | Choice | Why |
| --- | --- | --- |
| App | React + TypeScript, built with Vite and styled with Tailwind | Matches Natalie's working prototype; any web developer can maintain it <!-- modified 2026-10-05 16:51 Aisling --> |
| Backend | Supabase: Postgres, sign-in, and server functions (Give Lively sync, email sending) | One managed service; free plan for the demo <!-- modified 2026-10-05 16:51 Aisling --> |
| Database | Postgres, hosted by Supabase | Standard, portable, and fits the record structure <!-- modified 2026-10-05 16:51 Aisling --> |
| Sign-in | Supabase Auth with staff roles: an emailed sign-in link (PR #27, merged Oct 7); demo accounts when no Supabase keys are set | AAFE's Google accounts can plug in if the tool is adopted <!-- modified 2026-10-07 19:15 Aisling --> |
| Demo preview | Vercel's free plan (three projects) and Supabase's free plan; for now the backend runs in Aisling's test project, and the demo's project and owner are still to agree | Production hosting is AAFE's decision after Demo Day; see [Hosting](#hosting) <!-- modified 2026-10-08 08:15 Aisling --> |
| Repo | Team GitHub organization on GitHub Team, with `main` protected | Handed to AAFE, or the partner it chooses, at handoff <!-- modified 2026-10-05 16:51 Aisling --> |

## How matching works

Every incoming row goes through the same plain checks, in order, and a close call waits in a review queue for a person instead of merging. The checks, the review queue, and the test cases are on [Import and matching](#import). <!-- removed 2026-10-08 08:15 Aisling The matching tree: it differed from Import's, which is the one kept -->

```notes
Matching is deliberately boring: plain rules anyone can audit, no AI deciding who is who. That matters because AAFE's draft AI policy keeps names out of AI tools.
```

Nothing merges on a guess. Every import ends with a report such as "12 new, 3 updated, 40 unchanged, 2 need review, 1 rejected." A staff or sponsor correction always wins over incoming data, and the original value is kept in the history. <!-- modified 2026-10-03 11:56 Aisling -->

## Data model
<!-- updated 2026-10-05 16:51 Aisling -->

**Early design, Oct 3.** The build follows Natalie's schema instead, with different table names: `guests`, `orders`, `sponsorship_tiers`, `seats`, `payments`, `event_tables`, `check_ins`, `email_log`, `audit_log`, plus `import_runs`, `import_review`, `tier_mappings` and `sponsor_prospects` (`prototype/database/schema.sql` and `backend.sql`; merge notes in `docs/data-model.md`). The ideas below carried over: one seat per guest slot, sources kept on every record, corrections that survive the next import, and hashed links. <!-- modified 2026-10-08 08:15 Aisling -->

AAFE's real spreadsheet (received Oct 5) adds three fields to plan for: a guest category, whether a seat is guaranteed or admittance only, and a sponsor's pipeline stage. Arrows point from a field to the table it refers to. <!-- modified 2026-10-05 16:51 Aisling -->

```erd
contacts @1,1 | first_name; last_name; title; organization; email; phone
commitments @2,1 | gala_event_id → gala_events; purchaser_id → contacts; package_id → packages; kind: ticket, sponsorship, comp, advertising; source; amount; payment_status; owner_staff_id → staff; logo and ad status
gala_events @3,1 | year; event_date; venue; guest_list_deadline; materials_deadline
staff @1,2 | name; email; role: admin, staff, check-in
seats @2,2 | commitment_id → commitments; attendee_id → contacts (empty = open seat); status: unnamed, submitted, reviewed, badge_ready, printed, needs_reprint; table_no; ticket_token_hash
packages @3,2 | gala_event_id → gala_events; name; seat_count; amount; required_materials
check_ins @1,3 | checked_in_by → staff; seat_id → seats; commitment_id → commitments; arrival_name (walk-ins); method: search, QR, exception; note; approved_by
payments @3,3 | commitment_id → commitments; method: Give Lively, check, ACH, wire; amount; received_at; reference
--- Links, import, and history
sponsor_links | commitment_id → commitments; token_hash; expires_at
email_queue | to_contact_id → contacts; template; status: draft, approved, sent; approved_by → staff
import_runs | source; status; n_new; n_updated; n_unchanged; n_rejected; n_review
source_records | import_run_id → import_runs; source; source_id; raw
review_queue | source_record_id → source_records; candidate_contact_id → contacts; score; resolution
field_overrides | entity; field; value; set_by (staff or sponsor link)
audit_log | actor → staff; entity; action; before; after; sponsor_visible
```

A printed badge whose name, title, organization, or table changes goes to `needs_reprint`, so the 2026 wrong-title problem gets caught at the printer. Walk-ins and other exceptions at the door are recorded with a note and the staff member who approved them. Several of these pieces come from Natalie's prototype schema. <!-- updated 2026-10-03 12:36 Aisling -->

<details>
<summary>Full column list</summary>

```sql
staff            (id, name, email, role)            -- admin | staff | checkin
contacts         (id, first_name, last_name, title, organization, email, phone)
gala_events      (id, year, name, event_date, venue_name, venue_address,
                  guest_list_deadline, materials_deadline, status)
packages         (id, gala_event_id, name, tier, seat_count, amount_cents,
                  required_materials)               -- e.g. {logo, full_page_ad}

commitments      (id, gala_event_id, purchaser_id, package_id,
                  kind            -- ticket | sponsorship | comp | advertising
                  source          -- givelively | staff_entry | sponsor_form | checkin (walk-in)
                  amount_cents,
                  payment_status  -- pledged | partially_paid | received | refunded | n/a
                  owner_staff_id, logo_status, program_ad_status, source_record_id)

payments         (id, commitment_id,
                  method          -- givelively | check | ach | wire
                  amount_cents, received_at, reference, recorded_by, source_record_id)

seats            (id, commitment_id, slot_no, attendee_id NULL,   -- NULL = unnamed seat
                  status          -- unnamed | submitted | reviewed | badge_ready | printed | needs_reprint | cancelled
                  table_no, ticket_token_hash, source_record_id)

check_ins        (id, gala_event_id, seat_id NULL, commitment_id NULL, arrival_name,
                  method          -- search | qr | exception
                  note, approved_by, checked_in_by, at)

sponsor_links    (id, commitment_id, token_hash, expires_at)
email_queue      (id, template, to_contact_id, commitment_id, status, approved_by, sent_at)
import_runs      (id, source, started_at, status, n_new, n_updated, n_unchanged, n_rejected, n_review)
source_records   (id, import_run_id, source, source_id, raw, UNIQUE (source, source_id))
review_queue     (id, source_record_id, candidate_contact_id, score, resolution)
field_overrides  (id, entity, entity_id, field, value, set_by, set_at)
audit_log        (id, actor, entity, entity_id, action, before, after, sponsor_visible, at)
```

</details>

**The core query:** unnamed seats, grouped by relationship owner. That single view answers "who's missing, and who chases them." <!-- modified 2026-10-03 12:36 Aisling -->
