# Decisions
<!-- updated 2026-10-05 22:58 Aisling -->
<!-- reviewed 2026-10-06 Aisling -->

Every decision with its reason and what would reopen it, newest first. Nothing here is reopened without new information.

| Date | Decision | Why | Revisit if | Owner |
| --- | --- | --- | --- | --- |
| Oct 6 | One sponsor portal: `prototype/guest-portal`. Antonin's Figma prototype stays on his branch as a design reference; ideas come in as small PRs with screenshots first; Natalie approves portal changes, and Aisling reviews and merges | Two portals would confuse the team, AAFE, and a future partner | — | Natalie <!-- updated 2026-10-06 20:41 Aisling --> |
| Oct 6 | Sponsors see their own guests' gala-night arrivals in the portal; AAFE reviews the privacy side before it goes live | The team wants it (Natalie's review of Antonin's prototype); the backend already tracks check-in per seat | AAFE's privacy review says no | Natalie, team <!-- updated 2026-10-06 20:41 Aisling --> |
| Oct 6 | Exports return rows and the staff app writes the CSV; columns stay provisional until AAFE sends its badge and check-in templates (PR #34) | One CSV writer, with spreadsheet-formula protection, for every file; role checks and logging stay in the database | AAFE's templates differ | Aisling <!-- updated 2026-10-06 20:41 Aisling --> |
| Oct 6 | The informal client demo on Oct 7 is replaced by the prototype demonstration on Oct 19 | No client meeting was set for Oct 7; Oct 19 suits the team | — | Natalie <!-- updated 2026-10-06 20:41 Aisling --> |
| Oct 6 | The Project Hub is the team's live tracker: everyone follows the docs and progress here, Trello holds day-to-day tasks, and the repo's markdown files stay the source | One view for four people and AAFE; it has kept the build on track | The team moves to another tool | Aisling <!-- updated 2026-10-06 06:12 Aisling --> |
| Oct 6 | MVP vs later is set by the Working PRD on Requirements: must-have is the Demo Day path | Natalie's concept went beyond agreed scope; the Working PRD maps every part | The final PRDs differ | Team <!-- updated 2026-10-06 06:12 Aisling --> |
| Oct 6 | Automatic Give Lively sync stays out of the Demo Day path; the demo uses the file upload | No live Give Lively key needed on stage | AAFE wants a live sync shown | Aisling <!-- updated 2026-10-06 06:12 Aisling --> |
| Oct 6 | Staff sign in with an emailed link (Supabase Auth) for the prototype; AAFE's Google accounts later | Works with any email; Google needs AAFE's workspace | AAFE adopts the tool | Cornell, Aisling <!-- updated 2026-10-06 06:12 Aisling --> |
| Oct 6 | Supabase CLI pinned to exactly 2.119.0; `prototype/` runs as ES modules (PR #31) | Same CLI for everyone running `db:backend`; stops a Node warning on every test run | A needed fix lands in a newer CLI | Aisling <!-- updated 2026-10-06 06:12 Aisling --> |
| Oct 6 | The Supabase advisor's remaining warnings are accepted by design (PR #30; 28, then 31 with the export functions, which carry the same warning): staff functions check the caller's role inside, and sponsor portal functions take the link token as the credential | The 12 real ones were fixed; the rest describe how the design works | A partner moves functions out of the exposed API, or a new warning type appears | Aisling <!-- modified 2026-10-06 20:41 Aisling --> |
| Oct 6 | Real-data guard (required) and frontend build with demo-data drift check on pull requests; test emails moved to example.org | Backstops hard rule 1; demo data changes go through generate_seed.py | — | Aisling <!-- updated 2026-10-06 05:50 Aisling --> |
| Oct 5 | Import: a guest list with some unclear entries still pre-fills its clear names; more names than seats pre-fills nothing | Sponsors confirm every name; keeping the good ones saves retyping | Natalie or AAFE prefers all-or-nothing | Aisling (Natalie reviewing) <!-- modified 2026-10-06 06:12 Aisling --> |
| Oct 5 | Import: the same name on another order is a possible duplicate; double-booked only when the email or a known organization also matches | Respect each sponsor's list; staff still see it before gala night | Double bookings slip through | Aisling (Natalie reviewing) <!-- modified 2026-10-06 06:12 Aisling --> |
| Oct 5 | Import: an upload stops until this gala's Give Lively page is chosen; then only that page is imported | A mixed export can't put another campaign on the guest list | — | Aisling (Natalie reviewing) <!-- modified 2026-10-06 06:12 Aisling --> |
| Oct 5 | Staff map each Give Lively tier name to a package once per gala ("Ticket" → a package) | AAFE's export says just "Ticket"; every ticket would otherwise wait for review | Give Lively exports package names | Aisling, Natalie <!-- modified 2026-10-06 06:12 Aisling --> |
| Oct 5 | QR e-tickets: random, stored hashed, one per seat, expire 6 a.m. the morning after the gala; a new guest on the seat voids the code | Hard rule 6: a QR code works like a door key | AAFE wants codes on printed badges | Aisling <!-- modified 2026-10-06 06:12 Aisling --> |
| Oct 5 | Natalie's backend and guest portal merged into `main` as the base for the build, her history kept | Build on what exists instead of starting over | — | Aisling <!-- modified 2026-10-06 06:12 Aisling --> |
| Oct 5 | Build work split into two pairs: Frontend (Natalie + Antonin) and Backend (Aisling + Cornell); Natalie stays product lead | Natalie is carrying most of the build; pairs keep two people on every area | A pair can't keep pace | Aisling, Natalie <!-- updated 2026-10-05 20:37 Aisling --> |
| Oct 5 | Stack: React + TypeScript (Vite, Tailwind) on Supabase (Postgres, sign-in, server functions) | Matches Natalie's working prototype; mainstream tools a future partner can pick up | A partner needs a different host | Aisling, team <!-- updated 2026-10-05 16:51 Aisling --> |
| Oct 5 | Supabase free plan for the prototype and the demo | Covers invented data; a free project pauses after a week idle, so wake it before demos | The demo needs more than the free plan | Aisling <!-- updated 2026-10-05 16:51 Aisling --> |
| Oct 5 | The automatic Give Lively sync imports only this gala's page (exact page name), replacing the fixed campaign setting | AAFE's real page name differs from the setting's default; a mixed export can't leak another campaign | Give Lively changes page naming | Aisling <!-- updated 2026-10-06 06:12 Aisling --> |
| Oct 5 | GitHub Team plan; `main` protected: pull request, 1 approval, passing secret scan and real-data guard, no force-push or deletion | A professional repo with a stable `main` | — | Aisling <!-- modified 2026-10-06 05:50 Aisling --> |
| Oct 5 | 2027 seats per tier follow AAFE's 2026 flyer (Platinum 12, Gold 10, Silver 10, Bronze 8, Champion 6, Friend 2, Supporter 1) | AAFE's own flyer, received Oct 5 | AAFE sets different 2027 packages | AAFE (data) <!-- updated 2026-10-05 16:51 Aisling --> |
| Oct 5 | Trello is the team's task tracker; the hub summarizes and links to it | Pursuit asked for Trello; avoids entering tasks twice | — | Natalie, Aisling <!-- updated 2026-10-05 16:51 Aisling --> |
| Oct 3 | A relationship manager sending their own comp ticket counts as staff approval; every send is logged | Client wants RMs to send comps themselves; RMs are staff | AAFE wants a second approver | Aisling <!-- updated 2026-10-03 11:36 Aisling --> |
| Oct 3 | Real AAFE staff contact details are redacted from repo docs | The repo will be handed on | — | Aisling <!-- updated 2026-10-03 11:36 Aisling --> |
| Oct 3 | Nov 9 is the team's last work day; Nov 10 is Demo Day and handoff | Clarifies dates used across the docs | Pursuit moves Demo Day | Aisling <!-- updated 2026-10-03 11:36 Aisling --> |
| Oct 3 | AAFE logo and real event photos allowed in the private repo and internal reviews; public use, including Demo Day, needs AAFE's written approval | Repo is private and handed to AAFE; Demo Day is public and photos show real attendees | AAFE approves in writing | Aisling <!-- updated 2026-10-03 12:36 Aisling --> |
| Oct 2 | Repo `Erimx-Bokhus/aafe-gala-guest-hub`; one branch per person, pull requests into a reviewed `main` | Four people pushing; keep `main` stable | — | Aisling <!-- updated 2026-10-06 06:12 Aisling --> |
| Oct 1 | We deliver a prototype with invented data, code, and documentation; production hosting is not selected during the capstone | AAFE should decide on adoption, and on a technical partner, after reviewing the finished prototype | AAFE asks the team to deploy for production | Natalie |
| Oct 1 | Stripe is left out of the prototype; read-only payment confirmation is documented as a future option | With invented data there is nothing real to confirm | AAFE adopts the tool and wants it | Team |
| Oct 1 | Matching uses plain rules (purchase key: buyer email + purchase time, replacing the Give Lively ID AAFE's export lacks; then email; then name and organization); AI explanations behind an admin switch, off by default | AAFE's draft AI policy keeps guest names out of AI tools; rules are easier to audit | AAFE approves AI use in writing | Aisling <!-- modified 2026-10-06 05:50 Aisling --> |
| Oct 1 | ~~Stripe access is read-only~~ Superseded the same day by the prototype scope above | Payments already flow through AAFE's Stripe via Give Lively | — | Aisling |
| Oct 1 | Maintainability decides the stack | AAFE: tech capacity "pretty low," can't maintain anything very custom | — | Client |
| Oct 1 | Staff approve every email before it sends | Close relationships; client request | — | Client |
| Oct 1 | Seating chart deprioritized; table number on the badge is enough | Client: lower priority, staff assign seats | AAFE asks for it | Client |
| Sep 30 | Keep Give Lively for tickets, donations, and receipts | Free, handles tax receipts, used year-round | — | Team |
| Sep 30 | No payment processing in the tool | Compliance risk; out of scope | AAFE approves Stripe invoices | Team |
| Sep 30 | Synthetic data only through Demo Day | Demo Day is public | — | Team |

## Pending

| Decision | Who decides | When |
| --- | --- | --- |
| Demo preview host | Team | When the demo is deployable <!-- modified 2026-10-05 16:51 Aisling --> |
| Whether AI features are required for Demo Day | Team, Pursuit | This week <!-- modified 2026-10-05 16:51 Aisling --> |
| AI on or off, retention, dietary data | AAFE | After the data note is reviewed |
| Code and IP ownership after Nov 10, and the repo license | AAFE, Pursuit, team | Before handoff (Nov 10) <!-- modified 2026-10-06 05:50 Aisling --> |
| Public use of AAFE's logo and event photos, including Demo Day | AAFE | Before Demo Day <!-- updated 2026-10-03 12:36 Aisling --> |
| Whether to adopt the tool, and with which technical partner | AAFE | After Demo Day |
| Whether guest email is required or optional | Team | Before the portal is connected (QR e-tickets need an email) <!-- updated 2026-10-06 20:41 Aisling --> |
