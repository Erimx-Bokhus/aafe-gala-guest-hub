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
commitments @2,1 | purchaser_id → contacts; package_id → packages; kind: ticket, sponsorship, comp; source; payment_method; payment_status; owner_staff_id → staff; source_record_id → source_records
packages @3,1 | gala_year; name; tier; seat_count; amount_cents
staff @1,2 | name; email; role: admin, staff, check-in
seats @2,2 | commitment_id → commitments; attendee_id → contacts (empty = open seat); table_no; badge_status; ticket_token_hash; checked_in_at; source_record_id → source_records
sponsor_links @3,2 | commitment_id → commitments; token_hash; expires_at
--- Import and history
import_runs | source; status; n_new; n_updated; n_unchanged; n_rejected; n_review
source_records | import_run_id → import_runs; source; source_id; raw
review_queue | source_record_id → source_records; candidate_contact_id → contacts; score; resolution
field_overrides | entity; field; value; set_by (staff or sponsor link)
audit_log | actor → staff; entity; action; before; after
```

<details>
<summary>Full column list</summary>

```sql
staff            (id, name, email, role)            -- admin | staff | checkin
contacts         (id, first_name, last_name, title, organization, email, phone)
packages         (id, gala_year, name, tier, seat_count, amount_cents)

commitments      (id, purchaser_id, package_id,
                  kind            -- ticket | sponsorship | comp
                  source          -- givelively | staff_entry | sponsor_form | checkin (walk-in)
                  payment_method  -- givelively | check | ach | none
                  payment_status  -- pledged | received | refunded | n/a
                  payment_date, owner_staff_id, logo_status, program_ad_status,
                  source_record_id)

seats            (id, commitment_id, attendee_id NULL,   -- NULL = unnamed seat
                  table_no,
                  badge_status    -- draft | owner_reviewed | printed | cancelled
                  ticket_token_hash, checked_in_at, source_record_id)

sponsor_links    (id, commitment_id, token_hash, expires_at)
import_runs      (id, source, started_at, status, n_new, n_updated, n_unchanged, n_rejected, n_review)
source_records   (id, import_run_id, source, source_id, raw, UNIQUE (source, source_id))
review_queue     (id, source_record_id, candidate_contact_id, score, resolution)
field_overrides  (id, entity, entity_id, field, value, set_by, set_at)
audit_log        (id, actor, entity, entity_id, action, before, after, at)
```

</details>

**The core query:** seats with no attendee, grouped by relationship owner. That single view answers "who's missing, and who chases them."
