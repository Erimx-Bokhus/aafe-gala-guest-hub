# AAFE Gala Guest List Tool

Companion tool for Asian Americans for Equality's annual gala: one complete, editable guest list built on top of Give Lively, with sponsor self-service guest names, staff-approved follow-ups, badge exports, and gala-night check-in.

Status: discovery complete (Oct 1, 2026); prototype concept shared (Oct 2); stack decision pending. Prototype with invented data only. See `CLAUDE.md` and `docs/`.

Starting with Claude Code: open this repo and paste the prompt in `KICKOFF_PROMPT.md`.

Team ERIMX BOKHUS (Pursuit AI Native Fellowship): Natalie Walker, Aisling Leiva-Davila, Cornell Robertson, Antonin Lesov.

Copyright 2026 the ERIMX BOKHUS team. All rights reserved. Licensing to be decided with AAFE and Pursuit.

## Run the checks on your own computer

`node scripts/ci-local.mjs` runs the same six checks as GitHub Actions (real-data guard, secret scan, import engine, frontend tests and demo-file rebuild, backend tests, server-function type-check), with no Actions minutes. About 3 minutes; `--quick` skips the backend tests and the rebuild (about 15 seconds). Run it before you push, or `node scripts/ci-local.mjs --install-hook` to run `--quick` before every `git push`. Docker (secret scan) and Deno (server functions) are optional; a missing tool skips that check. Details at the top of the script.

## Project hub

`hub/` holds a browsable, presentable version of the docs. Run `npx serve` inside it; see `hub/README.md`.
