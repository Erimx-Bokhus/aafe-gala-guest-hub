# Requirements (derived from discovery, Oct 1 2026)

Priorities are the team's proposal until confirmed with AAFE. Source in brackets.

Until the final PRDs (Natalie's and Pursuit's) arrive, this file plus the hub's Requirements page ("Working PRD") stand in for them; see `hub/docs/requirements.md`.

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
- **Seating map, staff-controlled:** staff place guests and sponsor groups at tables themselves; nothing seats people automatically and guests don't choose. [Natalie's PRD, Oct 7; client: staff assign seats]
- **Salesforce push, simulated:** the results go to a stand-in endpoint in the demo, never a real Salesforce org; the Salesforce-ready file stays the real deliverable. [Natalie's PRD, Oct 7]
- **Logo / program materials status** per sponsor. [intake, call]
- **Staff-approved follow-up emails** (draft, approve, send). [call]

- **Activity log** visible to staff, and to each sponsor for their own seats. [prototype]

## Should have
- **QR-code e-tickets** emailed per guest; scan to check in on an iPad. [call: AAFE's gala lead]
- **Blank sponsor name tags** for unnamed seats. [call]
- **Multilingual sponsor form** (English, Chinese, Korean, Spanish; all four in the portal since PR #51, Oct 7; AAFE reviews the translations). [Natalie scope]
- **Relationship guests** (comps for officials, board, partners) with personal QR invites. [prototype]
- **Branding** matching aafe.org. [call]

## Later / out of scope
- Automatic seating (anything that places guests without staff). [call]
- Automatic emails. Every send is staff-approved, as AAFE's gala lead asked on the call; this changes only if AAFE's gala lead asks. [call]
- Automatic Give Lively sync (donation JSON feed / live attendee CSV) — stretch goal.
- A live connection to a real Salesforce org (the demo's push is simulated).
- Payments, checkout, Stripe, auctions, donor CRM.

## Required inputs before build

The full list, with what each unlocks, is on the hub's Discovery page ("Required inputs before build"): an AAFE approval contact, 2027 tiers and seat counts, comp categories, spreadsheet column headers, Give Lively exports (Line Items and attendee reports), badge and check-in templates, deadlines, Give Lively screen recordings, sponsor email threads, and written approval for the logo, brand kit, and event photos.

## Open questions for AAFE
- ~~**Seats per tier.**~~ Answered Oct 5 by AAFE's 2026 sponsorship flyer (`docs/decisions.md`). Only Champion and above guarantee a seat; Friend and Supporter tickets admit guests without a guaranteed table.
- **Logo and photos.** Written approval to use AAFE's logo and event photos in the prototype and at Demo Day.
- **Goals per category** for the dashboard (sponsorship dollars, tickets, attendance).
- **Edits after the deadline.** Should sponsors be able to change names for a few days after the deadline? Until AAFE answers, links stop at the deadline and staff handle late swaps.
