# Tasks
<!-- updated 2026-10-05 22:58 Aisling -->
<!-- reviewed 2026-10-06 Aisling -->

The team's task tracker is [Trello](https://trello.com/b/g9ycbWCv/erimx-bokhus), kept by Natalie at Pursuit's request. This page is a snapshot for planning; when they differ, Trello wins. Build work belongs to a pair (Oct 5): **Frontend: Natalie + Antonin**; **Backend: Aisling + Cornell**. <!-- modified 2026-10-05 20:37 Aisling -->

## Groundwork (from the first week) <!-- modified 2026-10-06 05:50 Aisling -->

- [x] Correct the GreyBox Creative note in the docs (not posted to Slack, to keep the channel quiet) — Aisling <!-- modified 2026-10-07 02:18 Aisling -->
- [ ] Team review of the data and AI handling note — Team
- [x] Fold the hosting critique into the production-readiness notes (Hosting page, Oct 7) — Aisling <!-- modified 2026-10-07 13:45 Aisling -->
- [ ] Send AAFE the recap, including the no-payment-data correction — Natalie
- [x] Propose component owners (pairs, Oct 5) — Aisling <!-- modified 2026-10-06 05:50 Aisling -->
- [ ] Ask AAFE for goals per category (sample export received Oct 5) — Natalie <!-- modified 2026-10-06 05:50 Aisling -->
- [ ] Settle code ownership and a team agreement with Pursuit — Team

## Week of October 5
<!-- updated 2026-10-05 16:51 Aisling -->

