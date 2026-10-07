# Requirements
<!-- reviewed 2026-10-06 Aisling -->

What the tool must do, in priority order. Bracketed tags show where each requirement came from.

## Working PRD (until the final PRDs arrive)\*
<!-- new 2026-10-06 04:16 Aisling -->

Until Natalie's team PRD and Pursuit's PRD are final, these pages together are the team's product requirements (Natalie started drafting the team PRD on Oct 6). Build from them; if something isn't covered here, it goes to [Decisions](#decisions) before it gets built. <!-- modified 2026-10-06 20:41 Aisling -->

| PRD section | Where it lives now | Status <!-- new 2026-10-06 04:16 Aisling --> |
| --- | --- | --- |
| Problem and goal | [Overview](#overview); the three questions below | Settled at discovery, Oct 1 <!-- new 2026-10-06 04:16 Aisling --> |
| Users and their jobs | [Discovery](#discovery): staff, relationship managers, sponsors, the check-in desk | Settled <!-- new 2026-10-06 04:16 Aisling --> |
| Requirements, in priority order | This page: must have, should have | Settled; changes go through Decisions <!-- new 2026-10-06 04:16 Aisling --> |
| Out of scope | This page, "Later or out of scope"; [Overview](#overview), "What we will not build" | Settled <!-- new 2026-10-06 04:16 Aisling --> |
| Success measures | The three questions below; AAFE's feedback on the full path (Oct 30); Demo Day (Nov 10) | No numeric targets yet <!-- new 2026-10-06 04:16 Aisling --> |
| Data and AI rules | [Data and AI](#data-ai) | Settled; AAFE still to approve <!-- new 2026-10-06 04:16 Aisling --> |
| Security and keys | [`docs/keys-and-secrets.md`](https://github.com/Erimx-Bokhus/aafe-gala-guest-hub/blob/main/docs/keys-and-secrets.md): where every key lives and what enforces it | Set Oct 6 (PR #36) <!-- updated 2026-10-06 20:56 Aisling --> |
| Import rules | [Import and matching](#import) | Settled Oct 5; three choices awaiting Natalie's review <!-- modified 2026-10-06 06:12 Aisling --> |
| Owners and timeline | [Build plan](#build-plan): two pairs, components C0–C12; Natalie owns the sponsor portal and approves its PRs; prototype demonstration Oct 19 | Settled Oct 5; updated Oct 6 <!-- modified 2026-10-06 20:41 Aisling --> |
| Decisions and open questions | [Decisions](#decisions), including "Pending" | Updated as we go <!-- new 2026-10-06 04:16 Aisling --> |
| Risks | [Risks](#risks) | Updated as we go <!-- new 2026-10-06 04:16 Aisling --> |
| Testing | [Build plan](#build-plan), "Testing: what to add" | About 1,110 automated checks on `main` (940 backend, 116 import engine, 56 app, including 20 sign-in tests) <!-- modified 2026-10-07 19:15 Aisling --> |

When the final PRDs arrive, we compare them with this table and record every difference in [Decisions](#decisions). <!-- new 2026-10-06 04:16 Aisling -->

\* **Why it's set up this way.** The build had to start before a PRD existed. The discovery call with AAFE was October 1, and AAFE's spreadsheet, Give Lively export, and tier flyer arrived October 5, the same week the stack was chosen and building began. Demo Day (November 10) didn't move, so instead of waiting, the team built from what AAFE actually said and sent. Every requirement on this page carries its source in brackets: the call, the intake form, the project scope, or AAFE's data. <!-- new 2026-10-06 04:16 Aisling -->

## The three questions the dashboard must answer

From AAFE's intake form, for staff and for the Demo Day mock investor:

1. Who is planning to attend, and have we received all their information, payment, and materials?
2. For each guest, who on AAFE staff owns that relationship?
3. How are we tracking to goal on sponsorships, tickets, and other categories?

## Must have for Demo Day
<!-- updated 2026-10-05 16:51 Aisling -->

- **Commitments and seats.** Every purchase or pledge has a package and a seat count; each seat is named or open. [call]
- **Manual entry** for checks, ACH, and verbal pledges, with payment method, date, and status. [call]
- **Give Lively import** from CSV, with column mapping, duplicate detection, and source tracking. Staff corrections survive the next import. [scope]
- **Sponsor guest form** on a private link: the right number of slots per package, editable until AAFE's deadline, no account needed. [call, top priority]
- **Purchaser and attendee kept separate.** [intake]
- **A relationship owner on every guest**, with missing information grouped by owner. [intake]
- **Owner review before printing** badges, to catch titles and affiliations. [call]
- **Comps** tracked without payment; relationship managers can issue them. [call]
- **Exports:** a badge mail-merge file with table numbers, a check-in list, and a Salesforce-ready attendee file. [call]
- **Logo and program-ad status** for each sponsor. [intake, call]
- **Follow-up emails** drafted by the tool and approved by staff. [call]
- **A category on every guest:** sponsor guest, ticket holder, comp, AAFE staff, volunteer, event staff, or government/VIP. [AAFE data] <!-- updated 2026-10-05 16:51 Aisling -->
- **Seated or admitted.** Champion and above guarantee a table; Friend and Supporter tickets admit guests without one, so the guest list and badges show the difference. [AAFE data] <!-- updated 2026-10-05 16:51 Aisling -->
- **Activity log** visible to staff, and to each sponsor for their own seats. [prototype] <!-- updated 2026-10-06 06:12 Aisling -->

## Should have
<!-- updated 2026-10-05 16:51 Aisling -->

- **QR-code e-tickets** emailed to each guest and scanned on an iPad. [call]
- **A check-in app** that searches by guest or sponsor, marks arrivals, and handles walk-ins and unnamed sponsor seats. [call]
- **Blank sponsor name tags** for unnamed seats. [call]
- **A multilingual sponsor form** in English, Chinese, Korean, and Spanish, reviewed by AAFE staff. [scope]
- **aafe.org branding.** [call]
- **Sponsor pipeline:** each prospect's stage (not started, reached out, in conversation, closed won, payment received, lost), the ask against the commitment, and the last two years' giving, as in AAFE's prospect tracker. [AAFE data] <!-- updated 2026-10-05 16:51 Aisling -->
- **Gala-night arrivals for sponsors:** each sponsor sees which of their guests have arrived; AAFE reviews the privacy side first. [team, Oct 6] <!-- updated 2026-10-06 20:41 Aisling -->
- **Relationship guests** (comps for officials, board, and partners) with personal QR invites. [prototype] <!-- updated 2026-10-06 06:12 Aisling -->

## Later or out of scope

- Seating chart builder
- Automatic Give Lively sync (exists in Natalie's backend; not part of the Demo Day path, which uses the file upload) <!-- modified 2026-10-06 06:12 Aisling -->
- Direct Salesforce integration
- Payments, checkout, auctions, donor CRM
- Logo and program-ad uploads in the sponsor portal: the requirement is to track their status <!-- updated 2026-10-06 20:41 Aisling -->
- Paying or downloading invoices in the portal: payments stay with Give Lively and AAFE's invoices <!-- updated 2026-10-06 20:41 Aisling -->
- Production hosting and real guest data (AAFE's decision after Demo Day)

## Edge cases to design for

- A sponsor swaps guests after badges are printed
- One person is both the sponsor contact and an attendee
- A guest is linked to two sponsors
- Cancellations and refunds
- Honorees, elected officials, and other VIPs
- Table capacity limits
- Walk-ins who say they're "with" a sponsor that never sent names
