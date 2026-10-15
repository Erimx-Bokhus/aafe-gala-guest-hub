# AAFE Gala Guest List Tool

Companion tool for Asian Americans for Equality's annual gala: one complete, editable guest list built on top of Give Lively, with sponsor self-service guest names, staff-approved follow-ups, badge exports, and gala-night check-in.

Status: discovery complete (Oct 1, 2026); prototype concept shared (Oct 2); stack decision pending. Prototype with invented data only. See `CLAUDE.md` and `docs/`.

Starting with Claude Code: open this repo and paste the prompt in `KICKOFF_PROMPT.md`.

Team ERIMX BOKHUS (Pursuit AI Native Fellowship): Natalie Walker, Aisling Leiva-Davila, Cornell Robertson, Antonin Lesov.

Copyright 2026 the ERIMX BOKHUS team. All rights reserved. Licensing to be decided with AAFE and Pursuit.

## Project board

The team's plan and task board, created and run by Natalie Walker (product lead): [ERIMX BOKHUS on Trello](https://trello.com/b/g9ycbWCv/erimx-bokhus). It came first: it was already in use by Sep 28, 2026, when Natalie's [source of truth](docs/research/source-of-truth-v3-natalie.md) linked it, and the [project hub](https://github.com/Erimx-Bokhus/aafe-gala-guest-project-hub) started on Oct 3. As the team agreed on Oct 5 ([decision log](docs/decisions.md)), the hub summarizes and links to this board, to make the plan easier to browse alongside the docs. The board is updated every day and is private: ask Natalie to be added.

## How it works

Two pages by Natalie Walker. Download one and open it in a browser:

- [`docs/diagrams/gala-guest-journey.html`](docs/diagrams/gala-guest-journey.html): how a guest gets from purchase to the door. Three ways onto the list (Give Lively, a check or pledge, a comp) pour into one guest list, then gala night, then after the gala; the steps where staff approve are marked.
- [`docs/diagrams/gala-system-map.html`](docs/diagrams/gala-system-map.html): where the information goes, with the guest list in the middle. Pick a story (a sponsor buys a table, a comp gets a QR code, gala night, after the gala) to follow one path.

## Run the checks on your own computer

`node scripts/ci-local.mjs` runs the same checks as GitHub Actions (real-data guard, secret scan, import engine, the coding standard's lint, frontend tests and demo-file rebuild, backend tests, server-function type-check), with no Actions minutes. The real-data guard and the secret scan check what's committed, as GitHub does (files changed on disk get a "not committed yet" warning); tests and builds use the files on disk. About 3 minutes; `--quick` skips the backend tests and the rebuild (about 15 seconds). Run it before you push, or `node scripts/ci-local.mjs --install-hook` to run `--quick` before every `git push`. Docker (secret scan) and Deno (server functions) are optional; a missing tool skips that check. Details at the top of the script.

To run the actual workflow files instead, in Docker, `act` works too (`act pull_request -j real-data-guard`). It's slower, and its first run downloads a large runner image.

## Coding standard

How we write code, adapted from NASA/JPL's "Power of Ten" for TypeScript and SQL, and the checks that enforce it: [`docs/CODING-STANDARD.md`](docs/CODING-STANDARD.md). `npm install` at the repo root, then `npm run lint` (zero warnings allowed); it also runs in `ci-local` and on every pull request.

## Project hub

Aisling keeps a browsable version of the docs for her own tracking in a separate repo, [AAFE Gala Guest Project Hub](https://github.com/Erimx-Bokhus/aafe-gala-guest-project-hub). It moved out of `hub/` on Oct 11, 2026, with its history, so its edits don't run this repo's six checks. Nobody else needs to clone it.
