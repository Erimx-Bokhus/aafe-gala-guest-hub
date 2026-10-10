# Tasks
<!-- updated 2026-10-05 22:58 Aisling -->
<!-- reviewed 2026-10-09 Aisling -->

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
- [x] Database schema and migrations (Natalie's backend, merged Oct 5) — Backend pair <!-- modified 2026-10-06 06:12 Aisling --> <!-- removed 2026-10-08 04:15 Aisling Web app preview deploy: same task as the Vercel setup under Added October 7 -->
- [x] Synthetic data generator: 553 invented guests, messy cases, for the import tests (PR #50) — Aisling <!-- modified 2026-10-07 13:45 Aisling -->
- [x] Staff sign-in (#8, PR #27, Oct 7) — Cornell <!-- modified 2026-10-08 04:15 Aisling -->
- [x] Server-side staff roles (#9): every staff action goes through the server, which checks the role (PR #72, merged Oct 8 with Aisling's review fixes) — Cornell <!-- modified 2026-10-08 16:40 Aisling -->
- [x] Get AAFE's materials (received Oct 5) — Natalie <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Check AAFE's sample export against the import spec — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Revise the import spec for the real Give Lively export — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Confirm 2027 seats per sponsorship tier with AAFE — Natalie <!-- updated 2026-10-03 11:56 Aisling -->
- [x] Share the prototype source (seed.sql, seed.json) — Natalie <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Merge PRs #7 (staff app) and #14 (design doc) once the secret scan passes — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Bring the backend and guest-portal branches into `main` (PRs #25, #26) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [x] No AI in the first version; AAFE confirms Oct 15 — Team <!-- modified 2026-10-08 04:15 Aisling -->
- [ ] Ask AAFE for written approval of the logo and event photos for Demo Day; swap the name-badge photo — Natalie <!-- updated 2026-10-03 12:36 Aisling -->
- [x] Seed loader: Natalie's data with random hashed tokens and draft-only emails — Backend pair <!-- modified 2026-10-05 22:58 Aisling -->

## Added October 6
<!-- new 2026-10-05 22:58 Aisling -->

- [x] Import engine: reads the real export, splits guest lists, matches buyers and guests (PR #23) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Tier mapping and gala page filter from Natalie's review (spec PR #22; built in PRs #23–#26) — Aisling <!-- modified 2026-10-06 05:50 Aisling -->
- [x] Three import choices decided and posted for Natalie's review (PR #24) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Backend tests run on PRs that touch `prototype/` or `import-engine/` (PR #26) — Aisling <!-- modified 2026-10-06 05:50 Aisling -->
- [x] Review and merge PR #27 (after #35 brought it up to date with `main`), Oct 7 — Aisling <!-- modified 2026-10-07 19:15 Aisling -->
- [x] Natalie's review of the three import choices: pre-fill reaffirmed Oct 7 (PR #58 closed) — Natalie <!-- modified 2026-10-08 04:15 Aisling -->
- [ ] Share Pursuit's PRD with the backend pair (Natalie's two PRDs were shared Oct 7) — whoever has it <!-- modified 2026-10-08 04:15 Aisling -->
- [ ] Trello access for Cornell — Natalie <!-- modified 2026-10-06 06:12 Aisling -->
- [ ] Supabase project URL and public (anon) key to Cornell, in person, after the team picks the demo's Supabase project: invite his email and a non-staff test email in Supabase, add his staff_users row and the app's redirect URL, then set up his `.env.local` together (never the service_role key) — Aisling <!-- modified 2026-10-08 04:15 Aisling -->
- [ ] Upload screen: import engine, report, page picker, tier-mapping picker — Frontend pair <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Staff app: show "sent" and "resend" for QR codes instead of the code itself — Frontend pair <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Portal: "From your purchase: please confirm" labels (Korean done, PR #51) — Frontend pair <!-- modified 2026-10-07 19:15 Aisling -->
- [x] Frontend build check, demo-data drift check, real-data guard in CI — Backend pair <!-- modified 2026-10-06 01:13 Aisling -->
- [x] Aisling's test Supabase project loaded (schema, seed, backend); access rules (RLS) on for all 18 tables (19 today); Supabase advisor warnings cut from 41 to 31, all by design (PR #30; 28, then 31 with the export functions) — Aisling <!-- modified 2026-10-08 04:15 Aisling -->
- [x] Real-data guard required before merging to `main`, alongside the secret scan — Aisling <!-- updated 2026-10-06 03:05 Aisling -->
- [x] ~~Informal client demo, Wednesday Oct 7~~ Replaced by the first prototype review with AAFE on Oct 15 (moved from Oct 19 on Oct 7) — Natalie <!-- modified 2026-10-07 22:38 Aisling -->

## Added October 6 (evening)
<!-- new 2026-10-06 20:41 Aisling -->

- [x] Exports built and loaded into Aisling's test Supabase project (PR #34) — Aisling <!-- modified 2026-10-07 20:23 Aisling -->
- [x] Antonin's sponsor portal prototype reviewed — Natalie, Aisling <!-- updated 2026-10-06 20:41 Aisling -->
- [x] Merge PR #36: keys kept out of the browser and the repo, app unit tests in CI — Aisling <!-- modified 2026-10-06 20:56 Aisling -->
- [x] Add the 20 staff sign-in tests to #35 — Aisling <!-- modified 2026-10-06 20:56 Aisling -->
- [ ] Live sign-in test, in person with Aisling on Saturday, Oct 10, on Aisling's test project until the team picks the demo's: sign-in, then the staff app's server roles (PR #72) with real accounts (#35 and #27 merged Oct 7) — Cornell <!-- modified 2026-10-08 16:40 Aisling -->
- [ ] Port tier layout, the "still need names" line, and gala-night arrivals into `guest-portal` as small PRs, screenshots first (Korean done, PR #51; "still need names" is PR #77) — Antonin (Natalie approves) <!-- modified 2026-10-08 16:40 Aisling -->
- [ ] Switch the prototype's demo emails to `@example.org`; confirm the Figma Make site isn't published — Antonin <!-- updated 2026-10-06 20:41 Aisling -->
- [x] Team PRDs: Natalie's enterprise and client-facing PRDs (Oct 7) — Natalie <!-- modified 2026-10-08 04:15 Aisling -->
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
- [x] Load PRs #42–#66 into Aisling's test Supabase project (Oct 8): `npm run db:backend`, then `npm run db:advisors`, 40 warnings (41 after PR #71, 43 after PR #72), all by design; try a data set with `npm run db:load -- <set>` — Aisling <!-- modified 2026-10-08 16:40 Aisling -->
- [ ] Set up the Vercel demo: three projects (staff app, guest portal, iPad check-in app at `prototype/checkin-app`); the Supabase URL and public key in Vercel's settings only — Aisling <!-- modified 2026-10-08 04:15 Aisling -->
- [x] ~~Check-in screen: wire in the offline module (`CheckInDesk`) and the "Offline · N check-ins waiting" banner~~ Superseded by the iPad check-in app (PR #56) and connecting it to the backend (Added October 8) — Frontend pair <!-- modified 2026-10-08 04:15 Aisling -->
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
- [x] Three labeled data sets (Small, Full as sent, Full fixed), one loaded at a time: built from the iPad door list, with a picker in the staff app and portal and `npm run db:load -- <set>` for Supabase (#18, PR #66) — Aisling <!-- modified 2026-10-08 04:15 Aisling -->
- [x] iPad check-in app PR (PR #56, merged Oct 8) — Natalie <!-- modified 2026-10-08 01:50 Aisling -->
- [ ] After-gala results, Give Lively fee analytics, a seating map that staff control, and a simulated Salesforce push — Natalie (screens), Aisling (backend) <!-- new 2026-10-07 22:38 Aisling -->

## Added October 8
<!-- new 2026-10-08 01:50 Aisling -->

- [x] Review the iPad check-in app; it merged Oct 8 (PR #56) — Aisling <!-- new 2026-10-08 01:50 Aisling -->
- [x] Check-in sync: Undo or Close while a check-in is sending no longer loses it, with tests (PR #60) — Aisling <!-- new 2026-10-08 01:50 Aisling -->
- [x] QR code generator gives the full 128 random bits (PR #61) — Aisling <!-- new 2026-10-08 01:50 Aisling -->
- [x] Door list: invented names in place of 12 real organizations; screenshots retaken (PR #62) — Aisling <!-- new 2026-10-08 01:50 Aisling -->
- [x] Connect the iPad app to the backend, following Natalie's "To connect" list in PR #56: door list from the server, QR hash and expiry, `CheckInDesk` sync, staff sign-in, undo by the same person or an admin, clear on sign-out; the demo sync server stays for demo mode (PR #71) — Aisling <!-- modified 2026-10-08 05:40 Aisling -->
- [ ] First live run of the iPad app on the real Supabase project, with the in-person sign-in test: add the iPad app's address to the redirect URLs, set `checkin-app/.env.local` — Aisling, Cornell <!-- new 2026-10-08 05:40 Aisling -->
- [ ] iPad app: app manifest, opening offline, camera QR scanning on a real iPad — Natalie <!-- new 2026-10-08 01:50 Aisling -->
- [x] Scripts to rebuild the iPad app's double-click file and retake its screenshots (PR #65) — Aisling <!-- new 2026-10-08 04:15 Aisling -->
- [ ] Pick the demo's Supabase project and its owner — Team <!-- new 2026-10-08 04:15 Aisling -->
- [x] iPad app: build guard, CI build and drift check for `OPEN-CheckIn-App.html`, before its Vercel project gets keys (PR #70) — Aisling <!-- modified 2026-10-08 05:10 Aisling -->
- [x] Hub cleanup from the Oct 8 audit, and Screens split into Live build and Early sketches — Aisling <!-- new 2026-10-08 04:15 Aisling -->

## Added October 8 (evening)
<!-- new 2026-10-08 16:40 Aisling -->

- [x] Review PRs #72 (server roles) and #73 (setup) and fix what the review found, each with tests: gala date and deadline changes move QR e-tickets and sponsor links; payment, pledge and comp forms save once on a double-click; no reload when sign-in refreshes; walk-ins and unnamed seats on the volunteer's list; full paging; a sponsor's full history; Node 22.18 or newer. Both merged Oct 8 — Aisling, Cornell <!-- new 2026-10-08 16:40 Aisling -->
- [x] Audit after the merge: every test suite, the backend re-run on Aisling's test project (43 advisor warnings, all by design), 22 live role and cascade checks there, and the staff app clicked through in the browser — Aisling <!-- new 2026-10-08 16:40 Aisling -->
- [x] Fix four bugs the audit found, each with a test that fails on the old code (PR #78): the Give Lively key could end up in a saved error message; removing a guest who had a QR invitation failed in the portal; guests pre-filled from Give Lively had no history entry; an offline check-in could be backdated to take over someone else's — Aisling <!-- modified 2026-10-08 17:10 Aisling -->
- [x] Smaller audit findings, fixed with tests in the same PR (#78): a Give Lively refund recomputes the payment status from that payment alone; clearing the gala's deadline leaves links on the old one; the portal's ticket-holder check uses the tier id; two changes aren't logged; check-ins don't check the gala — Aisling <!-- modified 2026-10-08 17:10 Aisling -->
- [x] Supabase advisor warnings from 43 to 1: the functions the apps call moved to a private schema behind same-name wrappers, Supabase's recommended fix; checked live on Aisling's test project (PR #78) — Aisling <!-- new 2026-10-08 17:10 Aisling -->
- [x] What's new: six of Oct 8's timestamps were written in UTC; corrected to New York time (read status is kept) — Aisling <!-- new 2026-10-08 17:10 Aisling -->
- [ ] Full audit of the whole system, frontend and backend, now that PR #78 is merged (Oct 8) — Aisling <!-- modified 2026-10-09 00:05 Aisling -->
- [x] A code map in the hub: every file as a node with what it does and which files it works with; click one to see its purpose, its code and its connections. Done: the [Code map](#codemap) page, with each file's purpose, a code preview, and the links into the database (app calls, tables, access rules, triggers) — Aisling <!-- modified 2026-10-09 00:45 Aisling -->
- [ ] Decide when sponsor links stop working: three options on the [PR review plan](https://claude.ai/artifact/M25oqGpKjoyXbZiUc1UFGB) (A at the deadline, today; B edit until the deadline, view until the day after the gala, recommended; C edit until after the gala). PR #75 waits on it: with option A, live sponsors never see its "list is closed" card, because their link stops at the same moment — Natalie, then AAFE <!-- modified 2026-10-09 00:05 Aisling -->
- [ ] PR #76 (portal accessibility): split into five small PRs with screenshots, or merge it whole once its two double-click files are rebuilt, as the Oct 8 review suggests. It also changes the shared dialog and form fields the staff and iPad apps use, so Natalie checks those apps too; fields without an id get duplicate ids — Aisling (Natalie decides) <!-- modified 2026-10-09 00:05 Aisling -->
- [ ] PR #77 ("N guests still need names"): hide the line after the deadline once #75 is in, a little more space under the progress bar, then Natalie's approval — Antonin <!-- modified 2026-10-09 00:05 Aisling -->
- [ ] Decide whether gala admins keep direct table edits on the gala, tiers, tables and staff list now that the staff app saves through server functions (one shared rule covers all four) — Aisling <!-- new 2026-10-08 16:40 Aisling -->

## Added October 8 (night)
<!-- new 2026-10-09 00:05 Aisling -->

- [x] iPad check-in: a larger AAFE mark and a tidier search row in portrait, screenshots retaken (PR #81) — Natalie <!-- new 2026-10-09 00:05 Aisling -->
- [x] iPad follow-ups: the mark goes back to its small size while searching, so the list keeps its room above the keyboard; Tab follows the screen in portrait; checked at four iPad sizes (PR #82) — Aisling <!-- new 2026-10-09 00:05 Aisling -->
- [x] Review Antonin's portal PRs #75–#77, each tested merged with `main` (90 tests, build, translation and real-data checks pass), and send the findings to Natalie first, since the portal is hers. Suggested order: #77, then #75 with a hide check, then #76 once its files are rebuilt — Aisling <!-- new 2026-10-09 00:05 Aisling -->
- [ ] Natalie's take on Antonin's six portal PRs (#75–#77 reviewed Oct 8; #84–#86 opened since), then the notes go on the PRs for Antonin. Merge order once approved: #77 → #75 → #76 → #84 → #86 → #85, one at a time, rebuilding the double-click files between merges. His questions for Natalie: Poppins for the portal, a darker input border, full name or first and last (maybe for AAFE on Oct 15), and the PRD still saying Korean is dropped — Natalie, then Aisling <!-- modified 2026-10-09 06:10 Aisling -->
- [x] Natalie's enterprise PRD approved by Pursuit and submitted in Pathfinder under Build — Natalie, Aisling <!-- new 2026-10-09 00:05 Aisling -->
- [ ] Submit Natalie's enterprise PRD in Pathfinder under Build, for the team's PRD milestone — Cornell, Antonin <!-- new 2026-10-09 00:05 Aisling -->
- [ ] Confirm the in-person sign-in test: Saturday, Oct 10, 12 PM, at the Pursuit building — Cornell <!-- new 2026-10-09 00:05 Aisling -->
- [x] Code map page in the hub, built from the code with graphify; iPad screenshots on Live build retaken with #81 and #82 — Aisling <!-- new 2026-10-09 00:05 Aisling -->
- [ ] Wire the 14 database functions no screen calls yet to the staff app: the three exports, the import and its review, the email queue, the sponsor pipeline, sponsor arrivals (found with the Code map). Split into five slices on Oct 9 (Added October 9) — Backend pair, with the frontend pair for the screens <!-- modified 2026-10-09 06:10 Aisling -->

## Added October 9
<!-- new 2026-10-09 06:10 Aisling -->

- [x] Slice A: the three export buttons call the server's export functions; the demo builds the same rows as the database (PR #87) — Aisling <!-- new 2026-10-09 06:10 Aisling -->
- [x] Unix line endings for every text file on every computer, after a Windows checkout failed CI's drift check on #87 (PR #88) — Aisling <!-- new 2026-10-09 06:10 Aisling -->
- [ ] Slice B: the approval list reads the server's email queue, fixing an approved email still showing "Approve and send", plus a "Draft guest-list reminders" button (PR #89; Natalie's sign-off, then merge) — Aisling <!-- new 2026-10-09 06:10 Aisling -->
- [ ] Slice C: the Give Lively import screen: upload, gala-page and tier-mapping pickers, review queue; the staff app takes the import engine as a dependency (probably two or three PRs) — Aisling, frontend pair for the screens <!-- new 2026-10-09 06:10 Aisling -->
- [ ] Slice D: the sponsor pipeline page, from Natalie's screen design — Aisling (data), Natalie (screen) <!-- new 2026-10-09 06:10 Aisling -->
- [ ] Slice E: the sponsor-arrivals switch on Gala information, off until AAFE's privacy review says yes — Aisling <!-- new 2026-10-09 06:10 Aisling -->
- [x] AAFE check-in prep: a one-page sheet and two backup recordings (1:30 with captions, 3:20 narrated with an offline voice), posted to the team channel — Aisling <!-- new 2026-10-09 06:10 Aisling -->
- [ ] AAFE check-in, Oct 9 around noon: record the decisions on Decisions, then settle #75 and the name-field question — Aisling, Natalie <!-- new 2026-10-09 06:10 Aisling -->
- [x] Hub audit: every page current to Oct 9; team-only material out of client view (team decisions, team risks, team documents, who builds what); walkthrough videos on Live build with grey placeholders — Aisling <!-- new 2026-10-09 06:10 Aisling -->
- [x] Rebuild the Code map with graphify's SQL support (`graphifyy[sql]`, installed on Aisling's laptop Oct 9): the exports now show as connected; 11 functions left to wire — Aisling <!-- new 2026-10-09 06:10 Aisling -->
- [ ] After #89 merges: re-record the hub's narrated walkthrough so the approval list shows each email's sponsor and seats — Aisling <!-- new 2026-10-09 06:10 Aisling -->

## Week of October 12

- [x] Connect staff app pages to the backend's pledges, payments, comps, and seats (with #9; PR #72) — Backend pair <!-- modified 2026-10-08 16:40 Aisling -->
- [x] Give Lively import: real export, free-text guest lists (import engine, PRs #23–#24) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [x] Connect the staff dashboard and guest grid to the backend: every page reads through the server's access rules when Supabase keys are set (PR #72) — Frontend pair <!-- modified 2026-10-08 16:40 Aisling -->
- [ ] Prepare the Oct 15 prototype review with AAFE — Frontend pair <!-- modified 2026-10-08 04:15 Aisling -->

## Week of October 19

- [x] Matching, review queue, corrections that survive re-import (database side, PR #26) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->
- [ ] Sponsor guest form on private links — Frontend pair, with Backend pair <!-- modified 2026-10-05 20:37 Aisling -->
- [ ] Gaps by owner, goal tracking, review before print — Frontend pair <!-- modified 2026-10-05 20:37 Aisling -->

## Week of October 26

- [x] Exports: staff app buttons for the badge file, check-in list and Salesforce file (database side PR #34; buttons PR #87, Oct 9) — Frontend pair, with Backend pair <!-- modified 2026-10-09 06:10 Aisling -->
- [ ] Approval screen in the staff app (templates and the queue are built, PR #44; the existing list now reads the queue, in review, PR #89) — Frontend pair <!-- modified 2026-10-09 06:10 Aisling -->
- [x] Check-in app: search, arrivals, walk-ins, blank sponsor seats (iPad app, PR #56) — Natalie <!-- modified 2026-10-08 04:15 Aisling -->
- [ ] Show AAFE the full path for feedback — Natalie

## Week of November 2

- [ ] AAFE branding; AAFE signs off the translation sheet — Frontend pair <!-- modified 2026-10-08 04:15 Aisling -->
- [ ] End-to-end tests, accessibility, data-handling check — Everyone
- [x] QR e-tickets stored hashed, one per seat, expiring (issue #10, PR #26) — Aisling <!-- modified 2026-10-05 22:58 Aisling -->

## Week of November 9

- [ ] Demo deploy, setup docs, handoff package, production-readiness notes — Everyone <!-- modified 2026-10-05 20:37 Aisling -->
- [ ] Demo rehearsal with synthetic data — Everyone
