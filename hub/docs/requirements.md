# Requirements

What the tool must do, in priority order. Bracketed tags show where each requirement came from.

## The three questions the dashboard must answer

From AAFE's intake form, for staff and for the Demo Day mock investor:

1. Who is planning to attend, and have we received all their information, payment, and materials?
2. For each guest, who on AAFE staff owns that relationship?
3. How are we tracking to goal on sponsorships, tickets, and other categories?

## Must have for Demo Day

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

## Should have

- **QR-code e-tickets** emailed to each guest and scanned on an iPad. [call]
- **A check-in app** that searches by guest or sponsor, marks arrivals, and handles walk-ins and unnamed sponsor seats. [call]
- **Blank sponsor name tags** for unnamed seats. [call]
- **A multilingual sponsor form** in English, Chinese, Korean, and Spanish, reviewed by AAFE staff. [scope]
- **aafe.org branding.** [call]

## Later or out of scope

- Seating chart builder
- Automatic Give Lively sync (stretch)
- Direct Salesforce integration
- Payments, checkout, auctions, donor CRM
- Production hosting and real guest data (AAFE's decision after Demo Day)

## Edge cases to design for

- A sponsor swaps guests after badges are printed
- One person is both the sponsor contact and an attendee
- A guest is linked to two sponsors
- Cancellations and refunds
- Honorees, elected officials, and other VIPs
- Table capacity limits
- Walk-ins who say they're "with" a sponsor that never sent names
