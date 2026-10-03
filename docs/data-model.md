# Proposed data model (Postgres)

Draft. Revise once AAFE's spreadsheet column headers arrive, and merge with Natalie's prototype schema (below).

## Merge plan with Natalie's prototype schema

Natalie's seed data (Oct 2) uses: `gala_events`, `staff_users`, `sponsorship_tiers`, `sponsors`, `orders`, `payments`, `event_tables`, `guests`, `seats`, `check_ins`, `email_log`, `audit_log`, `salesforce_sync`.

- **Keep her entity names** so the UI and the database match: her `orders` = `commitments` here, `sponsorship_tiers` = `packages`, `guests` = attendee `contacts`, `sponsors` = purchaser `contacts`.
- **Add the import layer from this draft:** `import_runs`, `source_records`, `review_queue`, `field_overrides`. Her schema has none of these, and they are what make re-imports safe.
- **Replace `orders.portal_token`** with `sponsor_links (token_hash, expires_at)`; tokens are random and stored hashed.
- **Email log becomes a queue:** `status` gains `draft` and `approved`, and nothing sends without an approver.
- **Out of the prototype for now:** `salesforce_sync` (export file instead) and fee-analysis fields beyond amount received.

## Draft schema

```sql
staff            (id, name, email, role)              -- role: admin | staff | checkin
contacts         (id, first_name, last_name, title, organization, email, phone)
packages         (id, gala_year, name, tier, seat_count, amount_cents)

commitments      (id, purchaser_id → contacts, package_id → packages,
                  kind              -- ticket | sponsorship | comp
                  source            -- givelively | staff_entry | sponsor_form | checkin (walk-in)
                  payment_method    -- givelively | check | ach | none
                  payment_status    -- pledged | received | n/a
                  payment_date, owner_staff_id → staff,
                  logo_status, program_ad_status, created_at)

seats            (id, commitment_id → commitments,
                  attendee_id → contacts NULL,         -- NULL = unnamed seat to chase
                  table_no, badge_status,              -- draft | owner_reviewed | printed
                  ticket_token_hash,                   -- QR e-ticket (should-have); QR holds the raw token, only the hash is stored
                  checked_in_at, checked_in_by → staff)

sponsor_links    (id, commitment_id, token_hash, expires_at)

-- import / reconciliation
import_runs      (id, source, started_at, finished_at, status,
                  n_new, n_updated, n_rejected, n_review)
source_records   (id, import_run_id, source, source_id, raw jsonb,
                  UNIQUE (source, source_id))          -- re-imports never duplicate
review_queue     (id, source_record_id, candidate_contact_id, score, reason,
                  resolved_by → staff, resolution)
field_overrides  (id, entity, entity_id, field, value, set_by, set_at)  -- corrections survive imports

audit_log        (id, actor, entity, entity_id, action, before jsonb, after jsonb, at)
```

Core views:
- **Missing names:** seats where `attendee_id IS NULL`, grouped by `owner_staff_id`.
- **Ready to print:** seats with attendee and `badge_status = 'owner_reviewed'`.
- **Goal tracking:** commitments by `kind` and `payment_status` against package goals.
