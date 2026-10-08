# Requirements
<!-- reviewed 2026-10-08 Aisling -->

What the tool must do, in priority order. Bracketed tags show where each requirement came from.

## Working PRD\*
<!-- new 2026-10-06 04:16 Aisling -->
<!-- modified 2026-10-08 08:15 Aisling -->

These pages together are the team's product requirements. Natalie's two PRDs (Oct 7) are reconciled with this page; differences are in [Decisions](#decisions). Build from them; if something isn't covered here, it goes to Decisions before it gets built. <!-- modified 2026-10-08 08:15 Aisling -->

| PRD section | Where it lives now | Status <!-- new 2026-10-06 04:16 Aisling --> |
| --- | --- | --- |
| Problem and goal | [Overview](#overview); the three questions below | Settled at discovery, Oct 1 <!-- new 2026-10-06 04:16 Aisling --> |
| Users and their jobs | [Discovery](#discovery): staff, relationship managers, sponsors, the check-in desk | Settled <!-- new 2026-10-06 04:16 Aisling --> |
| Requirements, in priority order | This page: must have, should have | Settled; changes go through Decisions <!-- new 2026-10-06 04:16 Aisling --> |
| Out of scope | This page, "Later or out of scope"; [Overview](#overview), "What we will not build" | Settled <!-- new 2026-10-06 04:16 Aisling --> |
| Success measures | The three questions below; AAFE's first prototype review (Oct 15); AAFE's feedback on the full path (Oct 30); Demo Day (Nov 10) | No numeric targets yet <!-- modified 2026-10-08 08:15 Aisling --> |
| Data and AI rules | [Data and AI](#data-ai) | Settled; AAFE still to approve <!-- new 2026-10-06 04:16 Aisling --> |
| Security and keys | [`docs/keys-and-secrets.md`](https://github.com/Erimx-Bokhus/aafe-gala-guest-hub/blob/main/docs/keys-and-secrets.md): where every key lives and what enforces it | Set Oct 6 (PR #36) <!-- updated 2026-10-06 20:56 Aisling --> |
| Import rules | [Import and matching](#import) | Settled Oct 5; pre-fill reaffirmed Oct 7 (PR #58 closed) <!-- modified 2026-10-08 08:15 Aisling --> |
| Owners and timeline | [Build plan](#build-plan): two areas, components C0–C13, with who is building each part; Natalie owns the sponsor portal and approves its PRs; first prototype review with AAFE Oct 15 | Settled Oct 5; updated Oct 8 <!-- modified 2026-10-08 08:15 Aisling --> |
| Decisions and open questions | [Decisions](#decisions), including "Pending" | Updated as we go <!-- new 2026-10-06 04:16 Aisling --> |
| Risks | [Risks](#risks) | Updated as we go <!-- new 2026-10-06 04:16 Aisling --> |
| Testing | [Build plan](#build-plan), "Testing: what to add" | About 1,160 automated checks on `main`; the counts are kept in [Build plan](#build-plan.where-each-component-stands), C11 <!-- modified 2026-10-08 08:15 Aisling --> |

Natalie's two PRDs (enterprise and client-facing) were compared with this table on Oct 7, and every difference is recorded in [Decisions](#decisions). <!-- modified 2026-10-08 08:15 Aisling -->

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
- **Give Lively import** from CSV, with column mapping, duplicate detection, and source tracking. Staff corrections survive the next import. Clearly readable names in the export's guest list are pre-filled for the sponsor to confirm. [scope] <!-- modified 2026-10-07 23:27 Aisling -->
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
- **iPad check-in:** A to Z by last name, search by name, organization or sponsor, tick and check in, approved exceptions (walk-ins, unnamed sponsor seats), keeps working offline. [call; Natalie's PRD, Oct 7] <!-- new 2026-10-07 22:38 Aisling -->
- **After-gala results:** expected, arrived and no-shows; each sponsor's seats, arrivals, committed, paid and balance. [Natalie's PRD, Oct 7] <!-- new 2026-10-07 22:38 Aisling -->
- **Give Lively fee analytics:** fees and net per sponsor and in total, from the payment records. [Natalie's PRD, Oct 7] <!-- new 2026-10-07 22:38 Aisling -->
- **A seating map that staff control:** staff place guests and sponsor groups at tables themselves; nothing seats guests automatically and guests don't choose. [Natalie's PRD, Oct 7; call: staff assign seats] <!-- new 2026-10-07 22:38 Aisling -->
- **Salesforce push, simulated:** results go to a stand-in endpoint in the demo, never a real Salesforce org; the Salesforce-ready file stays the real deliverable. [Natalie's PRD, Oct 7] <!-- new 2026-10-07 22:38 Aisling -->

## Should have
<!-- updated 2026-10-05 16:51 Aisling -->

- **QR-code e-tickets** emailed to each guest and scanned on an iPad. [call]
- ~~**A check-in app** that searches by guest or sponsor, marks arrivals, and handles walk-ins and unnamed sponsor seats.~~ Now a must-have (iPad check-in), Oct 7 <!-- modified 2026-10-07 22:38 Aisling -->
- **Blank sponsor name tags** for unnamed seats. [call]
- **A multilingual sponsor form** in English, Chinese, Korean, and Spanish, reviewed by AAFE staff. [scope]
- **aafe.org branding.** [call]
- **Sponsor pipeline:** each prospect's stage (not started, reached out, in conversation, closed won, payment received, lost), the ask against the commitment, and the last two years' giving, as in AAFE's prospect tracker. [AAFE data] <!-- updated 2026-10-05 16:51 Aisling -->
- **Gala-night arrivals for sponsors:** each sponsor sees which of their guests have arrived (never the time); built switched off until AAFE approves. [team, Oct 6] <!-- modified 2026-10-07 22:38 Aisling -->
- **Relationship guests** (comps for officials, board, and partners) with personal QR invites. [prototype] <!-- updated 2026-10-06 06:12 Aisling -->

## Later or out of scope

- Automatic seating: anything that places guests without staff (the staff-controlled seating map is now a must-have) <!-- modified 2026-10-07 22:38 Aisling -->
- Automatic emails: every email waits for staff approval, as Sarah asked; this changes only if Sarah asks <!-- new 2026-10-07 22:38 Aisling -->
- Automatic Give Lively sync (exists in Natalie's backend; not part of the Demo Day path, which uses the file upload) <!-- modified 2026-10-06 06:12 Aisling -->
- A live connection to a real Salesforce org (the demo's push is simulated) <!-- modified 2026-10-07 22:38 Aisling -->
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
