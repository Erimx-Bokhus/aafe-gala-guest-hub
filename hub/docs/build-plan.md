# Build plan
<!-- updated Oct 6 (component status) -->

Core features land by October 30, leaving the last ten days for testing and handoff. We deliver a working prototype with invented data; production hosting is not part of the plan. Build work is split between two pairs (decided Oct 5): **Frontend pair: Natalie + Antonin** (staff app, sponsor portal, check-in, branding) and **Backend pair: Aisling + Cornell** (Supabase backend, import, sign-in and roles, secure links, exports, emails). Natalie also stays product lead and client contact.

Estimates are person-days of focused work: "AI" assumes the builder works in Claude Code and reviews everything it writes; "real" assumes coding mostly by hand.

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

| # | Component | What it delivers | Priority | Pair |
| --- | --- | --- | --- | --- |
| C0 | Setup and guardrails | Repo, CI, secret scanning, demo preview environment | P0 | Backend |
| C1 | Data model and test data | Schema, migrations, ~550 invented guests with duplicates and gaps | P0 | Backend |
| C2 | Sign-in and roles | Supabase sign-in; admin, staff, check-in roles enforced on the server | P0 | Backend |
| C3 | Commitments and seats | Packages, tickets, sponsorships, comps, payment labels, manual entry | P0 | Backend |
| C4 | Import and matching | Real Give Lively export, free-text guest-list splitting, duplicate detection, review queue, corrections that survive; about 9–11 Claude Code sessions | P0 | Backend |
| C5 | Sponsor guest form | Private link, slots per package, editable until the deadline | P0 | Frontend (backend pair for its database functions) |
| C6 | Staff dashboard | Gaps by owner, goal tracking, guest grid, review before print | P0 | Frontend |
| C7 | Follow-up emails | Drafts, staff approval, send or copy out | P1 | Backend |
| C8 | Exports | Badge mail merge, check-in list, Salesforce file | P0 | Backend |
| C9 | Check-in app | iPad search, arrivals, walk-ins, blank sponsor seats; QR e-tickets (hashed per seat, built in the backend) | P1 | Frontend |
| C10 | Branding and languages | aafe.org look; sponsor form in four languages | P1 | Frontend |
| C11 | Testing and security | End-to-end tests, accessibility, data-handling check | P0 | Everyone |
| C12 | Demo deploy and handoff | Demo preview, setup docs, handoff package, production-readiness notes, rehearsal | P0 | Everyone |

## Where each component stands
<!-- new Oct 6 -->

As of October 6. Natalie's backend and guest portal are now in `main` (PRs #25 and #26), so the backend pair builds on her work instead of starting over.

