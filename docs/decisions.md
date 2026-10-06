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
| 2026-10-06 | Import: a guest list with some unclear entries still pre-fills the clear names; the unclear ones show as written for the sponsor. More names than seats pre-fills nothing | Sponsors confirm every name anyway; keeping the good names saves them retyping | Aisling (Natalie reviewing in Slack) |
| 2026-10-06 | Import: the same guest name on another order is only a possible duplicate unless the email or a known organization also matches (then double-booked) | Respect sponsors' guest lists: a softer flag that staff confirm, not a conflict | Aisling (Natalie reviewing in Slack) |
| 2026-10-06 | Import: a CSV upload for a gala with no Give Lively page name stops and lists the page names in the file; staff pick the gala's page once, then it imports | A mixed export can't put another campaign's donations on the guest list | Aisling (Natalie reviewing in Slack) |
| 2026-10-06 | Natalie's `natalie-backend` and `natalie-guest-portal` branches merged into `main` (PRs #25, #26) with her history kept; the build continues on her backend | Build on what exists instead of starting over; her branches had no pull requests | Aisling |
| 2026-10-06 | QR e-tickets: minted when the approved email sends, stored only as a hash on the seat, valid until 6 a.m. New York time the morning after the gala; resending replaces the code, and a new guest on the seat or a name or email change voids it | Hard rule 6; issue #10 | Aisling |
| 2026-10-06 | The automatic Give Lively sync imports only this gala's page (`gala_events.givelively_page_name`, exact match), replacing the `GIVELIVELY_CAMPAIGNS` setting | AAFE's real page name ("AAFE's 52nd Annual Gala") didn't contain "AAFE Gala 2027", so every real purchase would have been ignored | Aisling, from Natalie's review |
| _pending_ | Demo preview host | Decide when the demo is deployable | Team |
| _pending_ | AI on/off, retention window, dietary data | See `data-handling.md` | AAFE |
| _pending_ | Code and IP ownership after Nov 10, and the repo license | Open question for AAFE and Pursuit | AAFE + team |
| _pending_ | Public use of AAFE logo and event photos (Demo Day) | Needs written approval | AAFE |
| _pending_ | Which prototype features are MVP vs later | Natalie's concept (Oct 2) goes beyond agreed scope | Team |
