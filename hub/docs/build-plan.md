# Build plan
<!-- updated 2026-10-05 22:58 Aisling component status -->
<!-- reviewed 2026-10-06 Aisling -->

Core features land by October 30, leaving the last ten days for testing and handoff. We deliver a working prototype with invented data; production hosting is not part of the plan. Build work is split between two pairs (decided Oct 5): **Frontend pair: Natalie + Antonin** (staff app, sponsor portal, check-in, branding) and **Backend pair: Aisling + Cornell** (Supabase backend, import, sign-in and roles, secure links, exports, emails). Natalie also stays product lead and client contact. <!-- modified 2026-10-05 20:37 Aisling -->

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
C7 | Follow-up emails | 2026-10-26 | 2026-11-01 | backend | 1.5–2 | 4–5
C8 | Exports | 2026-10-26 | 2026-10-30 | backend | 1 | 2–3
C9 | Check-in app | 2026-10-26 | 2026-11-06 | frontend | 2–3 | 6–8
milestone | AAFE feedback on the full path | 2026-10-30
C10 | Branding and languages | 2026-11-02 | 2026-11-06 | frontend | 1–2 | 3–4
C11 | Testing and security | 2026-11-02 | 2026-11-08 | shared | 2–3 | 5–7
C12 | Demo deploy and handoff | 2026-11-03 | 2026-11-09 | shared | 2 | 4–5
milestone* | Demo Day | 2026-11-10
```

```notes
Read it left to right: setup and data the first week, the import and the sponsor form in the middle, check-in and exports last, then ten days to test and hand off.
```

## Components

| # | Component | What it delivers | Priority | Pair <!-- modified 2026-10-05 20:37 Aisling --> |
| --- | --- | --- | --- | --- |
| C0 | Setup and guardrails | Repo, CI, secret scanning, demo preview environment | P0 | Backend <!-- modified 2026-10-05 20:37 Aisling --> |
| C1 | Data model and test data | Schema, migrations, ~550 invented guests with duplicates and gaps | P0 | Backend <!-- modified 2026-10-05 20:37 Aisling --> |
| C2 | Sign-in and roles | Supabase sign-in; admin, staff, check-in roles enforced on the server | P0 | Backend <!-- modified 2026-10-05 20:37 Aisling --> |
| C3 | Commitments and seats | Packages, tickets, sponsorships, comps, payment labels, manual entry | P0 | Backend <!-- modified 2026-10-05 20:37 Aisling --> |
| C4 | Import and matching | Real Give Lively export, free-text guest-list splitting, duplicate detection, review queue, corrections that survive; about 9–11 Claude Code sessions | P0 | Backend <!-- modified 2026-10-05 20:37 Aisling --> |
| C5 | Sponsor guest form | Private link, slots per package, editable until the deadline | P0 | Frontend (backend pair for its database functions) <!-- modified 2026-10-05 20:37 Aisling --> |
| C6 | Staff dashboard | Gaps by owner, goal tracking, guest grid, review before print | P0 | Frontend <!-- modified 2026-10-05 20:37 Aisling --> |
| C7 | Follow-up emails | Drafts, staff approval, send or copy out | P1 | Backend <!-- modified 2026-10-05 20:37 Aisling --> |
| C8 | Exports | Badge mail merge, check-in list, Salesforce file | P0 | Backend <!-- modified 2026-10-05 20:37 Aisling --> |
| C9 | Check-in app | iPad search, arrivals, walk-ins, blank sponsor seats; QR e-tickets (hashed per seat, built in the backend) | P1 | Frontend <!-- modified 2026-10-05 22:58 Aisling --> |
| C10 | Branding and languages | aafe.org look; sponsor form in four languages | P1 | Frontend <!-- modified 2026-10-05 20:37 Aisling --> |
| C11 | Testing and security | End-to-end tests, accessibility, data-handling check | P0 | Everyone |
| C12 | Demo deploy and handoff | Demo preview, setup docs, handoff package, production-readiness notes, rehearsal | P0 | Everyone <!-- modified 2026-10-05 20:37 Aisling --> |

## Where each component stands
<!-- new 2026-10-05 22:58 Aisling -->

As of October 6. Natalie's backend and guest portal are now in `main` (PRs #25 and #26), so the backend pair builds on her work instead of starting over. <!-- new 2026-10-05 22:58 Aisling -->

| # | Component | Status | Done | Next <!-- new 2026-10-05 22:58 Aisling --> |
| --- | --- | --- | --- | --- |
| C0 | Setup and guardrails | Mostly done | Every check runs on every PR and all six are required on `main`, including a server function type-check (PR #40); import engine, backend, and frontend build checks; demo-data drift check; `main` protected; Supabase CLI pinned (2.119.0) with db scripts; team Supabase project loaded, access rules on for all 18 tables, advisor warnings 41 → 28, all by design (PR #30); build guard and demo-file guard keep secret keys out of the browser and the repo, Supabase secret-scan rules, key inventory, app unit tests in CI (PR #36) | Demo preview host <!-- modified 2026-10-06 21:33 Aisling --> |
| C1 | Data model and test data | In progress | Natalie's Supabase schema and seed in `main`; import tables added; demo data fixed for rule 6 (random links and QR codes, fictional phones) | Messier test data (~550 guests) for the import tests <!-- new 2026-10-05 22:58 Aisling --> |
| C2 | Sign-in and roles | In review | Emailed one-time sign-in link, role from the staff list (Cornell, PR #27); brought up to date with `main` in #35 (conflicts fixed, demo file rebuilt); reviewed; 20 sign-in tests added to #35 | Cornell merges #35; live test once Cornell has the keys; then server-side roles (issue #9) <!-- modified 2026-10-06 20:56 Aisling --> |
| C3 | Commitments and seats | Built in the backend | Pledges, payments, comps, seats, and seat statuses in Natalie's backend | Connect the staff app pages to it (with #9) <!-- new 2026-10-05 22:58 Aisling --> |
| C4 | Import and matching | Ahead of schedule | Import engine (94 tests) and database side (backend tests, 119 in all, including a real-format CSV end to end); tier mapping; gala page filter; review queue | Upload screen and tier-mapping picker in the staff app (frontend pair) <!-- modified 2026-10-06 06:30 Aisling --> |
| C5 | Sponsor guest form | Source in `main` | Natalie's portal: slots per package, hashed private links, English, 中文, Español; Antonin's prototype reviewed as a design reference (Oct 6) | Port as small PRs, screenshots first, Natalie approves: tier-based layout, "N guests still need names · add by May 11", Korean, gala-night arrivals; "From your purchase: please confirm" labels; connect to the backend <!-- modified 2026-10-06 20:41 Aisling --> |
| C6 | Staff dashboard | Prototype | Natalie's staff app (offline demo data) | Connect to the backend; gaps by owner <!-- new 2026-10-05 22:58 Aisling --> |
| C7 | Follow-up emails | Built in the backend | Draft queue, staff approval, sending through Resend | Deadline reminder and receipt templates; approval screen <!-- new 2026-10-05 22:58 Aisling --> |
| C8 | Exports | Database side done, live | Badge file with table numbers, printed check-in list, and Salesforce attendee file from the database, role-checked and logged, 18 tests (PR #34); loaded into the team Supabase project Oct 6 (31 advisor warnings, all by design) | Staff app buttons call them; match AAFE's badge and check-in templates when they arrive <!-- modified 2026-10-06 20:41 Aisling --> |
| C9 | Check-in app | Partly built | Check-in screen in the staff app; QR codes hashed per seat and expiring (issue #10); printed check-in list export for the door (PR #34) | Connect to the backend; walk-ins; offline; sponsors see their guests' arrivals (decided Oct 6, AAFE privacy review first) <!-- modified 2026-10-06 20:41 Aisling --> |
| C10 | Branding and languages | In progress | Design system (PR #14); AAFE orange and white; Korean drafted in Antonin's prototype | Bring Korean into the portal; AAFE review of translations; Demo Day photo approval <!-- modified 2026-10-06 20:41 Aisling --> |
| C11 | Testing and security | In progress | 221 automated tests (94 import engine, 119 backend, 8 app); 20 sign-in tests in #35; secret keys kept out of the browser and the repo (PR #36) | The testing list below <!-- modified 2026-10-06 20:56 Aisling --> |
| C12 | Demo deploy and handoff | Not started | Prototype demonstration set for Oct 19 | Pick the demo host; rotate every key at handoff <!-- modified 2026-10-06 20:41 Aisling --> |

## Testing: what to add
<!-- new 2026-10-05 22:58 Aisling -->
<!-- team -->

What the automated checks don't cover yet, most important first. <!-- new 2026-10-05 22:58 Aisling -->

| # | Add | Why <!-- new 2026-10-05 22:58 Aisling --> |
| --- | --- | --- |
| 1 | ~~Frontend build check in CI~~ Done (PR #28) | Nothing checked that the staff app and portal still build <!-- modified 2026-10-06 03:06 Aisling --> |
| 2 | ~~Demo-data drift check~~ Done (PR #28) | Regenerate the seed and fail if it differs from what's committed <!-- modified 2026-10-06 03:06 Aisling --> |
| 3 | ~~Real-data guard~~ Done (PR #28), required on `main` | Fail on any email outside the reserved demo domains (example.org/.com/.net, .test) or phone outside 555-0100–0199 (hard rule 1) <!-- modified 2026-10-06 05:50 Aisling --> |
| 4 | Email and sync function tests | Started: both are type-checked in CI (PR #40). Behaviour tests still to write: prove an unapproved email never sends and codes are stored only as hashes <!-- modified 2026-10-06 21:33 Aisling --> |
| 5 | Access rules for every table and role | Access rules (RLS) are on for every table; tests cover only a few role and table pairs <!-- modified 2026-10-06 05:50 Aisling --> |
| 6 | Sponsor link limits | Expires after the deadline; can't see another order, payments, or staff notes <!-- new 2026-10-05 22:58 Aisling --> |
| 7 | Every staff action is logged | One test walking each staff function <!-- new 2026-10-05 22:58 Aisling --> |
| 8 | Frontend tests | Started: app test setup and 8 build-guard tests (PR #36); 20 sign-in tests in #35. Still to write: guest slots, editing locked after the deadline, every language has every phrase <!-- modified 2026-10-06 20:56 Aisling --> |
| 9 | Page smoke and accessibility test | The two single-file pages load without errors and pass an accessibility check <!-- new 2026-10-05 22:58 Aisling --> |
| 10 | Import edge cases | Daylight-saving day, a 2,000-row file, "Internal Name" only <!-- new 2026-10-05 22:58 Aisling --> |
| 11 | Real guest lists | Once AAFE sends more redacted rows <!-- new 2026-10-05 22:58 Aisling --> |
| 12 | Live sign-in test | Against the team Supabase project once Cornell has the keys: invited email, email not on the staff list, volunteer, reload, sign out <!-- updated 2026-10-06 20:41 Aisling --> |

## Capacity
<!-- team -->

```ranges
title: Person-days of work against what the team has
max: 90
band: Team capacity, Oct 5 – Nov 9 | 45 | 60
Built by hand | 58 | 80 | hand | QR backend already done (PR #26)
AI-assisted | 22 | 30 | ai | QR backend already done (PR #26)
```

| | Real world | AI-assisted |
| --- | --- | --- |
| All core components (C0–C12) | 58–80 days | 22–30 days <!-- removed 2026-10-06 06:12 Aisling Stretch row for QR tickets: QR is should have, backend done in PR #26 --> |
| Team capacity, Oct 5 – Nov 9 (assumed) | About 45–60 days | About 45–60 days |

Built by hand, the scope exceeds what the team can deliver. AI-assisted, it fits with room for client feedback and rework. The capacity figure assumes four people in two pairs at three to four focused days a week. <!-- modified 2026-10-05 20:37 Aisling -->

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
