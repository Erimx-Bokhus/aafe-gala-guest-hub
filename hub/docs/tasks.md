# Tasks
<!-- updated 2026-10-05 22:58 Aisling -->
<!-- reviewed 2026-10-08 Aisling -->

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
- [x] Database schema and migrations (Natalie's backend, merged Oct 5) — Backend pair <!-- modified 2026-10-06 06:12 Aisling --> <!-- removed 2026-10-08 08:15 Aisling Web app preview deploy: same task as the Vercel setup under Added October 7 -->
- [x] Synthetic data generator: 553 invented guests, messy cases, for the import tests (PR #50) — Aisling <!-- modified 2026-10-07 13:45 Aisling -->
- [x] Staff sign-in (#8, PR #27, Oct 7) — Cornell <!-- modified 2026-10-08 08:15 Aisling -->
- [ ] Server-side staff roles (#9) — Cornell <!-- modified 2026-10-08 08:15 Aisling -->
- [x] Get AAFE's materials (received Oct 5) — Natalie <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Check AAFE's sample export against the import spec — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Revise the import spec for the real Give Lively export — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Confirm 2027 seats per sponsorship tier with AAFE — Natalie <!-- updated 2026-10-03 11:56 Aisling -->
- [x] Share the prototype source (seed.sql, seed.json) — Natalie <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Merge PRs #7 (staff app) and #14 (design doc) once the secret scan passes — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Bring the backend and guest-portal branches into `main` (PRs #25, #26) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [x] No AI in the first version; AAFE confirms Oct 15 — Team <!-- modified 2026-10-08 08:15 Aisling -->
- [ ] Ask AAFE for written approval of the logo and event photos for Demo Day; swap the name-badge photo — Natalie <!-- updated 2026-10-03 12:36 Aisling -->
- [x] Seed loader: Natalie's data with random hashed tokens and draft-only emails — Backend pair <!-- modified 2026-10-05 22:58 Aisling -->

## Added October 6
<!-- new 2026-10-05 22:58 Aisling -->

- [x] Import engine: reads the real export, splits guest lists, matches buyers and guests (PR #23) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Tier mapping and gala page filter from Natalie's review (spec PR #22; built in PRs #23–#26) — Aisling <!-- modified 2026-10-06 05:50 Aisling -->
- [x] Three import choices decided and posted for Natalie's review (PR #24) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Backend tests run on PRs that touch `prototype/` or `import-engine/` (PR #26) — Aisling <!-- modified 2026-10-06 05:50 Aisling -->
- [x] Review and merge PR #27 (after #35 brought it up to date with `main`), Oct 7 — Aisling <!-- modified 2026-10-07 19:15 Aisling -->
- [x] Natalie's review of the three import choices: pre-fill reaffirmed Oct 7 (PR #58 closed) — Natalie <!-- modified 2026-10-08 08:15 Aisling -->
- [ ] Share Pursuit's PRD with the backend pair (Natalie's two PRDs were shared Oct 7) — whoever has it <!-- modified 2026-10-08 08:15 Aisling -->
- [ ] Trello access for Cornell — Natalie <!-- modified 2026-10-06 06:12 Aisling -->
- [ ] Supabase project URL and public (anon) key to Cornell, in person, after the team picks the demo's Supabase project: invite his email and a non-staff test email in Supabase, add his staff_users row and the app's redirect URL, then set up his `.env.local` together (never the service_role key) — Aisling <!-- modified 2026-10-08 08:15 Aisling -->
- [ ] Upload screen: import engine, report, page picker, tier-mapping picker — Frontend pair <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Staff app: show "sent" and "resend" for QR codes instead of the code itself — Frontend pair <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Portal: "From your purchase: please confirm" labels (Korean done, PR #51) — Frontend pair <!-- modified 2026-10-07 19:15 Aisling -->
- [x] Frontend build check, demo-data drift check, real-data guard in CI — Backend pair <!-- modified 2026-10-06 01:13 Aisling -->
- [x] Aisling's test Supabase project loaded (schema, seed, backend); access rules (RLS) on for all 18 tables (19 today); Supabase advisor warnings cut from 41 to 31, all by design (PR #30; 28, then 31 with the export functions) — Aisling <!-- modified 2026-10-08 08:15 Aisling -->
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
- [x] Team PRDs: Natalie's enterprise and client-facing PRDs (Oct 7) — Natalie <!-- modified 2026-10-08 08:15 Aisling -->
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
- [x] Load PRs #42–#66 into Aisling's test Supabase project (Oct 8): `npm run db:backend`, then `npm run db:advisors`, 40 warnings, all by design; try a data set with `npm run db:load -- <set>` — Aisling <!-- modified 2026-10-08 09:20 Aisling -->
- [ ] Set up the Vercel demo: three projects (staff app, guest portal, iPad check-in app at `prototype/checkin-app`); the Supabase URL and public key in Vercel's settings only — Aisling <!-- modified 2026-10-08 08:15 Aisling -->
- [x] ~~Check-in screen: wire in the offline module (`CheckInDesk`) and the "Offline · N check-ins waiting" banner~~ Superseded by the iPad check-in app (PR #56) and connecting it to the backend (Added October 8) — Frontend pair <!-- modified 2026-10-08 08:15 Aisling -->
- [ ] Pipeline board and prospect form in the staff app — Frontend pair <!-- new 2026-10-07 13:45 Aisling -->
- [ ] Portal: show arrivals when a gala admin switches them on — Antonin <!-- new 2026-10-07 13:45 Aisling -->
- [ ] AAFE reviews the translations on the review sheet (`prototype/docs/translations/`) — Natalie <!-- new 2026-10-07 13:45 Aisling -->
- [ ] Decide whether a name written in Chinese or Korean script without a space (陳美玲) counts as a full name in the import; today it's left for the sponsor — Team <!-- modified 2026-10-07 23:27 Aisling -->

## Added October 7 (night)
<!-- new 2026-10-07 22:38 Aisling -->

- [x] Fix `WORKFLOW.md`: portal-link emails and reminders wait for staff approval (PR #54) — Aisling <!-- new 2026-10-07 22:38 Aisling -->
- [x] Go through Natalie's two PRDs and record the decisions (this page, Decisions, Requirements) — Aisling <!-- new 2026-10-07 22:38 Aisling -->
- [ ] PRD fixes before the client-facing PRD goes to AAFE: Oct 15, 21 tables, four languages, GreyBox Creative, the deadline question — Natalie <!-- new 2026-10-07 22:38 Aisling -->
- [x] ~~Import: drop the Give Lively guest-list text, no pre-fill~~ Withdrawn: pre-fill stays; PR #58 closed unmerged — Aisling <!-- modified 2026-10-07 23:27 Aisling -->
- [x] Three labeled data sets (Small, Full as sent, Full fixed), one loaded at a time: built from the iPad door list, with a picker in the staff app and portal and `npm run db:load -- <set>` for Supabase (#18, PR #66) — Aisling <!-- modified 2026-10-08 08:15 Aisling -->
- [x] iPad check-in app PR (PR #56, merged Oct 8) — Natalie <!-- modified 2026-10-08 01:50 Aisling -->
- [ ] After-gala results, Give Lively fee analytics, a seating map that staff control, and a simulated Salesforce push — Natalie (screens), Aisling (backend) <!-- new 2026-10-07 22:38 Aisling -->

## Added October 8
<!-- new 2026-10-08 01:50 Aisling -->

- [x] Review the iPad check-in app; it merged Oct 8 (PR #56) — Aisling <!-- new 2026-10-08 01:50 Aisling -->
- [x] Check-in sync: Undo or Close while a check-in is sending no longer loses it, with tests (PR #60) — Aisling <!-- new 2026-10-08 01:50 Aisling -->
- [x] QR code generator gives the full 128 random bits (PR #61) — Aisling <!-- new 2026-10-08 01:50 Aisling -->
- [x] Door list: invented names in place of 12 real organizations; screenshots retaken (PR #62) — Aisling <!-- new 2026-10-08 01:50 Aisling -->
- [x] Connect the iPad app to the backend, following Natalie's "To connect" list in PR #56: door list from the server, QR hash and expiry, `CheckInDesk` sync, staff sign-in, undo by the same person or an admin, clear on sign-out; the demo sync server stays for demo mode (PR #71) — Aisling <!-- modified 2026-10-08 09:40 Aisling -->
- [ ] First live run of the iPad app on the real Supabase project, with the in-person sign-in test: add the iPad app's address to the redirect URLs, set `checkin-app/.env.local` — Aisling, Cornell <!-- new 2026-10-08 09:40 Aisling -->
- [ ] iPad app: app manifest, opening offline, camera QR scanning on a real iPad — Natalie <!-- new 2026-10-08 01:50 Aisling -->
- [x] Scripts to rebuild the iPad app's double-click file and retake its screenshots (PR #65) — Aisling <!-- new 2026-10-08 08:15 Aisling -->
- [ ] Pick the demo's Supabase project and its owner — Team <!-- new 2026-10-08 08:15 Aisling -->
- [x] iPad app: build guard, CI build and drift check for `OPEN-CheckIn-App.html`, before its Vercel project gets keys (PR #70) — Aisling <!-- modified 2026-10-08 09:10 Aisling -->
- [x] Hub cleanup from the Oct 8 audit, and Screens split into Live build and Early sketches — Aisling <!-- new 2026-10-08 08:15 Aisling -->

## Week of October 12

- [ ] Connect staff app pages to the backend's pledges, payments, comps, and seats (with #9) — Backend pair <!-- modified 2026-10-06 06:12 Aisling -->
- [x] Give Lively import: real export, free-text guest lists (import engine, PRs #23–#24) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Connect the staff dashboard and guest grid to the backend — Frontend pair <!-- modified 2026-10-08 08:15 Aisling -->
- [ ] Prepare the Oct 15 prototype review with AAFE — Frontend pair <!-- modified 2026-10-08 08:15 Aisling -->

## Week of October 19

- [x] Matching, review queue, corrections that survive re-import (database side, PR #26) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Sponsor guest form on private links — Frontend pair, with Backend pair <!-- modified 2026-10-05 20:37 Aisling -->
- [ ] Gaps by owner, goal tracking, review before print — Frontend pair <!-- modified 2026-10-05 20:37 Aisling -->

## Week of October 26

- [ ] Exports: staff app buttons for the badge file, check-in list and Salesforce file (database side done, PR #34) — Frontend pair, with Backend pair <!-- modified 2026-10-08 08:15 Aisling -->
- [ ] Approval screen in the staff app (reminder and payment-confirmation templates and the queue are built, PR #44) — Frontend pair <!-- modified 2026-10-07 13:45 Aisling -->
- [x] Check-in app: search, arrivals, walk-ins, blank sponsor seats (iPad app, PR #56) — Natalie <!-- modified 2026-10-08 08:15 Aisling -->
- [ ] Show AAFE the full path for feedback — Natalie

## Week of November 2

- [ ] AAFE branding; AAFE signs off the translation sheet — Frontend pair <!-- modified 2026-10-08 08:15 Aisling -->
- [ ] End-to-end tests, accessibility, data-handling check — Everyone
- [x] QR e-tickets stored hashed, one per seat, expiring (issue #10, PR #26) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->

## Week of November 9

- [ ] Demo deploy, setup docs, handoff package, production-readiness notes — Everyone <!-- modified 2026-10-05 20:37 Aisling -->
- [ ] Demo rehearsal with synthetic data — Everyone
