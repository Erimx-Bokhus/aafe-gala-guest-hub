# AAFE Gala Guest List Tool

Companion tool for Asian Americans for Equality's annual gala: one complete, editable guest list built on top of Give Lively, with sponsor self-service guest names, staff-approved follow-ups, badge exports, and gala-night check-in.

Status: discovery complete (Oct 1, 2026); prototype concept shared (Oct 2); stack decision pending. Prototype with invented data only. See `CLAUDE.md` and `docs/`.

Starting with Claude Code: open this repo and paste the prompt in `KICKOFF_PROMPT.md`.

Team ERIMX BOKHUS (Pursuit AI Native Fellowship): Natalie Walker, Aisling Leiva-Davila, Cornell Robertson, Antonin Lesov.

Copyright 2026 the ERIMX BOKHUS team. All rights reserved. Licensing to be decided with AAFE and Pursuit.

## Run the checks on your own computer

`node scripts/ci-local.mjs` runs the same six checks as GitHub Actions (real-data guard, secret scan, import engine, frontend tests and demo-file rebuild, backend tests, server-function type-check), with no Actions minutes. About 3 minutes; `--quick` skips the backend tests and the rebuild (about 15 seconds). Run it before you push, or `node scripts/ci-local.mjs --install-hook` to run `--quick` before every `git push`. Docker (secret scan) and Deno (server functions) are optional; a missing tool skips that check. Details at the top of the script.

To run the actual workflow files instead, in Docker, `act` works too (`act pull_request -j real-data-guard`). It's slower, and its first run downloads a large runner image.

## Project hub

The browsable, presentable version of the docs lives in its own repo, [AAFE Gala Guest Project Hub](https://github.com/Erimx-Bokhus/aafe-gala-guest-project-hub) (moved out of `hub/` on Oct 11, 2026, with its history, so hub edits don't run this repo's six checks). Clone it next to this one; its README explains how to view, edit and publish it, and how its Code map and History pages read this repo.
