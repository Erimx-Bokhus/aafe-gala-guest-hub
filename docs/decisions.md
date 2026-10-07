# Decision log

Format: date · decision · reason · decided by. Reopen only with new information.

| Date | Decision | Reason | By |
| --- | --- | --- | --- |
| 2026-09-30 | Keep Give Lively for tickets, donations, and receipts; build on top of it | Free, handles tax receipts, used year-round; client asked for a tool that works with it | Team (Natalie's scope) |
| 2026-09-30 | No payment processing or payment data in the tool | Compliance risk; out of scope | Team |
| 2026-09-30 | Synthetic data only through Demo Day | Demo Day is public | Team |
| 2026-10-01 | Prototype with invented data, code, and docs; production hosting is not selected during the capstone | AAFE decides adoption and a technical partner after Demo Day | Natalie (PM) |
| 2026-10-01 | Stripe left out of the prototype; read-only payment confirmation documented as a future option | Invented data gives nothing real to confirm | Team |
| 2026-10-02 | Repo `Erimx-Bokhus/aafe-gala-guest-hub`; one branch per person, pull requests into a reviewed `main` | Four people pushing; keep `main` stable | Aisling |
| 2026-10-01 | Maintainability is the deciding criterion for the stack | AAFE: tech capacity "pretty low," can't maintain very custom software | Client input |
| 2026-10-01 | Staff approval required before any email is sent | Close relationships; client request | Client |
| 2026-10-01 | Seating chart deprioritized; table number on badge is enough | Client: lower priority, staff assign seats | Client |
| 2026-10-03 | A relationship manager sending their own comp ticket counts as staff approval; every send is logged | Client wants RMs to send comps themselves; RMs are staff | Aisling |
| 2026-10-03 | Real AAFE staff contact details are redacted from repo docs | Hard rule 1 spirit; the repo will be handed on | Aisling |
| 2026-10-03 | Nov 9 is the team's last work day; Nov 10 is Demo Day and handoff | Clarifies dates used across the docs | Aisling |
| 2026-10-03 | AAFE logo and real event photos allowed in the private repo and internal reviews; public use, including Demo Day, needs AAFE's written approval | Repo is private and handed to AAFE; Demo Day is public and photos show real attendees | Aisling |
| 2026-10-05 | Build work split into two pairs: Frontend (Natalie + Antonin: staff app, sponsor portal, check-in, branding) and Backend (Aisling + Cornell: Supabase backend, import, sign-in and roles, secure links, exports, emails). Natalie stays product lead | Natalie is carrying most of the build; pairs keep two people on every area and spread the load | Aisling, Natalie |
| 2026-10-05 | Stack: React + TypeScript (Vite, Tailwind) on Supabase (Postgres, Auth, Edge Functions) | Matches Natalie's working prototype and seed data; mainstream and documented for a future partner | Aisling (admin), team |
| 2026-10-05 | Supabase free plan for the prototype and demo; no paid plan unless the demo needs it | Free covers invented data; a free project pauses after 1 week idle, so wake it before demos | Aisling |
| 2026-10-05 | GitHub Team plan; `main` protected: pull request with 1 approval and passing `gitleaks` scan, no force-push or deletion (admins can override in an emergency) | A professional repo with enforced reviews; the free plan can't protect a private branch | Aisling |
| 2026-10-05 | 2027 seats per tier follow AAFE's 2026 flyer until AAFE says otherwise: Platinum $50,000 = 12, Gold $30,000 = 10, Silver $25,000 = 10, Bronze $15,000 = 8, Champion $7,500 = 6 (guaranteed seating); Friend $2,500 = 2, Supporter $1,000 = 1 (admittance, no guaranteed seat); full- and half-page ads = 0 | AAFE's own 2026 sponsorship flyer, received Oct 5; supersedes the 2025 flyer and the call's estimates | AAFE (data) |
| 2026-10-05 | Import: a guest list with some unclear entries still pre-fills the clear names; the unclear ones show as written for the sponsor. More names than seats pre-fills nothing | Sponsors confirm every name anyway; keeping the good names saves them retyping | Aisling (Natalie reviewing in Slack) |
| 2026-10-05 | Import: the same guest name on another order is only a possible duplicate unless the email or a known organization also matches (then double-booked) | Respect sponsors' guest lists: a softer flag that staff confirm, not a conflict | Aisling (Natalie reviewing in Slack) |
| 2026-10-05 | Import: a CSV upload for a gala with no Give Lively page name stops and lists the page names in the file; staff pick the gala's page once, then it imports | A mixed export can't put another campaign's donations on the guest list | Aisling (Natalie reviewing in Slack) |
| 2026-10-05 | Natalie's `natalie-backend` and `natalie-guest-portal` branches merged into `main` (PRs #25, #26) with her history kept; the build continues on her backend | Build on what exists instead of starting over; her branches had no pull requests | Aisling |
| 2026-10-05 | QR e-tickets: minted when the approved email sends, stored only as a hash on the seat, valid until 6 a.m. New York time the morning after the gala; resending replaces the code, and a new guest on the seat or a name or email change voids it | Hard rule 6; issue #10 | Aisling |
| 2026-10-05 | The automatic Give Lively sync imports only this gala's page (`gala_events.givelively_page_name`, exact match), replacing the `GIVELIVELY_CAMPAIGNS` setting | AAFE's real page name ("AAFE's 52nd Annual Gala") didn't contain "AAFE Gala 2027", so every real purchase would have been ignored | Aisling, from Natalie's review |
| 2026-10-06 | Two more checks on every pull request: the real-data guard (emails only on `example.org`-style demo domains, phones only 555-0100 to 555-0199, no spreadsheets, CSVs only under `seed/` or `fixtures/`) and the app build, which also fails if `seed.sql`, `seed.json` or the `OPEN-*.html` files differ from what the generator and build produce. Test emails moved from `x.org` (a real domain) to `example.org` | Backstops hard rule 1 and keeps demo data changes in `generate_seed.py` | Aisling |
| 2026-10-05 | Trello is the team's task tracker; the hub summarizes and links to it | Pursuit asked for Trello; avoids entering tasks twice | Natalie, Aisling |
| 2026-10-06 | The Project Hub is the team's live tracker: everyone follows the docs and progress there, Trello holds day-to-day tasks, and these markdown files stay the source | One view for four people and AAFE; it has kept the build on track | Aisling |
| 2026-10-06 | Automatic Give Lively sync stays out of the Demo Day path; the demo uses the file upload | No live Give Lively key needed on stage | Aisling |
| 2026-10-06 | Staff sign in with an emailed link (Supabase Auth) for the prototype; AAFE's Google accounts later | Works with any email; Google needs AAFE's workspace | Cornell, Aisling |
| 2026-10-06 | Supabase CLI pinned to exactly 2.119.0; `prototype/` runs as ES modules (PR #31) | Same CLI for everyone running `db:backend`; stops a Node warning on every test run | Aisling |
| 2026-10-06 | The Supabase advisor's remaining warnings are accepted by design (PR #30; 28, then 31 with the export functions, which carry the same warning): staff functions check the caller's role inside; sponsor portal functions take the link token as the credential | The 12 real ones were fixed; the rest describe how the design works | Aisling |
| 2026-10-06 | One sponsor portal: `prototype/guest-portal`. Antonin's Figma prototype stays on his branch as a design reference; ideas come in as small PRs with screenshots first; Natalie approves portal changes, and Aisling reviews and merges | Two portals would confuse the team, AAFE, and a future partner | Natalie |
| 2026-10-06 | Sponsors see their own guests' gala-night arrivals in the portal; AAFE reviews the privacy side before it goes live | The team wants it; the backend already tracks check-in per seat | Natalie, team |
| 2026-10-06 | Exports return rows and the staff app writes the CSV; columns stay provisional until AAFE sends its badge and check-in templates (PR #34) | One CSV writer, with spreadsheet-formula protection; role checks and logging stay in the database | Aisling |
| 2026-10-06 | The informal client demo on Oct 7 is replaced by the prototype demonstration on Oct 19 | No client meeting was set for Oct 7 | Natalie |
| _pending_ | Demo preview host | Decide when the demo is deployable | Team |
| _pending_ | AI on/off, retention window, dietary data | See `data-handling.md` | AAFE |
| _pending_ | Code and IP ownership after Nov 10, and the repo license | Open question for AAFE and Pursuit | AAFE + team |
| _pending_ | Public use of AAFE logo and event photos (Demo Day) | Needs written approval | AAFE |
| _pending_ | Whether AI features are required for Demo Day | Team, Pursuit; this week | Team |
| _pending_ | Whether to adopt the tool, and with which technical partner | After Demo Day | AAFE |
| _pending_ | Whether guest email is required or optional | Before the portal is connected; QR e-tickets need an email | Team |
| 2026-10-06 | MVP vs later is set by the Working PRD (hub, Requirements): must-have is the Demo Day path | Natalie's concept (Oct 2) went beyond agreed scope; the Working PRD maps every part | Team |