- [x] Record the stack decision: React + Supabase — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Pick the demo preview host: Vercel's free plan (Oct 6) — Team <!-- modified 2026-10-07 13:45 Aisling -->
- [x] Commit the handoff package to the team repo (Erimx-Bokhus) — Aisling <!-- modified 2026-10-03 11:56 Aisling -->
- [x] CI with secret scanning (gitleaks on every PR and on `main`), .gitignore, .env.example — Aisling <!-- modified 2026-10-06 05:50 Aisling -->
- [x] Import and matching spec with 22 test cases (now 38, PRs #20, #22) — Aisling <!-- modified 2026-10-06 05:50 Aisling -->
- [x] Seed data requirements for the import tests — Aisling <!-- modified 2026-10-03 11:56 Aisling -->
- [ ] Web app preview deploy (database is live in Aisling's test Supabase project; the demo's project is still to agree) — Backend pair <!-- modified 2026-10-07 20:23 Aisling -->
- [x] Database schema and migrations (Natalie's backend, merged Oct 5) — Backend pair <!-- modified 2026-10-06 06:12 Aisling -->
- [x] Synthetic data generator: 553 invented guests, messy cases, for the import tests (PR #50) — Aisling <!-- modified 2026-10-07 13:45 Aisling -->
- [ ] Supabase sign-in (#8, PR #27 merged Oct 7) and server-side staff roles (#9, still to do) — Cornell <!-- modified 2026-10-07 19:15 Aisling -->
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
- [x] Review and merge PR #27 (after #35 brought it up to date with `main`), Oct 7 — Aisling <!-- modified 2026-10-07 19:15 Aisling -->
- [ ] Natalie's review of the three import choices (Slack) — Natalie <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Share the Pursuit PRD and the team PRD with the backend pair — whoever has them <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Trello access for Cornell — Natalie <!-- modified 2026-10-06 06:12 Aisling -->
- [ ] Supabase project URL and public (anon) key to Cornell, in person: invite his email and a non-staff test email in Supabase, add his staff_users row and the app's redirect URL, then set up his `.env.local` together (never the service_role key) — Aisling <!-- modified 2026-10-06 21:12 Aisling -->
- [ ] Upload screen: import engine, report, page picker, tier-mapping picker — Frontend pair <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Staff app: show "sent" and "resend" for QR codes instead of the code itself — Frontend pair <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Portal: "From your purchase: please confirm" labels (Korean done, PR #51) — Frontend pair <!-- modified 2026-10-07 19:15 Aisling -->
- [x] Frontend build check, demo-data drift check, real-data guard in CI — Backend pair <!-- modified 2026-10-06 01:13 Aisling -->
- [x] Aisling's test Supabase project loaded (schema, seed, backend); access rules (RLS) on for all 18 tables; Supabase advisor warnings cut from 41 to 28, all by design (PR #30) — Aisling <!-- modified 2026-10-07 20:23 Aisling -->
- [x] Real-data guard required before merging to `main`, alongside the secret scan — Aisling <!-- updated 2026-10-06 03:05 Aisling -->
- [x] ~~Informal client demo, Wednesday Oct 7~~ Replaced by the first prototype review with AAFE on Oct 15 (moved from Oct 19 on Oct 7) — Natalie <!-- modified 2026-10-07 22:38 Aisling -->

## Added October 6 (evening)
<!-- new 2026-10-06 20:41 Aisling -->

- [x] Exports built and loaded into Aisling's test Supabase project (PR #34) — Aisling <!-- modified 2026-10-07 20:23 Aisling -->
- [x] Antonin's sponsor portal prototype reviewed — Natalie, Aisling <!-- updated 2026-10-06 20:41 Aisling -->
- [x] Merge PR #36: keys kept out of the browser and the repo, app unit tests in CI — Aisling <!-- modified 2026-10-06 20:56 Aisling -->
- [x] Add the 20 staff sign-in tests to #35 — Aisling <!-- modified 2026-10-06 20:56 Aisling -->
- [ ] Live sign-in test, in person with Aisling, once the team agrees which Supabase project the demo uses (#35 and #27 merged Oct 7) — Cornell <!-- modified 2026-10-07 19:15 Aisling -->
- [ ] Port tier layout, the "still need names" line, and gala-night arrivals into `guest-portal` as small PRs, screenshots first (Korean done, PR #51) — Antonin (Natalie approves) <!-- modified 2026-10-07 19:15 Aisling -->
- [ ] Switch the prototype's demo emails to `@example.org`; confirm the Figma Make site isn't published — Antonin <!-- updated 2026-10-06 20:41 Aisling -->
- [ ] Team PRD draft (started Oct 6) — Natalie <!-- updated 2026-10-06 20:41 Aisling -->
- [ ] Confirm the Oct 15 prototype review with AAFE — Cornell <!-- modified 2026-10-07 22:38 Aisling -->
- [ ] AAFE privacy review of sponsor-facing gala-night arrivals — Natalie <!-- updated 2026-10-06 20:41 Aisling -->
- [ ] Decide whether guest email is required or optional — Team <!-- updated 2026-10-06 20:41 Aisling -->

## Added October 7
<!-- new 2026-10-07 13:45 Aisling -->

- [x] Every staff action logged; tests for daylight-saving days, a 2,000-row file, Internal Name only, and the Give Lively sync (PR #46) — Aisling <!-- new 2026-10-07 13:45 Aisling -->
- [x] Offline check-in: the iPad's saved list, sync later, first arrival wins (PR #46) — Aisling <!-- new 2026-10-07 13:45 Aisling -->
- [x] Sponsor pipeline in the backend (PR #48) — Aisling <!-- new 2026-10-07 13:45 Aisling -->
- [x] Sponsor-facing arrivals, switched off until AAFE approves (PR #49) — Aisling <!-- new 2026-10-07 13:45 Aisling -->
- [x] Translation review sheet for AAFE, and no silent English fallback (PR #50) — Aisling <!-- new 2026-10-07 13:45 Aisling -->
- [x] Full-size invented test gala, 553 guests, through the import into the database (PR #50) — Aisling <!-- new 2026-10-07 13:45 Aisling -->
- [ ] Load PRs #42–#52 into Aisling's test Supabase project: `npm run db:backend`, then `npm run db:advisors` — Aisling <!-- modified 2026-10-07 20:23 Aisling -->
- [ ] Set up the Vercel demo: two projects (staff app, guest portal); the Supabase URL and public key in Vercel's settings only — Aisling <!-- new 2026-10-07 13:45 Aisling -->
- [ ] Check-in screen: wire in the offline module (`CheckInDesk`) and the "Offline · N check-ins waiting" banner — Frontend pair <!-- new 2026-10-07 13:45 Aisling -->
- [ ] Pipeline board and prospect form in the staff app — Frontend pair <!-- new 2026-10-07 13:45 Aisling -->
- [ ] Portal: show arrivals when a gala admin switches them on — Antonin <!-- new 2026-10-07 13:45 Aisling -->
- [ ] AAFE reviews the translations on the review sheet (`prototype/docs/translations/`) — Natalie <!-- new 2026-10-07 13:45 Aisling -->
- [x] ~~Decide whether a name written in Chinese or Korean script without a space counts as a full name in the import~~ No longer needed: the import stops reading guest names — Team <!-- modified 2026-10-07 22:38 Aisling -->

## Added October 7 (night)
<!-- new 2026-10-07 22:38 Aisling -->

- [x] Fix `WORKFLOW.md`: portal-link emails and reminders wait for staff approval (PR #54) — Aisling <!-- new 2026-10-07 22:38 Aisling -->
- [x] Go through Natalie's two PRDs and record the decisions (this page, Decisions, Requirements) — Aisling <!-- new 2026-10-07 22:38 Aisling -->
- [ ] PRD fixes before the client-facing PRD goes to AAFE: Oct 15, 21 tables, four languages, GreyBox Creative, the deadline question — Natalie <!-- new 2026-10-07 22:38 Aisling -->
- [ ] Import: drop the Give Lively guest-list text, no pre-fill — Aisling <!-- new 2026-10-07 22:38 Aisling -->
- [ ] Three labeled data sets (Small, Full as sent, Full fixed), one loaded at a time, after Natalie's seed PR — Aisling <!-- new 2026-10-07 22:38 Aisling -->
- [ ] iPad check-in app PR — Natalie <!-- new 2026-10-07 22:38 Aisling -->
- [ ] After-gala results, Give Lively fee analytics, a seating map that staff control, and a simulated Salesforce push — Natalie (screens), Aisling (backend) <!-- new 2026-10-07 22:38 Aisling -->

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

- [ ] Exports: database side done and loaded into Aisling's test project (badge file with table numbers, check-in list, Salesforce file; PR #34); staff app buttons next, with the frontend pair — Backend pair <!-- modified 2026-10-07 20:23 Aisling -->
- [ ] Approval screen in the staff app (reminder and payment-confirmation templates and the queue are built, PR #44) — Frontend pair <!-- modified 2026-10-07 13:45 Aisling -->
- [ ] Check-in app: search, arrivals, walk-ins, blank sponsor seats — Frontend pair <!-- modified 2026-10-05 20:37 Aisling -->
- [ ] Show AAFE the full path for feedback — Natalie

## Week of November 2

- [ ] AAFE branding and sponsor-form translations, reviewed by AAFE — Frontend pair <!-- modified 2026-10-05 20:37 Aisling -->
- [ ] End-to-end tests, accessibility, data-handling check — Everyone
- [x] QR e-tickets stored hashed, one per seat, expiring (issue #10, PR #26) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->

## Week of November 9

- [ ] Demo deploy, setup docs, handoff package, production-readiness notes — Everyone <!-- modified 2026-10-05 20:37 Aisling -->
- [ ] Demo rehearsal with synthetic data — Everyone
