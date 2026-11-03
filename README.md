# AAFE Gala Guest List Tool

A companion tool for the annual gala of Asian Americans for Equality (AAFE). It sits on top of Give Lively and
turns ticket purchases, sponsorship pledges, checks and comps into one complete, editable guest list: sponsors
name their guests on a private link, staff approve every email, badges export for printing, and an iPad checks
guests in on gala night.

Team ERIMX BOKHUS built it in Pursuit's AI Native program as a working prototype on invented data. The code and
documents go to AAFE at Demo Day, November 10, 2026, for AAFE and any technical partner to take forward.

**Status:** invented data only. Release candidate `v1.0.0-rc.2` tagged Oct 26; code freeze Oct 29; AAFE's review
of Stable V1 Oct 30; Demo Day and handoff Nov 10.

## The three apps

| App | Who uses it | What it does | Code |
| --- | --- | --- | --- |
| Staff app | AAFE's gala team and relationship managers | Imports Give Lively purchases, records pledges and checks, adds comps, approves every email, keeps the guest list, prints badges, runs reports | `prototype/staff-app` |
| Sponsor portal | Sponsors and ticket buyers, through a private emailed link | Names their guests and fixes spellings until the deadline | `prototype/guest-portal` |
| iPad check-in | Volunteers at the door | Scans a guest's QR code or finds them by name; installs on the iPad like an app and works without Wi-Fi | `prototype/checkin-app` |

All three share one Supabase database. The demo copies run at `aafe-gala-staff.pages.dev`,
`aafe-gala-portal.pages.dev` and `aafe-gala-checkin.pages.dev`, behind Cloudflare Access
([who can open them](docs/operations.md#who-can-open-the-apps)).

**Try them without installing anything:** double-click `prototype/OPEN-Staff-App.html`,
`prototype/OPEN-Guest-Portal.html` or `prototype/OPEN-CheckIn-App.html`. Each is one self-contained file with demo
data and works offline, except for web fonts.

## How it works

Two pages by Natalie Walker. Download one and open it in a browser:

- [`docs/diagrams/gala-guest-journey.html`](docs/diagrams/gala-guest-journey.html): how a guest gets from purchase
  to the door. Three ways onto the list (Give Lively, a check or pledge, a comp) pour into one guest list, then gala
  night, then after the gala; the steps where staff approve are marked.
- [`docs/diagrams/gala-system-map.html`](docs/diagrams/gala-system-map.html): where the information goes, with the
  guest list in the middle. Pick a story (a sponsor buys a table, a comp gets a QR code, gala night, after the gala)
  to follow one path.

[`prototype/docs/WORKFLOW.md`](prototype/docs/WORKFLOW.md) describes, in words, how the apps work together.

## Built with

- **React and TypeScript**, built with Vite and styled with Tailwind CSS
- **Supabase**: Postgres with row-level security, sign-in by emailed code, Edge Functions and scheduled jobs
- **Cloudflare Pages** hosts the apps; **Cloudflare Access** guards them
- **Resend** sends the emails staff approve
- **jsQR** reads QR codes with the iPad's camera; **qrcode** draws them
- **Vitest** runs the tests. The Give Lively import rules are their own tested module, [`import-engine/`](import-engine/README.md)

## The rules the tool keeps

The full text is in [`CLAUDE.md`](CLAUDE.md), "Hard rules." In short:

1. Invented data only. No real donor names, emails or exports, ever.
2. No payment processing. Payments are recorded (method, date, amount), never taken.
3. Secrets never in code. Keys stay on the server.
4. Staff approve every email before it sends.
5. AI is off. Version 1 has no AI.
6. Sponsor links and QR codes are random, stored only in scrambled (hashed) form, and expire.
7. Every guest record keeps where it came from and a log of every change; staff corrections survive the next import.

## Set it up and run it

| To | Read |
| --- | --- |
| Run the apps on your own computer | [`prototype/README.md`](prototype/README.md) (Node 22.18 or newer) |
| Set up a Supabase project, its functions and its secrets | [`prototype/docs/BACKEND.md`](prototype/docs/BACKEND.md) |
| Understand stable and nightly, and how releases work | [`docs/RELEASING.md`](docs/RELEASING.md) |
| Know the free-plan limits, take backups, run gala night, go live | [`docs/operations.md`](docs/operations.md) |
| Find every key, where it lives and how to replace it | [`docs/keys-and-secrets.md`](docs/keys-and-secrets.md) |

## Key documents

| Document | What's in it |
| --- | --- |
| [`docs/discovery-2026-10-01.md`](docs/discovery-2026-10-01.md) | What AAFE asked for |
| [`docs/requirements.md`](docs/requirements.md) | What the tool must do, by priority |
| [`docs/decisions.md`](docs/decisions.md) | Every decision, with its date and who made it |
| [`docs/data-model.md`](docs/data-model.md) | The database |
| [`docs/import-matching-spec.md`](docs/import-matching-spec.md) | How a Give Lively export becomes guests |
| [`docs/data-handling.md`](docs/data-handling.md) | The promises made to AAFE about guest data |
| [`docs/security-review.md`](docs/security-review.md) | The security review |
| [`docs/design.md`](docs/design.md) | AAFE's brand in the apps |

## For developers

- **Checks:** `node scripts/ci-local.mjs` runs the same checks as GitHub (real-data guard, secret scan, import
  engine, lint, frontend tests and build, backend tests, server-function type-check) in about 3 minutes; `--quick`
  takes about 15 seconds. Details are at the top of the script.
- **Coding rules:** [`docs/CODING-STANDARD.md`](docs/CODING-STANDARD.md), ten rules adapted from NASA/JPL's
  "Power of Ten" for TypeScript and SQL. Run `npm ci`, then `npm run lint` at the repo root; zero warnings allowed.
- **Branches:** nobody pushes to `main`. Changes arrive as pull requests with one approval and a passing secret
  scan (`CLAUDE.md`, "Working in this repo").
- **Claude Code:** to start a session, paste the prompt in [`KICKOFF_PROMPT.md`](KICKOFF_PROMPT.md).

## Team

| Person | Role |
| --- | --- |
| Natalie Walker | Product lead, UI/UX and client contact. Staff app, sponsor portal, iPad check-in app |
| Antonin Lesov | Front end and UI/UX. Sponsor portal ideas, Korean translation |
| Aisling Leiva-Davila | Backend, GitHub and integrations. Supabase backend, Give Lively import, secure links, exports, emails, offline check-in |
| Cornell Robertson | Backend. Staff sign-in |

The tool started from Natalie's prototype and seed data (Oct 2–3, 2026), which the team adopted as its stack on
Oct 5 ([decision log](docs/decisions.md)).

**Project board:** the team's plan and task board, created and run by Natalie Walker:
[ERIMX BOKHUS on Trello](https://trello.com/b/g9ycbWCv/erimx-bokhus). It was in use by Sep 28, 2026, before the
project hub. It's private: ask Natalie to be added.

**Project hub:** Aisling's own tracker, in a separate repo,
[AAFE Gala Guest Project Hub](https://github.com/Erimx-Bokhus/aafe-gala-guest-project-hub). Nobody else needs to
clone it.

## License

Copyright 2026 the ERIMX BOKHUS team. All rights reserved. Licensing to be decided with AAFE and Pursuit.
