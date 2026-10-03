# Natalie's prototype seed data

Synthetic demonstration data built by Natalie Walker for the clickable sponsor-portal and staff-app prototypes (Oct 2, 2026). One CSV per tab of her spreadsheet, in her prototype's schema. All names, organizations, emails, payments, and notes are invented; emails use `example.org` subdomains.

Her spreadsheet says the same data lives in `database/seed.sql` and `shared/src/seed.json` in her prototype's source. When that source is shared, treat it as the canonical copy and regenerate these files from it.

## What it covers

| Tab | Rows | Notes |
| --- | --- | --- |
| `gala_events` | 4 | 2024–2026 (closed) and the 2027 demo gala with deadlines |
| `staff_users` | 5 | Admin, three relationship managers, one check-in volunteer |
| `sponsorship_tiers` | 12 | From AAFE's public 2025 flyer, incl. ad-only and comp tiers; seat counts pending AAFE |
| `sponsors` | 15 | Companies, foundations, and individual ticket buyers |
| `orders` | 27 | 15 for 2027 (Give Lively, check, ACH, wire, comp, ad-only), plus history |
| `payments` | 24 | Incl. a partial payment (installments) and a check needing review |
| `event_tables` | 11 | |
| `guests` | 48 | Mix of reviewed, submitted from the portal, and comps |
| `seats` | 70 | 22 still unnamed, including a mostly unresponsive lead sponsor |
| `check_ins` | 2 | One standard, one approved exception (walk-in for an unnamed sponsor seat) |
| `email_log` | 22 | |
| `audit_log` | 122 | |
| `salesforce_sync` | 39 | Later phase; kept for reference |

## Changes from her spreadsheet

- Sponsor phone numbers moved into the fictional `555-0100`–`555-0199` range (`(212) 555-0100` to `555-0114`).
- The spreadsheet's README tab became this file.

## Before loading into the app

This is the base demo state, not the import tests. `docs/seed-data-requirements.md` lists the extra records and Give Lively export files the import tests need. The app's loader should map these tabs onto `docs/data-model.md` and fix three things that conflict with the hard rules in `CLAUDE.md`:

- **`orders.portal_token`**: short and stored in plain text, and one is a readable slug (`acme-community-partners`). Generate random 128-bit tokens and store only their hashes (rule 6).
- **`guests.qr_token`**: sequential (`AAFE27-REL-1037`, `-1074`, …). Generate random tokens, hashed (rule 6).
- **`email_log`**: portal links marked as sent automatically after a purchase or payment. Load them as staff-approved sends; new ones start as drafts (rule 4).

Fee columns in `payments` (covered fee, processor fee, net) are kept but not used in the MVP: fee analytics is a later phase.