| # | Component | Status | Done | Next |
| --- | --- | --- | --- | --- |
| C0 | Setup and guardrails | Mostly done | Secret scan on every PR; automatic checks for the import engine and the backend tests; `main` protected | Frontend build check; demo preview host |
| C1 | Data model and test data | In progress | Natalie's Supabase schema and seed in `main`; import tables added; demo data fixed for rule 6 (random links and QR codes, fictional phones) | Messier test data (~550 guests) for the import tests |
| C2 | Sign-in and roles | In progress | Emailed one-time sign-in link, role from the staff list (Cornell, PR #27, in review) | Roles checked on the server for every staff page (issue #9, Cornell) |
| C3 | Commitments and seats | Built in the backend | Pledges, payments, comps, seats, and seat statuses in Natalie's backend | Connect the staff app pages to it (with #9) |
| C4 | Import and matching | Ahead of schedule | Import engine (94 tests) and database side (97 backend tests, including a real-format CSV end to end); tier mapping; gala page filter; review queue | Upload screen and tier-mapping picker in the staff app (frontend pair) |
| C5 | Sponsor guest form | Source in `main` | Natalie's portal: slots per package, hashed private links, English, 中文, Español | "From your purchase: please confirm" on imported names; Korean; connect to the backend |
| C6 | Staff dashboard | Prototype | Natalie's staff app (offline demo data) | Connect to the backend; gaps by owner |
| C7 | Follow-up emails | Built in the backend | Draft queue, staff approval, sending through Resend | Deadline reminder and receipt templates; approval screen |
| C8 | Exports | Not started | Prototype CSV exports in the staff app | Badge file with table numbers, check-in list, Salesforce file from the database |
| C9 | Check-in app | Partly built | Check-in screen in the staff app; QR codes now hashed per seat and expiring (issue #10) | Connect to the backend; walk-ins; offline |
| C10 | Branding and languages | In progress | Design system (PR #14); AAFE orange and white | Korean; AAFE review of translations; Demo Day photo approval |
| C11 | Testing and security | In progress | 191 automated tests across the import engine and backend | The testing list below |
| C12 | Demo deploy and handoff | Not started | | Pick the demo host |

## Testing: what to add
<!-- new Oct 6 -->
<!-- team -->

What the automated checks don't cover yet, most important first.

| # | Add | Why |
| --- | --- | --- |
| 1 | Frontend build check in CI | Nothing checks that the staff app and portal still build |
| 2 | Demo-data drift check | Regenerate the seed and fail if it differs from what's committed |
| 3 | Real-data guard | Fail on any email outside `example.org` or phone outside 555-0100–0199 (hard rule 1) |
| 4 | Email and sync function tests | `send-emails` and `givelively-sync` have none: prove an unapproved email never sends and codes are stored only as hashes |
| 5 | Access rules for every table and role | Only a few are covered |
| 6 | Sponsor link limits | Expires after the deadline; can't see another order, payments, or staff notes |
| 7 | Every staff action is logged | One test walking each staff function |
| 8 | Frontend tests | None yet: guest slots, editing locked after the deadline, every language has every phrase |
| 9 | Page smoke and accessibility test | The two single-file pages load without errors and pass an accessibility check |
| 10 | Import edge cases | Daylight-saving day, a 2,000-row file, "Internal Name" only |
| 11 | Real guest lists | Once AAFE sends more redacted rows |

## Capacity
<!-- team -->

```ranges
title: Person-days of work against what the team has
max: 90
band: Team capacity, Oct 5 – Nov 9 | 45 | 60
Built by hand | 58 | 80 | hand | Plus 2–3 days for QR tickets
AI-assisted | 22 | 30 | ai | Plus 1 day for QR tickets
```

| | Real world | AI-assisted |
| --- | --- | --- |
| All core components (C0–C12) | 58–80 days | 22–30 days |
| Stretch: QR tickets | +2–3 days | +1 day |
| Team capacity, Oct 5 – Nov 9 (assumed) | About 45–60 days | About 45–60 days |

Built by hand, the scope exceeds what the team can deliver. AI-assisted, it fits with room for client feedback and rework. The capacity figure assumes four people in two pairs at three to four focused days a week.

- **AI saves the most** on setup, migrations, screens and forms, test scaffolding, sample data, and documentation.
- **It saves less** on matching rules, data-model decisions, integration debugging, and design judgment. These need careful review.
- **It doesn't speed up** AAFE's materials, translation review, client feedback, or rehearsal.

## Workload by pair
<!-- team -->

AI-assisted days per pair, added up from the timeline above. Shared work (testing, deploy, handoff) is split across everyone.

```workload
note: Natalie | Also product lead: PRDs, AAFE materials, client contact, translation review.
```

Pairs replaced single owners on Oct 5 so every area has two people on it. If one pair falls behind, the other pair takes a component, starting with the check-in app (C9) or exports (C8).

## Schedule risks
<!-- team -->

- **Late materials from AAFE.** If spreadsheet headers slip past October 8, build against the intake form's fields and adapt.
- **Uneven AI fluency and activity.** Each pair works together on every component, so no area depends on one person.
- **Scope creep toward a full event platform.** Hold to P0 until the full path works end to end.
