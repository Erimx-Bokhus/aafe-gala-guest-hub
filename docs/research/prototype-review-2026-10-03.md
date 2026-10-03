# Review of Natalie's prototype and seed data (Oct 3, 2026)

Natalie Walker built the clickable **guest portal** and **staff app** prototypes, the **synthetic seed data** spreadsheet (13 tabs), and the **workflow diagram** (sponsor portal, staff workspace, event day, required inputs). This note records what the team is adopting from them, where they meet the hard rules in `CLAUDE.md`, and what's still open. It reviews the work against the rules; it isn't a judgment of the work, which is the clearest picture of the product the team has.

## The workflow diagram

The three lanes match the hub's flow step for step: sponsors get a private link, see their package, add and update guests; staff import or enter commitments, create seats, review sponsor updates, mark badges ready, export, and assign tables; on gala night, staff search, mark arrivals, and record who came.

Two things in it were new to the hub and are now adopted:

- **"Approved exception note" at check-in.** Walk-ins and other exceptions are recorded with a note and the staff member who approved them (`check_ins` in `docs/data-model.md`).
- **"Required inputs before build."** Merged with the materials AAFE promised on Oct 1 into one list on the hub's Discovery page. Her list added the brand kit and a named AAFE approval contact.

## Adopted into the data model

From the prototype schema and seed data, now in `docs/data-model.md` and the hub's Architecture page:

1. `gala_events` with the guest-list and materials deadlines (sponsor links expire at the guest-list deadline).
2. `required_materials` per package (logo, full- or half-page ad), which drives logo and program-ad status. Ad-only packages have 0 seats.
3. A `payments` table, so one commitment can have several payments (installments, like her Meridian example).
4. Her seat statuses (`unnamed → submitted → reviewed → badge_ready`), plus `printed` and `needs_reprint`, from her badge screen: editing a printed badge flags it for reprint.
5. `check_ins` with method (search, QR, exception), note, and approver.
6. A sponsor-visible activity feed (`audit_log.sponsor_visible`), as her portal shows.

Her import reads Give Lively's "Line Items (All)" report and skips duplicates by transaction ID. The import spec now asks AAFE's samples to confirm which report carries what: likely Line Items for purchases and payments, and the attendee report for guest names.

## Where it meets the hard rules

These are the places the prototype would need to change before it's shown publicly or becomes the build.

| Topic | In the prototype | Rule | Change |
| --- | --- | --- | --- |
| AAFE logo and event photos | The real logo and nine real event photos; one shows a real attendee's readable name badge. The footer already says "pending AAFE approval." | 8 (updated Oct 3) | Fine in the private repo and in reviews with AAFE. For Demo Day or anything public: placeholders until AAFE approves in writing, and swap or crop the name-badge photo regardless. |
| Emails | Portal links "fire automatically" after a Give Lively purchase or a recorded payment; reminders are scheduled. | 4 | Each becomes a draft in an approval queue; a staff member approves before it sends. QR invites sent by a relationship manager are already manual, which matches the rule. |
| Sponsor links | Tokens are about 8 characters, stored as plain text; one is a readable slug (`#/s/acme-community-partners`). | 6 | Random, at least 128 bits, stored hashed, expiring at the guest-list deadline. |
| QR codes | Sequential (`AAFE27-REL-1037`, `-1074`, `-1111`, …), so one code reveals the others. | 6 | Random tokens, stored hashed, one per seat. |
| Fees, Salesforce sync, live Give Lively polling, drag-and-seat chart | Built as full screens. | `requirements.md` (later phase) | Keep as concept screens for the demo story; the MVP shows amounts received, a Salesforce-ready export, CSV import, and a table number per seat. |
| Languages | English, Chinese, Spanish. | `requirements.md` | Add Korean. |

## Seed data

- **Clean.** Every person and organization is marked synthetic, and every email uses an `example.org` subdomain. Sponsor phone numbers were outside the fictional `555-0100`–`555-0199` range; the repo copy (`seed/natalie-prototype/`) moves them into it.
- **What it's good for.** A realistic base state for the demo: 15 orders for 2027 across Give Lively, check, ACH, wire, comp, and ad-only; a partial payment; a lead sponsor with 8 of 20 seats unnamed; portal submissions waiting for review; an approved walk-in exception.
- **What it doesn't cover.** The import test cases (name variants, shared inboxes, a guest under two sponsors, refunds, a second export). Those stay in `docs/seed-data-requirements.md` and get added alongside.
- **Tier seat counts** come from AAFE's 2025 flyer (Gold $25,000 = 10, Platinum $50,000 = 20); the Oct 1 call said 7 for $25,000. Pending with AAFE.
- **Guests belong to one order** in her schema, so one person under two sponsors, or across years, can't be matched. The data model keeps her names but points seats at a shared `contacts` table.

## Questions for Natalie

1. Can you share the prototype's source (the spreadsheet mentions `database/seed.sql` and `shared/src/seed.json`)? We'd rather build from it than from the exported HTML.
2. Where did the event photos come from (AAFE's site, social posts, AAFE directly)? It helps when asking for approval.
3. Any of the fee or Salesforce screens you'd want kept in the Demo Day story as "later phase" concepts?
