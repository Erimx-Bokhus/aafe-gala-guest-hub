# Tasks
<!-- updated 2026-10-05 22:58 Aisling -->
<!-- reviewed 2026-10-06 Aisling -->

The team's task tracker is [Trello](https://trello.com/b/g9ycbWCv/erimx-bokhus), kept by Natalie at Pursuit's request. This page is a snapshot for planning; when they differ, Trello wins. Build work belongs to a pair (Oct 5): **Frontend: Natalie + Antonin**; **Backend: Aisling + Cornell**. <!-- modified 2026-10-05 20:37 Aisling -->

## Groundwork (from the first week) <!-- modified 2026-10-06 05:50 Aisling -->

- [x] Correct the GreyBox Creative note in the docs (not posted to Slack, to keep the channel quiet) — Aisling <!-- modified 2026-10-07 02:18 Aisling -->
- [ ] Team review of the data and AI handling note — Team
- [ ] Fold the hosting critique into the production-readiness notes — Aisling
- [ ] Send AAFE the recap, including the no-payment-data correction — Natalie
- [x] Propose component owners (pairs, Oct 5) — Aisling <!-- modified 2026-10-06 05:50 Aisling -->
- [ ] Ask AAFE for goals per category (sample export received Oct 5) — Natalie <!-- modified 2026-10-06 05:50 Aisling -->
- [ ] Settle code ownership and a team agreement with Pursuit — Team

## Week of October 5
<!-- updated 2026-10-05 16:51 Aisling -->

