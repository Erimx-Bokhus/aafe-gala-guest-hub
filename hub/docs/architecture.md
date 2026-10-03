# Architecture

One standard web app and one database. A small import-and-matching module sits between Give Lively and the database, and every screen reads from the same tables. The stack is a proposal until the team records its decision the week of October 5.

```layers
Sources | Give Lively attendee export — CSV, or the live link; Give Lively donation feed — read-only JSON; Staff entry — checks, ACH, comps; Legacy spreadsheet — one-time migration
Import and matching | Parse and validate — mapped columns, clear errors; Match and dedupe — ID, then email, then name; Review queue — staff confirm close calls
Shared data | Postgres — guests, seats, sources, history; Staff sign-in — AAFE Google accounts; AI helper — optional, off by default
Screens | Staff dashboard — gaps by owner, goals; Sponsor form — private link, no account; Check-in — iPad, works offline
Outputs | Badge file — mail merge with table number; Follow-up drafts — staff approve and send; Salesforce file — who actually attended
```

## Proposed stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js with TypeScript | The team knows React and TypeScript; any web developer can maintain it |
| Database | Postgres | Standard, portable, and fits the record structure |
| Sign-in | Demo accounts with staff roles | AAFE's Google Workspace is the natural option if the tool is adopted |
| Demo preview | A free or low-cost tier on a team account | Production hosting is AAFE's decision after Demo Day; see [Hosting](#hosting) |
| Repo | Team GitHub organization | Handed to AAFE, or the partner it chooses, at handoff |

## How matching works

Each incoming row goes through the same checks, in order. The first check that answers yes decides what happens.

```decision
start: A row arrives from Give Lively, the sponsor form, or staff entry
!Has a name and a source? | Rejected, with the reason in the import report | reject
Same Give Lively ID as a guest we have? | Update that guest | update
Same email and same last name? | Update that guest | update
Same name and same organization? | Update that guest | update
Close but not certain (shared email, names swapped, other organization)? | Review queue: staff confirm or keep separate | review
else | Create a new guest | new
```

"Wei Chen" and "Chen Wei" at the same organization is a close match: it waits for a person instead of merging. Full rules, the review queue, and the test cases: [Import and matching](#import).

```notes
Matching is deliberately boring: plain rules anyone can audit, no AI deciding who is who. That matters because AAFE's draft AI policy keeps names out of AI tools.
```

Nothing merges on a guess. Every import ends with a report such as "12 new, 3 updated, 40 unchanged, 2 need review, 1 rejected." A staff or sponsor correction always wins over incoming data, and the original value is kept in the history.

## Data model

A draft until AAFE's spreadsheet column headers arrive. Arrows point from a field to the table it refers to.

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

A printed badge whose name, title, organization, or table changes goes to `needs_reprint`, so the 2026 wrong-title problem gets caught at the printer. Walk-ins and other exceptions at the door are recorded with a note and the staff member who approved them. Several of these pieces come from Natalie's prototype schema.

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

**The core query:** unnamed seats, grouped by relationship owner. That single view answers "who's missing, and who chases them."
