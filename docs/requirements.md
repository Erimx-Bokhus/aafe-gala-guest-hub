# Requirements (derived from discovery, Oct 1 2026)

Priorities are the team's proposal until confirmed with AAFE. Source in brackets.

Until the final PRDs (Natalie's and Pursuit's) arrive, this file plus the hub's Requirements page ("Working PRD") stand in for them; see [`docs/requirements.md` in the hub repo](https://github.com/Erimx-Bokhus/aafe-gala-guest-project-hub/blob/main/docs/requirements.md).

## Must have (Demo Day)
- **Commitments and seats.** Each purchase or pledge has a package level and a seat entitlement; seats are named or open. [call]
- **Manual entry** for check, ACH, and verbal pledges, with payment method, date, and status label. [call]
- **Give Lively import** by CSV with column mapping, duplicate detection, and source tracking; staff corrections survive re-import. Clearly readable names in the export's guest list are pre-filled for the sponsor to confirm. [scope]
- **Sponsor guest form** via private link: correct number of slots per package, editable until AAFE's deadline, no account. [call: #1 priority]
- **Purchaser vs. attendee** kept separate. [intake]
- **Relationship owner** on every guest; missing-information view grouped by owner. [intake]
- **Relationship-owner review before printing** badges (titles, affiliations). [call: 2026 errors]
- **Comps** tracked without payment; relationship managers can issue them. [call]
- **Exports:** badge mail-merge CSV (incl. table number), check-in list, Salesforce-ready attendee export. [call]
- **iPad check-in:** A to Z by last name, search by name, organization or sponsor, tick and check in, approved exceptions (walk-ins, unnamed sponsor seats), keeps working offline. Raised to must-have Oct 7. [call; Natalie's PRD]
- **After-gala results:** expected, arrived and no-shows; each sponsor's seats, arrivals, committed, paid and balance. [Natalie's PRD, Oct 7]
- **Give Lively fee analytics:** fees and net per sponsor and in total, from the payment records. [Natalie's PRD, Oct 7]
- **Table per guest, staff-controlled:** staff pick each guest's table in the guest list, for the badge; nothing seats people automatically and guests don't choose. Replaces the seating map (decided Oct 17). [Natalie's PRD, Oct 7; client: staff assign seats, the table number on the badge is what matters]
- **Salesforce push, simulated:** the results go to a stand-in endpoint in the demo, never a real Salesforce org; the Salesforce-ready file stays the real deliverable. [Natalie's PRD, Oct 7]
- **Logo / program materials status** per sponsor. [intake, call]
- **Staff-approved follow-up emails** (draft, approve, send). [call]

- **Activity log:** gala admins see the whole change log; relationship managers see what sponsors changed in their portal and what Give Lively recorded; each sponsor sees their own seats' activity in the portal (decided Oct 22). [prototype]

## Should have
- **QR-code e-tickets** emailed per guest; scan to check in on an iPad. [call: Sarah]
- **Blank sponsor name tags** for unnamed seats. [call]
- **Multilingual sponsor form** (English, Chinese, Korean, Spanish; all four built in the portal since PR #51, Oct 7. English only for v1, decided Oct 24, PR #241: the other three stay hidden until a native speaker on AAFE's staff reviews them). [Natalie scope]
- **Relationship guests** (comps for officials, board, partners) with personal QR invites. [prototype]
- **Branding** matching aafe.org. [call]

## Later / out of scope
- Automatic seating (anything that places guests without staff). [call]
- Automatic emails. Every send is staff-approved, as Sarah asked on the call; this changes only if Sarah asks. [call]
- ~~Automatic Give Lively sync (donation JSON feed / live attendee CSV) — stretch goal.~~ Built: the sync reads Give Lively every 15 minutes on both projects since Oct 18 (`prototype/database/cron.sql`, PR #209), and Pull now runs it at once.
- A live connection to AAFE's real Salesforce during the capstone. The sync is written for AAFE's NPSP (in scope since Oct 19, PRs #210, #245, #250, #252), but the demo sends to a stand-in org; the first real sync waits for Idlewild Partners' answers, in a sandbox (`docs/salesforce-setup.md`).
- Payments, checkout, Stripe, auctions, donor CRM.

## Required inputs before build

The full list, with what each unlocks, is on the hub's Discovery page ("Inputs from AAFE"): an AAFE approval contact, 2027 tiers and seat counts, comp categories, spreadsheet column headers, Give Lively exports (Line Items and attendee reports), badge and check-in templates, deadlines, Give Lively screen recordings, sponsor email threads, and AAFE’s brand kit.

## Open questions for AAFE
- ~~**Seats per tier.**~~ Answered Oct 5 by AAFE's 2026 sponsorship flyer (`docs/decisions.md`). Only Champion and above guarantee a seat; Friend and Supporter tickets admit guests without a guaranteed table.
- **Goals per category** for the dashboard (sponsorship dollars, tickets, attendance).
- **Edits after the deadline.** Should sponsors be able to change names for a few days after the deadline? Until AAFE answers, links stop at the deadline and staff handle late swaps.
- **Staff changes for relationship managers.** Should a relationship manager see staff changes on their own sponsors (a payment another staff member recorded, an email sent)? Until AAFE answers, only gala admins read the change log (Oct 22). To ask at the next review (Natalie's review of #234).