- [x] Record the stack decision: React + Supabase — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Pick the demo preview host — Team <!-- modified 2026-10-05 16:51 Aisling -->
- [x] Commit the handoff package to the team repo (Erimx-Bokhus) — Aisling <!-- modified 2026-10-03 11:56 Aisling -->
- [x] CI with secret scanning (gitleaks on every PR and on `main`), .gitignore, .env.example — Aisling <!-- modified 2026-10-06 05:50 Aisling -->
- [x] Import and matching spec with 22 test cases (now 38, PRs #20, #22) — Aisling <!-- modified 2026-10-06 05:50 Aisling -->
- [x] Seed data requirements for the import tests — Aisling <!-- modified 2026-10-03 11:56 Aisling -->
- [ ] Web app preview deploy (database is live in the team Supabase project) — Backend pair <!-- modified 2026-10-06 06:12 Aisling -->
- [x] Database schema and migrations (Natalie's backend, merged Oct 5) — Backend pair <!-- modified 2026-10-06 06:12 Aisling -->
- [ ] Synthetic data generator (~550 guests, messy cases) — Backend pair <!-- modified 2026-10-05 20:37 Aisling -->
- [ ] Supabase sign-in (#8, PR #27 in review) and server-side staff roles (#9) — Cornell <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Get AAFE's materials (received Oct 5) — Natalie <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Check AAFE's sample export against the import spec — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Revise the import spec for the real Give Lively export — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Confirm 2027 seats per sponsorship tier with AAFE — Natalie <!-- updated 2026-10-03 11:56 Aisling -->
- [x] Share the prototype source (seed.sql, seed.json) — Natalie <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Merge PRs #7 (staff app) and #14 (design doc) once the secret scan passes — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Bring the backend and guest-portal branches into `main` (PRs #25, #26) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Decide whether AI features are required for Demo Day — Team <!-- updated 2026-10-05 16:51 Aisling -->
- [ ] Ask AAFE for written approval of the logo and event photos for Demo Day; swap the name-badge photo — Natalie <!-- updated 2026-10-03 12:36 Aisling -->
- [x] Seed loader: Natalie's data with random hashed tokens and draft-only emails — Backend pair <!-- modified 2026-10-05 22:58 Aisling -->

## Added October 6
<!-- new 2026-10-05 22:58 Aisling -->

- [x] Import engine: reads the real export, splits guest lists, matches buyers and guests (PR #23) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Tier mapping and gala page filter from Natalie's review (spec PR #22; built in PRs #23–#26) — Aisling <!-- modified 2026-10-06 05:50 Aisling -->
- [x] Three import choices decided and posted for Natalie's review (PR #24) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Backend tests run on PRs that touch `prototype/` or `import-engine/` (PR #26) — Aisling <!-- modified 2026-10-06 05:50 Aisling -->
- [ ] Review and merge PR #27 once Cornell merges #35, which brings it up to date with `main` — Aisling <!-- modified 2026-10-06 20:41 Aisling -->
- [ ] Natalie's review of the three import choices (Slack) — Natalie <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Share the Pursuit PRD and the team PRD with the backend pair — whoever has them <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Trello access for Cornell — Natalie <!-- modified 2026-10-06 06:12 Aisling -->
- [ ] Supabase project URL and public (anon) key to Cornell, in person: invite his email and a non-staff test email in Supabase, add his staff_users row and the app's redirect URL, then set up his `.env.local` together (never the service_role key) — Aisling <!-- modified 2026-10-06 21:12 Aisling -->
- [ ] Upload screen: import engine, report, page picker, tier-mapping picker — Frontend pair <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Staff app: show "sent" and "resend" for QR codes instead of the code itself — Frontend pair <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Portal: "From your purchase: please confirm" labels; Korean — Frontend pair <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Frontend build check, demo-data drift check, real-data guard in CI — Backend pair <!-- modified 2026-10-06 01:13 Aisling -->
- [x] Supabase project loaded (schema, seed, backend); access rules (RLS) on for all 18 tables; Supabase advisor warnings cut from 41 to 28, all by design (PR #30) — Aisling <!-- modified 2026-10-06 05:50 Aisling -->
- [x] Real-data guard required before merging to `main`, alongside the secret scan — Aisling <!-- updated 2026-10-06 03:05 Aisling -->
- [x] ~~Informal client demo, Wednesday Oct 7~~ Replaced by the prototype demonstration on Oct 19 — Natalie <!-- modified 2026-10-06 20:41 Aisling -->

## Added October 6 (evening)
<!-- new 2026-10-06 20:41 Aisling -->

- [x] Exports built and loaded into the team Supabase project (PR #34) — Aisling <!-- updated 2026-10-06 20:41 Aisling -->
- [x] Antonin's sponsor portal prototype reviewed — Natalie, Aisling <!-- updated 2026-10-06 20:41 Aisling -->
- [x] Merge PR #36: keys kept out of the browser and the repo, app unit tests in CI — Aisling <!-- modified 2026-10-06 20:56 Aisling -->
- [x] Add the 20 staff sign-in tests to #35 — Aisling <!-- modified 2026-10-06 20:56 Aisling -->
- [ ] Merge #35 into `cornell-staff-auth`, then run the live sign-in test against the team project, in person with Aisling — Cornell <!-- modified 2026-10-06 21:12 Aisling -->
- [ ] Port tier layout, the "still need names" line, Korean, and gala-night arrivals into `guest-portal` as small PRs, screenshots first — Antonin (Natalie approves) <!-- updated 2026-10-06 20:41 Aisling -->
- [ ] Switch the prototype's demo emails to `@example.org`; confirm the Figma Make site isn't published — Antonin <!-- updated 2026-10-06 20:41 Aisling -->
- [ ] Team PRD draft (started Oct 6) — Natalie <!-- updated 2026-10-06 20:41 Aisling -->
- [ ] Confirm the Oct 19 prototype demonstration — Cornell <!-- updated 2026-10-06 20:41 Aisling -->
- [ ] AAFE privacy review of sponsor-facing gala-night arrivals — Natalie <!-- updated 2026-10-06 20:41 Aisling -->
- [ ] Decide whether guest email is required or optional — Team <!-- updated 2026-10-06 20:41 Aisling -->

## Week of October 12

- [ ] Connect staff app pages to the backend's pledges, payments, comps, and seats (with #9) — Backend pair <!-- modified 2026-10-06 06:12 Aisling -->
- [x] Give Lively import: real export, free-text guest lists (import engine, PRs #23–#24) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Staff dashboard shell and guest grid — Frontend pair <!-- modified 2026-10-05 20:37 Aisling -->
- [ ] Clickable prototype of the sponsor form and dashboard for AAFE — Frontend pair <!-- modified 2026-10-05 20:37 Aisling -->

## Week of October 19

- [x] Matching, review queue, corrections that survive re-import (database side, PR #26) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Sponsor guest form on private links — Frontend pair, with Backend pair <!-- modified 2026-10-05 20:37 Aisling -->
- [ ] Gaps by owner, goal tracking, review before print — Frontend pair <!-- modified 2026-10-05 20:37 Aisling -->

## Week of October 26

- [ ] Exports: database side done and loaded into the team project (badge file with table numbers, check-in list, Salesforce file; PR #34); staff app buttons next, with the frontend pair — Backend pair <!-- modified 2026-10-06 20:41 Aisling -->
- [ ] Approval screen, plus reminder and receipt templates (draft queue and approval built in the backend) — Backend pair <!-- modified 2026-10-06 06:12 Aisling -->
- [ ] Check-in app: search, arrivals, walk-ins, blank sponsor seats — Frontend pair <!-- modified 2026-10-05 20:37 Aisling -->
- [ ] Show AAFE the full path for feedback — Natalie

## Week of November 2

- [ ] AAFE branding and sponsor-form translations, reviewed by AAFE — Frontend pair <!-- modified 2026-10-05 20:37 Aisling -->
- [ ] End-to-end tests, accessibility, data-handling check — Everyone
- [x] QR e-tickets stored hashed, one per seat, expiring (issue #10, PR #26) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->

## Week of November 9

- [ ] Demo deploy, setup docs, handoff package, production-readiness notes — Everyone <!-- modified 2026-10-05 20:37 Aisling -->
- [ ] Demo rehearsal with synthetic data — Everyone
