# Tasks
<!-- updated Oct 6 -->

The team's task tracker is [Trello](https://trello.com/b/g9ycbWCv/erimx-bokhus), kept by Natalie at Pursuit's request. This page is a snapshot for planning; when they differ, Trello wins. Build work belongs to a pair (Oct 5): **Frontend: Natalie + Antonin**; **Backend: Aisling + Cornell**.

## Groundwork: this week

- [ ] Post the GreyBox Creative correction in the team thread — Aisling
- [ ] Team review of the data and AI handling note — Team
- [ ] Fold the hosting critique into the production-readiness notes — Aisling
- [ ] Send AAFE the recap, including the no-payment-data correction — Natalie
- [ ] Propose component owners — Aisling
- [ ] Ask AAFE for sample Give Lively exports and goals per category — Natalie
- [ ] Settle code ownership and a team agreement with Pursuit — Team

## Week of October 5
<!-- updated Oct 5 -->

- [x] Record the stack decision: React + Supabase — Aisling
- [ ] Pick the demo preview host — Team
- [x] Commit the handoff package to the team repo (Erimx-Bokhus) — Aisling
- [x] CI with secret scanning (gitleaks on every push and PR), .gitignore, .env.example — Aisling
- [x] Import and matching spec with 22 test cases — Aisling
- [x] Seed data requirements for the import tests — Aisling
- [ ] Staging deploy — Backend pair
- [x] Database schema and migrations (Natalie's backend, merged Oct 6) — Backend pair
- [ ] Synthetic data generator (~550 guests, messy cases) — Backend pair
- [ ] Supabase sign-in (#8, PR #27 in review) and server-side staff roles (#9) — Cornell
- [x] Get AAFE's materials (received Oct 5) — Natalie
- [x] Check AAFE's sample export against the import spec — Aisling
- [x] Revise the import spec for the real Give Lively export — Aisling
- [ ] Confirm 2027 seats per sponsorship tier with AAFE — Natalie
- [x] Share the prototype source (seed.sql, seed.json) — Natalie
- [x] Merge PRs #7 (staff app) and #14 (design doc) once the secret scan passes — Aisling
- [x] Bring the backend and guest-portal branches into `main` (PRs #25, #26) — Aisling
- [ ] Decide whether AI features are required for Demo Day — Team
- [ ] Ask AAFE for written approval of the logo and event photos for Demo Day; swap the name-badge photo — Natalie
- [x] Seed loader: Natalie's data with random hashed tokens and draft-only emails — Backend pair

## Added October 6
<!-- new Oct 6 -->

- [x] Import engine: reads the real export, splits guest lists, matches buyers and guests (PR #23) — Aisling
- [x] Tier mapping and gala page filter from Natalie's review (PR #22) — Aisling
- [x] Three import choices decided and posted for Natalie's review (PR #24) — Aisling
- [x] Backend tests run on every PR (PR #26) — Aisling
- [ ] Merge PR #26, then PR #27 after Cornell updates it from `main` — Aisling
- [ ] Natalie's review of the three import choices (Slack) — Natalie
- [ ] Share the Pursuit PRD and the team PRD with the backend pair — whoever has them
- [ ] Trello access for Cornell; Supabase project URL and public key to Cornell — Natalie
- [ ] Upload screen: import engine, report, page picker, tier-mapping picker — Frontend pair
- [ ] Staff app: show "sent" and "resend" for QR codes instead of the code itself — Frontend pair
- [ ] Portal: "From your purchase: please confirm" labels; Korean — Frontend pair
- [ ] Frontend build check, demo-data drift check, real-data guard in CI — Backend pair
- [ ] Informal client demo, Wednesday Oct 7 — Natalie

## Week of October 12

- [ ] Packages, commitments, seats, and manual entry — Backend pair
- [x] Give Lively import: real export, free-text guest lists (import engine, PRs #23–#24) — Aisling
- [ ] Staff dashboard shell and guest grid — Frontend pair
- [ ] Clickable prototype of the sponsor form and dashboard for AAFE — Frontend pair

## Week of October 19

- [x] Matching, review queue, corrections that survive re-import (database side, PR #26) — Aisling
- [ ] Sponsor guest form on private links — Frontend pair, with Backend pair
- [ ] Gaps by owner, goal tracking, review before print — Frontend pair

## Week of October 26

- [ ] Exports: badges with table number, check-in list, Salesforce file — Backend pair
- [ ] Follow-up email drafts with staff approval — Backend pair
- [ ] Check-in app: search, arrivals, walk-ins, blank sponsor seats — Frontend pair
- [ ] Show AAFE the full path for feedback — Natalie

## Week of November 2

- [ ] AAFE branding and sponsor-form translations, reviewed by AAFE — Frontend pair
- [ ] End-to-end tests, accessibility, data-handling check — Everyone
- [x] QR e-tickets stored hashed, one per seat, expiring (issue #10, PR #26) — Aisling

## Week of November 9

- [ ] Demo deploy, setup docs, handoff package, production-readiness notes — Everyone
- [ ] Demo rehearsal with synthetic data — Everyone
