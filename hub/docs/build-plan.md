# Build plan
<!-- updated 2026-10-05 22:58 Aisling component status -->
<!-- reviewed 2026-10-08 Aisling -->

Core features land by October 30, leaving the last ten days for testing and handoff. We deliver a working prototype with invented data; production hosting is not part of the plan. Build work is split into two areas, frontend and backend; who builds each part is on [Overview](#overview.team). <!-- modified 2026-10-08 08:15 Aisling -->

Estimates are person-days of focused work: "AI" assumes the builder works in Claude Code and reviews everything it writes; "real" assumes coding mostly by hand. <!-- modified 2026-10-05 20:37 Aisling -->

```timeline
start: 2026-10-05
end: 2026-11-10
C0 | Setup and guardrails | 2026-10-05 | 2026-10-09 | backend | 1 | 3–5
C1 | Data model and test data | 2026-10-05 | 2026-10-11 | backend | 1–2 | 4–6
C2 | Sign-in and roles | 2026-10-05 | 2026-10-11 | backend | 1 | 3–4
C3 | Commitments and seats | 2026-10-12 | 2026-10-18 | backend | 2–3 | 6–8
C4 | Import and matching | 2026-10-07 | 2026-10-16 | backend | 5–6 | 9–12
C6 | Staff dashboard | 2026-10-12 | 2026-10-25 | frontend | 2–3 | 6–8
C5 | Sponsor guest form | 2026-10-19 | 2026-10-25 | frontend | 2–3 | 5–7
C7 | Follow-up emails | 2026-10-19 | 2026-10-25 | backend | 1.5–2 | 4–5
C8 | Exports | 2026-10-19 | 2026-10-23 | backend | 1 | 2–3
C9 | Check-in app | 2026-10-12 | 2026-10-23 | frontend | 2–3 | 6–8
C13 | Demo Day additions | 2026-10-12 | 2026-11-01 | shared | 4–6 | 12–16
milestone | First prototype review with AAFE | 2026-10-15
milestone | AAFE feedback on the full path | 2026-10-30
C10 | Branding and languages | 2026-11-02 | 2026-11-06 | frontend | 1–2 | 3–4
C11 | Testing and security | 2026-11-02 | 2026-11-08 | shared | 2–3 | 5–7
C12 | Demo deploy and handoff | 2026-11-03 | 2026-11-09 | shared | 2 | 4–5
milestone* | Demo Day | 2026-11-10
```

```notes
Read it left to right: setup and data the first week, then the import, the staff dashboard and the sponsor form, with AAFE's first look on Oct 15. Emails, exports and check-in are largely built (PRs #44, #34, #56), so their bars show only what's left: the approval screen, the export buttons, and connecting the iPad app. The Oct 7 Demo Day additions (C13) run alongside. Then ten days to test and hand off. Each estimate is the whole component, built part included.
```

## Components

| # | Component | What it delivers | Priority | Pair <!-- modified 2026-10-05 20:37 Aisling --> |
| --- | --- | --- | --- | --- |
| C0 | Setup and guardrails | Repo, CI, secret scanning, demo preview environment | P0 | Backend <!-- modified 2026-10-05 20:37 Aisling --> |
| C1 | Data model and test data | Schema, migrations, ~550 invented guests with duplicates and gaps | P0 | Backend <!-- modified 2026-10-05 20:37 Aisling --> |
| C2 | Sign-in and roles | Supabase sign-in; admin, staff, check-in roles enforced on the server | P0 | Backend <!-- modified 2026-10-05 20:37 Aisling --> |
| C3 | Commitments and seats | Packages, tickets, sponsorships, comps, payment labels, manual entry | P0 | Backend <!-- modified 2026-10-05 20:37 Aisling --> |
| C4 | Import and matching | Real Give Lively export, free-text guest-list splitting, duplicate detection, review queue, corrections that survive | P0 | Backend <!-- modified 2026-10-07 23:27 Aisling --> |
| C5 | Sponsor guest form | Private link, slots per package, editable until the deadline | P0 | Frontend (backend pair for its database functions) <!-- modified 2026-10-05 20:37 Aisling --> |
| C6 | Staff dashboard | Gaps by owner, goal tracking, guest grid, review before print | P0 | Frontend <!-- modified 2026-10-05 20:37 Aisling --> |
| C7 | Follow-up emails | Drafts, staff approval, send or copy out | P1 | Backend <!-- modified 2026-10-05 20:37 Aisling --> |
| C8 | Exports | Badge mail merge, check-in list, Salesforce file | P0 | Backend <!-- modified 2026-10-05 20:37 Aisling --> |
| C9 | Check-in app | iPad, A to Z by last name, search, arrivals, walk-ins, blank sponsor seats, works offline; QR e-tickets (hashed per seat, built in the backend) | P0 (Oct 7) | Frontend <!-- modified 2026-10-07 22:38 Aisling --> |
| C10 | Branding and languages | aafe.org look; sponsor form in four languages | P1 | Frontend <!-- modified 2026-10-05 20:37 Aisling --> |
| C11 | Testing and security | End-to-end tests, accessibility, data-handling check | P0 | Everyone |
| C12 | Demo deploy and handoff | Demo preview, setup docs, handoff package, production-readiness notes, rehearsal | P0 | Everyone <!-- modified 2026-10-05 20:37 Aisling --> |
| C13 | Demo Day additions | After-gala results, Give Lively fee analytics, a seating map that staff control, a simulated Salesforce push (Oct 7, from Natalie's enterprise PRD) | P0 (Oct 7) | Natalie (screens), Aisling (backend) <!-- new 2026-10-08 08:15 Aisling --> |

## Where each component stands
<!-- new 2026-10-05 22:58 Aisling -->

As of October 8. Natalie's backend and guest portal are in `main` (PRs #25 and #26), so the backend pair builds on her work instead of starting over. PRs #42–#50 (Oct 6–7) added the email follow-ups, offline check-in, the sponsor pipeline, sponsor-facing arrivals (switched off), the translation review sheet, and a full-size test gala. Natalie's iPad check-in app joined `main` on Oct 8 (PR #56). <!-- modified 2026-10-08 01:50 Aisling -->

| # | Component | Status | Done | Next <!-- new 2026-10-05 22:58 Aisling --> |
| --- | --- | --- | --- | --- |
| C0 | Setup and guardrails | Mostly done | Every check runs on every PR and all six are required on `main`, including a server function type-check (PR #40); import engine, backend, and frontend build checks; demo-data drift check; `main` protected; Supabase CLI pinned (2.119.0) with db scripts; Aisling's test Supabase project loaded (her own account), access rules on for every table, advisor warnings 41 → 31, all by design (PR #30), 40 after PRs #42–#66 were loaded Oct 8; build guard and demo-file guard keep secret keys out of all three apps and the repo, Supabase secret-scan rules, key inventory, app unit tests in CI (PR #36; the iPad app's guard, CI build and demo-file drift check in PR #70) | Set up the Vercel demo; agree which Supabase project it uses <!-- modified 2026-10-08 09:10 Aisling --> |
| C1 | Data model and test data | Done | Natalie's Supabase schema and seed in `main`; import tables added; demo data fixed for rule 6 (random links and QR codes, fictional phones). Two different 553-guest galas: a messy test gala for the import tests only (PR #50), and three labeled demo data sets for the apps (Small with 48 guests; Full as sent and Full fixed, built around Natalie's iPad door list), one at a time, with a picker in the staff app and portal and `npm run db:load -- <set>` for Supabase (PR #66) | Load a Full set into the demo's Supabase project once it's picked <!-- modified 2026-10-08 08:15 Aisling --> |
| C2 | Sign-in and roles | Merged | Emailed one-time sign-in link, role from the staff list (Cornell, PR #27); brought up to date with `main` (PR #35); 20 sign-in tests; merged Oct 7 after every check passed on `main` plus #27 together | Live sign-in test once the team agrees which Supabase project the demo uses; then server-side roles (issue #9) <!-- modified 2026-10-07 19:15 Aisling --> |
| C3 | Commitments and seats | Built in the backend | Pledges, payments, comps, seats, and seat statuses in Natalie's backend | Connect the staff app pages to it (with #9) <!-- new 2026-10-05 22:58 Aisling --> |
| C4 | Import and matching | Ahead of schedule | Import engine (116 tests) and database side, including a real-format CSV end to end; tier mapping; gala page filter; review queue; daylight-saving days, a 2,000-row file, and Internal Name only (PR #46); the Give Lively sync's per-donation logic tested (PR #46); a 553-guest gala end to end in about 19 seconds (PR #50) | Upload screen and tier-mapping picker in the staff app (frontend pair); decide on names written in Chinese or Korean script <!-- modified 2026-10-07 23:27 Aisling --> |
| C5 | Sponsor guest form | Source in `main` | Natalie's portal: slots per package, hashed private links, English, 中文, 한국어, Español (Korean from Antonin, PR #51); Antonin's prototype reviewed as a design reference (Oct 6) | Port as small PRs, screenshots first, Natalie approves: tier-based layout, "N guests still need names · add by May 11", gala-night arrivals; "From your purchase: please confirm" labels; connect to the backend <!-- modified 2026-10-07 19:15 Aisling --> |
| C6 | Staff dashboard | Prototype; pipeline built in the backend | Natalie's staff app (offline demo data); sponsor pipeline in the backend: AAFE's stages, the ask against the commitment, the last two galas' giving, and a board against the goal (PR #48) | Connect to the backend; gaps by owner; pipeline board and prospect form <!-- modified 2026-10-07 13:45 Aisling --> |
| C7 | Follow-up emails | Built in the backend | Draft queue, staff approval, sending through Resend; payment confirmations, guest-list reminders, and an approval queue with each email's sponsor, seats, and payment (PR #44); every email change logged with old and new values (PR #42) | Approval screen in the staff app (frontend pair) <!-- modified 2026-10-07 13:45 Aisling --> |
| C8 | Exports | Database side done, live | Badge file with table numbers, printed check-in list, and Salesforce attendee file from the database, role-checked and logged, 18 tests (PR #34); loaded into Aisling's test Supabase project Oct 6 (31 advisor warnings, all by design) | Staff app buttons call them; match AAFE's badge and check-in templates when they arrive <!-- modified 2026-10-07 20:23 Aisling --> |
| C9 | Check-in app | iPad app in `main` | Natalie's iPad check-in app: tonight's gala only, 553 invented guests A to Z in AAFE's seven categories, search, check in one or several with undo, QR scan or typed code with a repeat-scan warning, approved exceptions, offline queue, dark mode (PR #56); Undo or Close while a check-in is sending no longer loses it (PR #60); invented names in place of 12 real organizations (PR #62). Backend: QR codes hashed per seat and expiring (issue #10); printed check-in list export (PR #34); offline check-in module (PR #46); sponsor-facing arrivals, switched off until AAFE approves (PR #49) | Connect the app to the backend (Natalie's "To connect" list): door list from the server, QR match on the hash with expiry, `CheckInDesk` sync, staff sign-in, clear the iPad on sign-out; then retire the demo sync server. Natalie: app manifest, opening offline, camera scanning on a real iPad <!-- modified 2026-10-08 01:50 Aisling --> |
| C10 | Branding and languages | In progress | Design system (PR #14); AAFE orange and white; all four languages in the portal, Korean added by Antonin (PR #51); translation review sheet for AAFE with every column filled (English, 中文, 한국어, Español) and no silent fallback to English (PR #50) | AAFE reviews the translations on the sheet; Demo Day photo approval <!-- modified 2026-10-07 19:15 Aisling --> |
| C11 | Testing and security | In progress | About 1,160 automated checks (982 backend, 116 import engine, 62 app): every staff action logged, every table and role, sponsor link limits, emails, the Give Lively sync, offline check-in, the pipeline, sponsor arrivals, translations (PRs #42–#50); check-in sync races (PR #60); every new QR code carries the full 128 random bits (PR #61); the three demo data sets load cleanly and keep the staff list (PR #66); 20 sign-in tests (PR #27); secret keys kept out of the browser and the repo (PR #36) | The testing list below <!-- modified 2026-10-08 08:15 Aisling --> |
| C12 | Demo deploy and handoff | Not started | First prototype review with AAFE set for Oct 15; demo host decided: Vercel's free plan (Oct 6) | Set up the three Vercel projects (staff app, guest portal, iPad app). The iPad app's demo sync server runs on one computer only, so a hosted iPad app won't sync until it's connected to Supabase. Rotate every key at handoff <!-- modified 2026-10-08 08:15 Aisling --> |

## Testing: what to add
<!-- new 2026-10-05 22:58 Aisling -->
<!-- team -->

What the automated checks don't cover yet, most important first. <!-- new 2026-10-05 22:58 Aisling -->

| # | Add | Why <!-- new 2026-10-05 22:58 Aisling --> |
| --- | --- | --- |
| 1 | ~~Frontend build check in CI~~ Done (PR #28) | Nothing checked that the staff app and portal still build <!-- modified 2026-10-06 03:06 Aisling --> |
| 2 | ~~Demo-data drift check~~ Done (PR #28) | Regenerate the seed and fail if it differs from what's committed <!-- modified 2026-10-06 03:06 Aisling --> |
| 3 | ~~Real-data guard~~ Done (PR #28), required on `main` | Fail on any email outside the reserved demo domains (example.org/.com/.net, .test) or phone outside 555-0100–0199 (hard rule 1) <!-- modified 2026-10-06 05:50 Aisling --> |
| 4 | ~~Email and sync function tests~~ Done (PRs #44, #46) | An unapproved email never sends; reminders, payment confirmations, and the queue; the Give Lively sync against the real import <!-- modified 2026-10-07 13:45 Aisling --> |
| 5 | ~~Access rules for every table and role~~ Done (PR #43) | Every table, view, and function against every kind of caller <!-- modified 2026-10-07 13:45 Aisling --> |
| 6 | ~~Sponsor link limits~~ Done (PR #43) | Expires after the deadline; can't see another order, payments, or staff notes <!-- modified 2026-10-07 13:45 Aisling --> |
| 7 | ~~Every staff action is logged~~ Done (PR #46) | It found two that weren't (sending a QR invitation, resending a link); both fixed. A new staff function fails until it is covered <!-- modified 2026-10-07 13:45 Aisling --> |
| 8 | Frontend tests | Started: app test setup and 8 build-guard tests (PR #36); 20 sign-in tests (PR #27); offline check-in module (PR #46); every language has every phrase, now four (PRs #50, #51); check-in sync races (PR #60); the demo data picker (PR #66). Still to write: guest slots, editing locked after the deadline; no tests yet for the iPad app's own screens <!-- modified 2026-10-08 08:15 Aisling --> |
| 9 | Page smoke and accessibility test | The three single-file pages (staff app, portal, iPad app) load without errors and pass an accessibility check <!-- modified 2026-10-08 08:15 Aisling --> |
| 10 | ~~Import edge cases~~ Done (PR #46); a full-size gala too (PR #50) | Daylight-saving days, a 2,000-row file, "Internal Name" only; 553 invented guests with messy guest lists <!-- modified 2026-10-07 13:45 Aisling --> |
| 11 | Real guest lists | Once AAFE sends more redacted rows <!-- new 2026-10-05 22:58 Aisling --> |
| 12 | Live sign-in test | Against the Supabase project the demo will use, once the team agrees on it and Cornell has its keys: invited email, email not on the staff list, volunteer, reload, sign out <!-- modified 2026-10-07 20:23 Aisling --> |

## Capacity
<!-- team -->

```ranges
title: Person-days of work against what the team has
max: 100
band: Team capacity, Oct 5 – Nov 9 | 45 | 60
Built by hand | 70 | 96 | hand | Includes the Oct 7 Demo Day additions (C13)
AI-assisted | 26 | 36 | ai | Includes the Oct 7 Demo Day additions (C13)
```

| | Real world | AI-assisted |
| --- | --- | --- |
| All core components (C0–C13) | 70–96 days | 26–36 days <!-- removed 2026-10-06 06:12 Aisling Stretch row for QR tickets: QR is should have, backend done in PR #26 --> <!-- modified 2026-10-08 08:15 Aisling --> |
| Team capacity, Oct 5 – Nov 9 (assumed) | About 45–60 days | About 45–60 days |

Built by hand, the scope exceeds what the team can deliver. AI-assisted, it still fits, but the Oct 7 additions (C13, 4–6 days) use much of the room left for client feedback and rework, so hold to P0 until the full path works on Oct 30. The capacity figure assumes four people in two pairs at three to four focused days a week. <!-- modified 2026-10-08 08:15 Aisling -->

- **AI saves the most** on setup, migrations, screens and forms, test scaffolding, sample data, and documentation.
- **It saves less** on matching rules, data-model decisions, integration debugging, and design judgment. These need careful review.
- **It doesn't speed up** AAFE's materials, translation review, client feedback, or rehearsal.

## Workload by pair
<!-- team -->

AI-assisted days per pair, added up from the timeline above. Shared work (testing, deploy, handoff) is split across everyone. <!-- modified 2026-10-05 20:37 Aisling -->

```workload
note: Natalie | Also product lead: PRDs, AAFE materials, client contact, translation review.
```

Pairs replaced single owners on Oct 5 so every area has two people on it. If one pair falls behind, the other pair takes a component, starting with the check-in app (C9) or exports (C8). <!-- modified 2026-10-05 20:37 Aisling -->

## Schedule risks
<!-- team -->

- **Late materials from AAFE.** Badge and check-in templates, Give Lively screen recordings, comp amounts, and goals per category are still to come; build against placeholders and adapt. <!-- modified 2026-10-06 05:50 Aisling -->
- **Uneven AI fluency and activity.** Each pair works together on every component, so no area depends on one person. <!-- modified 2026-10-05 20:37 Aisling -->
- **Scope creep toward a full event platform.** Hold to P0 until the full path works end to end.
