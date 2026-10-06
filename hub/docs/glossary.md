# Glossary
<!-- updated Oct 6 -->

Terms used across this hub, in plain language.

```glossary
ACH | A bank-to-bank transfer. Sponsors often pay this way to avoid card fees.
Attendee Data export | Give Lively's per-guest report: one row per ticket holder, separate from the purchase report.
Audit log | A record of every change: who made it, when, and the before and after values.
Badge mail merge | The spreadsheet file used to print name tags, one row per guest, including the table number.
Comp | A complimentary ticket, for example for an elected official or community partner. Give Lively can't issue them.
Commitment | One purchase or pledge: a ticket, a sponsorship, or a comp. It holds a package and its seats.
Correction that survives re-import | A staff or sponsor edit (a "field override") that the next Give Lively import won't overwrite. Staff edits win over sponsor edits, which win over Give Lively.
Donation feed | A read-only JSON feed of Give Lively donations, switched on by creating a Zapier key. Not an API.
Give Lively | AAFE's free fundraising platform for tickets, donations, and tax receipts. The tool reads from it and never replaces it.
Import report | The summary after each import: new, updated, unchanged, needs review, and rejected rows, each with a reason, plus any Give Lively changes held back by a correction.
Line Items report | Give Lively's purchase report. Each line carries the Stripe charge ID.
Match | Deciding whether an incoming row is a guest we already have. Checked by Give Lively ID, then email with last name, then name and organization. Anything less certain goes to review.
React | The web framework the app is built with (decided Oct 5), written in TypeScript so most web developers can maintain it.
Supabase | The hosted service the prototype runs on: a Postgres database, staff sign-in, and server functions. Free plan for the demo.
Guest category | What kind of guest someone is: sponsor guest, ticket holder, comp, AAFE staff, volunteer, event staff, or government/VIP.
Seated | A guest with a guaranteed table, which comes with Champion-level sponsorship and above. Other guests are admitted without one.
Pipeline stage | Where a sponsor prospect stands: not started, reached out, in conversation, closed won, payment received, or lost.
Needs reprint | A badge already printed whose name, title, organization, or table has since changed.
Open seat | A seat in a package with no guest named yet. The dashboard groups these by relationship owner.
P0, P1, P2 | Priority. P0 must work by Demo Day; P1 should; P2 is a stretch goal.
Package | A sponsorship or ticket tier and how many seats it includes, such as Silver at $25,000 with 10 seats (AAFE's 2026 flyer).
Postgres | The database we propose: standard, free, and offered by every major host.
Relationship owner | The AAFE staff member responsible for a guest or sponsor, and the one who follows up.
Render | A hosting company. One option a future partner could consider, at an estimated base of about $13 a month.
Demo preview | The temporary copy of the prototype the team runs for Demo Day, with invented data only. Not a production system.
Exception (check-in) | Someone admitted who isn't on the list as named, such as a walk-in for a sponsor's unnamed seat. Recorded with a note and the staff member who approved it.
Gitleaks | A scanner that checks every change pushed to the repo for passwords and keys before it can merge.
Production-readiness notes | The handoff section listing what a future partner must settle before real data is used: hosting, backups, access, support, and gala-night fallback.
Restricted key | A Stripe key limited to reading payment status. Not used in the prototype; listed as a future option.
Review queue | Close matches waiting for a staff member to confirm or keep separate.
Purchase key | How the import recognizes a Give Lively purchase it has seen before: the buyer's email plus the purchase time, since AAFE's export has no transaction ID.
Tier mapping | A short list staff fill in once per gala that links each Give Lively tier name (such as "Ticket") to one of AAFE's packages.
Gala page name | The name of this year's gala page on Give Lively (such as "AAFE's 52nd Annual Gala"). Only purchases from that page are imported.
Import engine | The part of the code that reads a Give Lively file and decides what each row means, before anything is saved.
Salesforce file | An export of who actually attended, shaped for AAFE's Salesforce, live for the 2027 gala.
Seat | One place at the gala, tied to a commitment. Moves from unnamed to submitted, reviewed, badge-ready, and printed.
Sponsor link | A private, expiring web address where one sponsor names and edits their guests. No account needed.
Stretch | Work we do only if the must-haves are finished: QR tickets.
Synthetic data | Invented names and organizations used for building and the public demo. The prototype never holds real guest data.
Walk-in | A guest who arrives without being on the list. The check-in lead decides, and the tool records it.
```
