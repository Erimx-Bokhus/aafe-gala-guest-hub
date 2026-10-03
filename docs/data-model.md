# Proposed data model (Postgres)

Draft. Revise once AAFE's spreadsheet column headers arrive. Merged with Natalie's prototype schema and seed data (Oct 2; review in `docs/research/prototype-review-2026-10-03.md`).

## Merge plan with Natalie's prototype schema

Natalie's seed data (Oct 2) uses: `gala_events`, `staff_users`, `sponsorship_tiers`, `sponsors`, `orders`, `payments`, `event_tables`, `guests`, `seats`, `check_ins`, `email_log`, `audit_log`, `salesforce_sync`.

- **Keep her entity names** so the UI and the database match: her `orders` = `commitments` here, `sponsorship_tiers` = `packages`, `guests` = attendee `contacts`, `sponsors` = purchaser `contacts`.
- **Adopted from her schema** (Oct 3): `gala_events` with deadlines; `required_materials` per package; a `payments` table so one commitment can have several payments; her seat statuses plus a reprint flag; `check_ins` with exception notes and an approver.
- **Add the import layer from this draft:** `import_runs`, `source_records`, `review_queue`, `field_overrides`. Her schema has none of these, and they are what make re-imports safe.
- **Contacts are separate from seats.** Her `guests` rows belong to one order, so a person named by two sponsors, or seen across years, can't be matched. Here a seat points at a contact.
- **Replace `orders.portal_token`** with `sponsor_links (token_hash, expires_at)`, and her readable QR codes with `seats.ticket_token_hash`; tokens are random and stored hashed (hard rule 6).
- **Email log becomes a queue:** `status` gains `draft` and `approved`, and nothing sends without an approver (hard rule 4).
- **Out of the prototype for now:** `salesforce_sync` (export file instead), fee-analysis fields beyond amount received, and seating-chart coordinates.

## Draft schema

```sql
staff            (id, name, email, role)              -- role: admin | staff | checkin
contacts         (id, first_name, last_name, title, organization, email, phone)

gala_events      (id, year, name, event_date, venue_name, venue_address,
                  guest_list_deadline, materials_deadline,      -- sponsor links expire at guest_list_deadline
                  status)                                       -- planning | closed
packages         (id, gala_event_id → gala_events, name, tier, seat_count, amount_cents,
                  required_materials)                           -- e.g. {logo, full_page_ad}; 0 seats = advertising only

commitments      (id, gala_event_id → gala_events, purchaser_id → contacts, package_id → packages,
                  kind              -- ticket | sponsorship | comp | advertising
                  source            -- givelively | staff_entry | sponsor_form | checkin (walk-in)
                  amount_cents,                                 -- what was committed
                  payment_status    -- pledged | partially_paid | received | refunded | n/a (derived from payments)
                  owner_staff_id → staff,
                  logo_status, program_ad_status,               -- only for materials the package requires
                  created_at,
                  source_record_id → source_records NULL)       -- set when created by an import

payments         (id, commitment_id → commitments,
                  method            -- givelively | check | ach | wire
                  amount_cents, received_at,
                  reference,                                    -- Give Lively transaction ID or check number; never bank details
                  recorded_by,                                  -- staff id, or import:<run id>
                  source_record_id → source_records NULL)

seats            (id, commitment_id → commitments, slot_no,
                  attendee_id → contacts NULL,                  -- NULL = unnamed seat to chase
                  status            -- unnamed | submitted | reviewed | badge_ready | printed | needs_reprint | cancelled
                  table_no,
                  ticket_token_hash,                            -- QR e-ticket (should-have); QR holds the raw token, only the hash is stored
                  source_record_id → source_records NULL)       -- the import row this seat came from

check_ins        (id, gala_event_id → gala_events,
                  seat_id → seats NULL, commitment_id → commitments NULL,
                  arrival_name,                                 -- for walk-ins not on the list
                  method            -- search | qr | exception
                  note, approved_by → staff NULL,               -- required when method = exception
                  checked_in_by → staff, at)

sponsor_links    (id, commitment_id, token_hash, expires_at)

-- import / reconciliation
import_runs      (id, source, started_at, finished_at, status,
                  n_new, n_updated, n_unchanged, n_rejected, n_review)
source_records   (id, import_run_id, source, source_id, raw jsonb,
                  UNIQUE (source, source_id))          -- re-imports never duplicate
review_queue     (id, source_record_id, candidate_contact_id, score, reason,
                  resolved_by → staff, resolution)
field_overrides  (id, entity, entity_id, field, value, set_by, set_at)  -- corrections survive imports; set_by = staff or sponsor link

email_queue      (id, template, to_contact_id → contacts, commitment_id NULL,
                  status            -- draft | approved | sent | failed
                  approved_by → staff, sent_at)
audit_log        (id, actor, entity, entity_id, action, before jsonb, after jsonb,
                  sponsor_visible,                              -- shown in that sponsor's activity feed
                  at)
```

Seat status flow: a sponsor or import names a guest (`submitted`), the relationship owner confirms it (`reviewed`), table assigned and ready to print (`badge_ready`), then `printed`. Editing the name, title, organization, or table of a printed seat moves it to `needs_reprint`. Arrival lives in `check_ins`, not in the seat status.

Core views:
- **Missing names:** seats with `status = 'unnamed'`, grouped by the commitment's `owner_staff_id`.
- **Ready to print:** seats with `status IN ('badge_ready', 'needs_reprint')`.
- **Missing materials:** commitments whose package requires a logo or ad that isn't received.
- **Goal tracking:** commitments by `kind` and `payment_status` against goals per gala.
