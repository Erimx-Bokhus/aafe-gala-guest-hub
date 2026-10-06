# Documents
<!-- reviewed 2026-10-06 Aisling -->

Everything the team has produced or collected, in one place. Living documents are linked; the markdown copies in the repo's `docs/` folder are the version Claude Code reads.

## Living documents
<!-- updated 2026-10-05 16:51 Aisling -->

| Document | What it is | Status |
| --- | --- | --- |
| [AAFE Gala Project Hub](https://claude.ai/artifact/QVViUNx6SWRBZYKCfrAmp6) | This hub: plan, tasks, decisions, What's new, History, and the build so far | Live tracker, with Trello for day-to-day tasks <!-- updated 2026-10-06 06:12 Aisling --> |
| [Findings, Build Plan, and Tasks](https://claude.ai/code/artifact/25db30ba-7c5a-42dc-8e25-4c2b5dc47d2c) | Overview of findings, the component plan with estimates, the task tracker, and the decision log | Superseded by this hub (Oct 5) <!-- modified 2026-10-06 06:12 Aisling --> |
| [Discovery Guide v2](https://claude.ai/code/artifact/eedd8e14-cc7b-403e-9f92-4a5a6f96ea78) | Questions in decision order for the October 1 call | Used |
| [Guest Data and AI Handling](https://claude.ai/code/artifact/1d0571f4-d854-4e4a-90df-b60a62de28ce) | What the tool stores, what it never stores, and how AI is used | Draft for AAFE |
| [Future Hosting Notes](https://claude.ai/code/artifact/f74b0de5-c123-40b4-a9fd-c60be5297c41) | Engineering notes on future hosting paths, revised after Natalie's critique; rechecked Oct 3 | Internal <!-- modified 2026-10-05 16:51 Aisling --> |
| [Hosting Options Brief](https://claude.ai/code/artifact/3f4edb1b-c918-4ff4-b95e-9c61dd904cd0) | Two-page brief for Pursuit and AAFE: three options, rough costs, timeline; no recommendation | Shared with Avni <!-- modified 2026-10-05 16:51 Aisling --> |

## Research by Natalie Walker

| Document | What it covers |
| --- | --- |
| AAFE Gala Operations Hub: Consolidated Source of Truth (v3) | Team roles, AAFE's history, the problem statement, scope, cost and benefit, market alternatives, discovery questions |
| How Give Lively Works | Exports, the donation feed, attendee data, and Give Lively's limits |
| AAFE intake form | The client's original project request |
| Hosting Options and Costs: Critique (Oct 1) | Review of the hosting draft: estimates, verified facts, operating requirements, and decision framing |
| Future Deployment Note | The one-page note for AAFE's handoff package: production hosting is intentionally not selected during the capstone |
| Guest portal and staff app prototypes (Oct 2) | Clickable concepts of the sponsor portal and staff workspace; the UI reference for the build <!-- updated 2026-10-03 12:36 Aisling --> |
| Synthetic seed data (Oct 2) | 13 tabs of invented galas, sponsors, orders, payments, guests, seats, and check-ins; repo copy in `seed/natalie-prototype/` <!-- updated 2026-10-03 12:36 Aisling --> |
| Workflow diagram (Oct 3) | Sponsor portal, staff workspace, and event-day steps, plus the inputs needed from AAFE <!-- updated 2026-10-03 12:36 Aisling --> |

Repo copies: `docs/research/`. Where this research differs from later discovery or decisions (embedded form, Stripe checkout, seating chart, seat counts, Nov 9), `docs/research/README.md` lists the current position. <!-- modified 2026-10-03 11:56 Aisling -->

## Call records

| Record | Where |
| --- | --- |
| Discovery call, October 1, 2026 (58 minutes, full transcript) | Kept out of the repo (the client's own words); team Slack thread <!-- modified 2026-10-03 11:36 Aisling --> |
| Discovery call summary | [Discovery](#discovery) page; `docs/discovery-2026-10-01.md` |

## Team spaces
<!-- team -->

| Space | Link |
| --- | --- |
| Slack channel | [pursuit-core.slack.com/archives/C0C4HRLSQE7](https://pursuit-core.slack.com/archives/C0C4HRLSQE7) |
| Trello board (task tracker) | [trello.com/b/g9ycbWCv/erimx-bokhus](https://trello.com/b/g9ycbWCv/erimx-bokhus) <!-- modified 2026-10-05 16:51 Aisling --> |
| Code repository | [github.com/Erimx-Bokhus/aafe-gala-guest-hub](https://github.com/Erimx-Bokhus/aafe-gala-guest-hub) (private; team members invited) |

## Repo handoff package
<!-- updated 2026-10-05 22:58 Aisling -->

The starter files for the code repository: `CLAUDE.md` (project rules for Claude Code), `README.md`, `KICKOFF_PROMPT.md`, and `docs/` with requirements, decisions, data model, data handling, and research. This hub sits beside them in `hub/`. <!-- modified 2026-10-03 11:36 Aisling -->

| Repo document | What it is <!-- updated 2026-10-03 11:56 Aisling --> |
| --- | --- |
| `docs/import-matching-spec.md` | How Give Lively rows become orders, guests, and seats; matching; tier mapping; review queue; corrections; import report; 38 test cases. Summarized on [Import and matching](#import) <!-- modified 2026-10-05 22:58 Aisling --> |
| `docs/seed-data-requirements.md` | The invented records and two Give Lively export files the tests need <!-- updated 2026-10-03 11:56 Aisling --> |
| `docs/aafe-materials-2026-10-05.md` | Structure of AAFE's real spreadsheet, Give Lively export, tiers, and deadlines (the files stay out of the repo) <!-- updated 2026-10-05 16:51 Aisling --> |
| `docs/design.md` | Natalie's design system: AAFE orange and white, type, components (PR #14) <!-- updated 2026-10-05 16:51 Aisling --> |
| `prototype/` | Natalie's staff app, guest portal, and Supabase backend (PRs #7, #25, #26; later #28–#31). `prototype/docs/BACKEND.md` covers setup and every server function <!-- modified 2026-10-06 05:50 Aisling --> |
| `import-engine/` | The Give Lively import rules as a tested TypeScript module (PRs #23, #24); its README explains how it feeds the database <!-- modified 2026-10-05 22:58 Aisling --> |
| `seed/natalie-prototype/` | Natalie's seed data as CSVs, the demo's base state; its README lists what the app's loader must fix <!-- updated 2026-10-03 12:36 Aisling --> |
| `docs/research/prototype-review-2026-10-03.md` | What we adopted from Natalie's prototype and seed data, and where it meets the hard rules <!-- updated 2026-10-03 12:36 Aisling --> |
| `.github/workflows/` | Checks on every pull request: secret scan (`gitleaks.yml`), import engine tests (`import-engine.yml`), backend tests (`backend.yml`), app build plus generated demo files up to date (`frontend.yml`), real-data guard (`real-data.yml`, runs `scripts/check-no-real-data.mjs`). The secret scan and real-data guard must pass before anything merges to `main`; the others run only when their folder changes <!-- modified 2026-10-06 03:05 Aisling --> |

## Working in the repo
<!-- team -->

- `main` only changes through pull requests. Aisling is the repo admin and reviews and merges every pull request. <!-- new 2026-10-03 11:56 Aisling -->
- Each person works on their own branch (`aisling`, `natalie`, `cornell`, `antonin`) or a feature branch named `name-topic`, such as `aisling-import-engine`. A `name/topic` branch can't be created while a branch called `name` exists. <!-- new 2026-10-03 11:56 Aisling -->
- Every pull request, and `main` after each merge, is scanned for secrets (pushes to a branch without a PR are not), and a real-data guard runs on every PR. Spreadsheet and CSV exports are blocked by `.gitignore`, except invented ones under `seed/` or `fixtures/`. <!-- modified 2026-10-06 05:50 Aisling -->

## Credits

Prepared by team ERIMX BOKHUS: Natalie Walker (product and research), Aisling Leiva-Davila (backend and integrations), Cornell Robertson (backend), Antonin Lesov (frontend). Pursuit AI Native Fellowship, 2026.
