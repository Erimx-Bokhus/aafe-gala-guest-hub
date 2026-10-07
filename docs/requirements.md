# Requirements (derived from discovery, Oct 1 2026)

Priorities are the team's proposal until confirmed with AAFE. Source in brackets.

Until the final PRDs (Natalie's and Pursuit's) arrive, this file plus the hub's Requirements page ("Working PRD") stand in for them; see `hub/docs/requirements.md`.

## Must have (Demo Day)
- **Commitments and seats.** Each purchase or pledge has a package level and a seat entitlement; seats are named or open. [call]
- **Manual entry** for check, ACH, and verbal pledges, with payment method, date, and status label. [call]
- **Give Lively import** by CSV with column mapping, duplicate detection, and source tracking; staff corrections survive re-import. [scope]
- **Sponsor guest form** via private link: correct number of slots per package, editable until AAFE's deadline, no account. [call: #1 priority]
- **Purchaser vs. attendee** kept separate. [intake]
- **Relationship owner** on every guest; missing-information view grouped by owner. [intake]
- **Relationship-owner review before printing** badges (titles, affiliations). [call: 2026 errors]
- **Comps** tracked without payment; relationship managers can issue them. [call]
- **Exports:** badge mail-merge CSV (incl. table number), check-in list, Salesforce-ready attendee export. [call]
- **Logo / program materials status** per sponsor. [intake, call]
- **Staff-approved follow-up emails** (draft, approve, send). [call]

- **Activity log** visible to staff, and to each sponsor for their own seats. [prototype]

## Should have
- **QR-code e-tickets** emailed per guest; scan to check in on an iPad. [call: Sarah]
- **Check-in app:** search by name or sponsor, mark arrived, handle walk-ins and unnamed sponsor seats, record attendance. [call]
- **Blank sponsor name tags** for unnamed seats. [call]
- **Multilingual sponsor form** (English, Chinese, Korean, Spanish; the prototype has three, Korean is missing). [Natalie scope]
- **Relationship guests** (comps for officials, board, partners) with personal QR invites. [prototype]
- **Branding** matching aafe.org. [call]

## Later / out of scope
- Seating chart builder (staff-assigned table numbers are enough for now). [call] The prototype's drag-and-seat chart is a later phase.
- Processor-fee analytics ("net to AAFE"). Show amounts received; fee math is later. [prototype]
- Automatic emails. Every send is staff-approved. [call]
- Automatic Give Lively sync (donation JSON feed / live attendee CSV) — stretch goal.
- Direct Salesforce sync (a Salesforce-ready export file first; the prototype's sync screen is a later phase).
- Payments, checkout, Stripe, auctions, donor CRM.

## Required inputs before build

The full list, with what each unlocks, is on the hub's Discovery page ("Required inputs before build"): an AAFE approval contact, 2027 tiers and seat counts, comp categories, spreadsheet column headers, Give Lively exports (Line Items and attendee reports), badge and check-in templates, deadlines, Give Lively screen recordings, sponsor email threads, and written approval for the logo, brand kit, and event photos.

## Open questions for AAFE
- ~~**Seats per tier.**~~ Answered Oct 5 by AAFE's 2026 sponsorship flyer (`docs/decisions.md`). Only Champion and above guarantee a seat; Friend and Supporter tickets admit guests without a guaranteed table.
- **Logo and photos.** Written approval to use AAFE's logo and event photos in the prototype and at Demo Day.
- **Goals per category** for the dashboard (sponsorship dollars, tickets, attendance).
