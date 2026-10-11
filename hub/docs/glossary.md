# Glossary
<!-- updated 2026-10-05 22:58 Aisling -->
<!-- reviewed 2026-10-09 Aisling -->

Terms used across this hub, in plain language.

```glossary
ACH | A bank-to-bank transfer. Sponsors often pay this way to avoid card fees.
Attendee Data export | Give Lively's per-guest report: one row per ticket holder, separate from the purchase report.
Audit log | A record of every change: who made it, when, and the before and after values.
Badge mail merge | The spreadsheet file used to print name tags, one row per guest, including the table number.
Comp | A complimentary ticket, for example for an elected official or community partner. Give Lively can't issue them.
Commitment | One purchase or pledge: a ticket, a sponsorship, or a comp. It holds a package and its seats.
Correction that survives re-import | A staff or sponsor edit (a "field override") that the next Give Lively import won't overwrite. Staff edits win over sponsor edits, which win over Give Lively. <!-- modified 2026-10-03 11:56 Aisling -->
Donation feed | A read-only JSON feed of Give Lively donations, switched on by creating a Zapier key. Not an API.
Give Lively | AAFE's free fundraising platform for tickets, donations, and tax receipts. The tool reads from it and never replaces it.
Import report | The summary after each import: new, updated, unchanged, needs review, and rejected rows, each with a reason, plus any Give Lively changes held back by a correction. <!-- modified 2026-10-03 11:56 Aisling -->
Line Items report | Give Lively's purchase report. Each line carries the Stripe charge ID.
Match | Deciding whether an incoming row is a guest we already have. Checked by purchase key (buyer email + purchase time), then email with last name, then name and organization. Anything less certain goes to review. <!-- modified 2026-10-06 05:50 Aisling -->
React | The web framework the app is built with (decided Oct 5), written in TypeScript so most web developers can maintain it. <!-- modified 2026-10-05 16:51 Aisling -->
Supabase | The hosted service the prototype runs on: a Postgres database, staff sign-in, and server functions. Free plan for the demo. <!-- modified 2026-10-05 16:51 Aisling -->
Anon key | The Supabase key that ships inside the apps. Public by design: it can only do what the access rules allow. <!-- new 2026-10-06 20:41 Aisling -->
Service role key | The Supabase key that bypasses every access rule. It stays in Supabase's encrypted secret store and never goes in an app, a file, or a chat. <!-- new 2026-10-06 20:41 Aisling -->
Edge Function secrets | Supabase's encrypted store for server-side keys (email, Give Lively, the service role key). Only the server functions can read them. <!-- new 2026-10-06 20:41 Aisling -->
Build guard | A check in all three apps' build settings (staff app, sponsor portal, iPad check-in app) that stops the build if a secret key would end up in the browser. <!-- modified 2026-10-08 05:10 Aisling -->
Guest category | What kind of guest someone is: sponsor guest, ticket holder, comp, AAFE staff, volunteer, event staff, or government/VIP. <!-- modified 2026-10-05 16:51 Aisling -->
Seated | A guest with a guaranteed table, which comes with Champion-level sponsorship and above. Other guests are admitted without one. <!-- modified 2026-10-05 16:51 Aisling -->
Pipeline stage | Where a sponsor prospect stands: not started, reached out, in conversation, closed won, payment received, or lost. <!-- modified 2026-10-05 16:51 Aisling -->
Needs reprint | A badge already printed whose name, title, organization, or table has since changed. <!-- updated 2026-10-03 12:36 Aisling -->
Open seat | A seat in a package with no guest named yet. The dashboard groups these by relationship owner.
P0, P1, P2 | Priority. P0 must work by Demo Day; P1 should; P2 is a stretch goal.
Package | A sponsorship or ticket tier and how many seats it includes, such as Silver at $25,000 with 10 seats (AAFE's 2026 flyer). <!-- modified 2026-10-05 16:51 Aisling -->
Postgres | The database the prototype uses, hosted by Supabase: standard, free, and offered by every major host. <!-- modified 2026-10-06 05:50 Aisling -->
Relationship owner | The AAFE staff member responsible for a guest or sponsor, and the one who follows up.
Render | A hosting company. One option a future partner could consider, at an estimated base of about $13 a month.
Demo preview | The temporary copy of the prototype the team runs for Demo Day, with invented data only: three projects on Vercel's free plan and the database on Supabase's free plan. Not a production system. <!-- modified 2026-10-08 04:15 Aisling -->
Exception (check-in) | Someone admitted who isn't on the list as named, such as a walk-in for a sponsor's unnamed seat. Recorded with a note and the staff member who approved it. <!-- updated 2026-10-03 12:36 Aisling -->
Gitleaks | A scanner that checks every pull request (and `main` after each merge) for passwords and keys; it must pass before anything merges. <!-- modified 2026-10-06 05:50 Aisling -->
Production-readiness notes | The handoff section listing what a future partner must settle before real data is used: hosting, backups, access, support, and gala-night fallback.
Restricted key | A Stripe key limited to reading payment status. Not used in the prototype; listed as a future option.
Review queue | Close matches waiting for a staff member to confirm or keep separate.
Purchase key | How the import recognizes a Give Lively purchase it has seen before: the buyer's email plus the purchase time, since AAFE's export has no transaction ID. <!-- updated 2026-10-05 22:58 Aisling -->
Tier mapping | A short list staff fill in once per gala that links each Give Lively tier name (such as "Ticket") to one of AAFE's packages. <!-- updated 2026-10-05 22:58 Aisling -->
Gala page name | The name of this year's gala page on Give Lively (such as "AAFE's 52nd Annual Gala"). Only purchases from that page are imported. <!-- updated 2026-10-05 22:58 Aisling -->
Import engine | The part of the code that reads a Give Lively file and decides what each row means, before anything is saved. <!-- updated 2026-10-05 22:58 Aisling -->
Salesforce file | An export of who actually attended, shaped for AAFE's Salesforce, live for the 2027 gala.
Seat | One place at the gala, tied to a commitment. Moves from unnamed to submitted, reviewed, badge-ready, and printed. <!-- modified 2026-10-03 12:36 Aisling -->
Sponsor link | A private, expiring web address where one sponsor names and edits their guests. No account needed.
Stretch | Work we do only if the must-haves are finished, such as a scrambler AAFE could run on its own Give Lively export. <!-- modified 2026-10-08 04:15 Aisling -->
Synthetic data | Invented names and organizations used for building and the public demo. The prototype never holds real guest data.
Walk-in | A guest who arrives without being on the list. The check-in lead decides, and the tool records it.
iPad check-in app | Natalie's app for volunteers at the door (`prototype/checkin-app/`): tonight's gala only, A to Z, search, QR scan, and it keeps working offline. <!-- new 2026-10-08 04:15 Aisling -->
Door list | What the iPad app holds: only the fields a door volunteer needs (name, organization, sponsor, table, accessibility needs, and each QR code's fingerprint, never the code itself); never emails, payments, or dietary details. <!-- modified 2026-10-09 06:10 Aisling -->
Offline queue | Check-ins the iPad saved while the internet was down, sent once it's back; the first arrival wins. <!-- new 2026-10-08 04:15 Aisling -->
Approval queue | Emails waiting for a staff member to approve them; nothing sends without that approval. In the staff app it's the "Waiting for approval" list on Integrations. <!-- modified 2026-10-09 06:10 Aisling -->
Pre-fill | Clearly readable names from a Give Lively guest list, placed in the sponsor's seats for the sponsor to confirm. <!-- new 2026-10-08 04:15 Aisling -->
Code map | The hub page that draws every file, function and database table in the prototype and how they connect, built from the code by graphify. <!-- new 2026-10-09 00:05 Aisling -->
graphify | An open-source tool that reads code and maps what uses what, with no AI and nothing sent anywhere; it builds the Code map. <!-- new 2026-10-09 00:05 Aisling -->
Fingerprint | The stored, scrambled copy (a SHA-256 hash) of a sponsor link or QR code; the database never keeps the working code itself. <!-- new 2026-10-08 04:15 Aisling -->
Vercel | The host for the demo's web apps, on its free plan; the database stays on Supabase. <!-- new 2026-10-08 04:15 Aisling -->
Labeled data sets | The three invented demo data sets, one loaded at a time: Small, Full as sent, and Full fixed. <!-- new 2026-10-08 04:15 Aisling -->
```
