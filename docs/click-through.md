# Click-through

A recorded test of every button in the three apps, run against a local Supabase loaded with the invented "Full gala,
fixed" set (553 guests), plus the gala-night load test. It's how Gate 4 was closed (two clean runs on Oct 23, before
`v1.0.0-rc.1`), and `docs/RELEASING.md` asks for it before `v1.0.0` (criterion 5). Unit tests check functions; this
checks what a person sees, with a real database behind it.

What it caught that the tests didn't, on Oct 19: a renamed guest kept the old name in the portal and a refused link
answered 500 (#208); a synced check-in on the iPad flipped back for 20 seconds and Undo never reached the server (#206);
a staff app reload lost the page (#207). All three were fixed and passed on Oct 23.

## Safe by design

- **Local only.** Every request to a hosted Supabase project (`*.supabase.co`) is blocked and reported, so a run can
  never touch the hosted project. The reset script stops unless the local API answers at `127.0.0.1:54321`.
- **Invented data only.** The full-fixed set is the demo's own (`database/seed.full-fixed.sql`); loading it refuses to
  clear a gala that isn't marked synthetic. Sign-ins are the five invented staff (`@aafe-demo.example.org`), and their
  codes arrive in the local mail catcher, never a real inbox.
- **A fresh database before each app,** so no app's test changes what the next one sees.

## What a run checks

| Part | Steps | What it covers |
| --- | --- | --- |
| Sponsor portal | 44 | The landing page (text size, theme, the skip link); a private link opens; guests are added, edited, renamed and removed, with each form check; a wrong link answers 404 |
| iPad check-in | 45 | Sign-in, search, one tap and several at once, Undo, QR, offline and back, two devices, a closed gala |
| Staff app | 88 | Every page and its buttons: guests, sponsors, payments and their warnings, comps, badges, reports, the change log, roles |
| Load test | 10 checks | 6 iPads, the door list and 2 staff tabs at once on 552 guests: nothing refused, no check-in lost (`scripts/load-checkin.mjs`) |

Each step is recorded: a video with each step's time, a screenshot, a Playwright trace, and a verdict. A run ends with
an `index.html` that lists every step, pass or fail, with links into the video.

**Findings** are sorted by how much they matter. **High:** wrong data, or a task that can't be done (a check-in lost).
**Medium:** it works, but a person would be misled or stuck (a 500 where a clear message belongs). **Low:** wording or log
noise ("1 guests"). A tag needs no high or medium finding, two runs in a row.

## One-time setup

1. **Docker and the local Supabase:** in `prototype/`, `npx supabase start` (the local API, the database, Auth and a mail
   catcher at `127.0.0.1:54324`).
2. **Each app pointed at it:** in `staff-app/`, `guest-portal/` and `checkin-app/`, a `.env.clickthrough.local` with
   `VITE_SUPABASE_URL=http://127.0.0.1:54321` and `VITE_SUPABASE_ANON_KEY=` the local anon key from `npx supabase status`.
   The local key only works on your own computer.
3. **The scripts and Playwright:** in the kit's `scripts/` folder, `npm install` then `npx playwright install chromium`.

## Each run

1. **Start the local server functions** with the stand-ins for Give Lively and Salesforce:
   `npx supabase functions serve --env-file <the kit's functions.env>` (it sets `GIVELIVELY_BASE_URL`, `SALESFORCE_BASE_URL`
   and their keys to the local mock functions).
2. **Start the three apps in click-through mode**, on the ports the scripts expect, from `prototype/`:
   ```bash
   npm run dev -w staff-app -- --mode clickthrough --port 5184 --strictPort
   npm run dev -w guest-portal -- --mode clickthrough --port 5185 --strictPort
   npm run dev -w checkin-app -- --mode clickthrough --port 5186 --strictPort
   ```
3. **Run all three apps:** `bash run-all.sh run1`. Before each app it resets the local database (`reset-local.sh`:
   `schema.sql`, `seed.sql`, `backend.sql`, the full-fixed set, `backend.sql` again, `demo_salesforce.sql`,
   `demo_givelively.sql`, and local logins for the five staff), then runs `portal.mjs`, `checkin.mjs` and `staff.mjs`, and
   writes `run1/index.html`.
4. **The load test:** in `prototype/`, `node scripts/load-checkin.mjs`.
5. **Read the report,** and file each high or medium finding as an issue with its step, its time in the video and the
   screenshot.
6. **Run it again** (`bash run-all.sh run2`). Two clean runs in a row is the bar.

A full run takes about half an hour, most of it the staff app and the database resets.

## Before the next run

The scripts check the apps as they were on Oct 23. Three pull requests since then changed what they check on purpose,
so these steps must change with them, or the run fails on a change that's right:

- **Portal, "Language: 中文, Español, 한국어":** the portal is English only for v1 and the menu is hidden (#241). Check
  that no language menu shows.
- **Portal, "Received — AAFE is confirming" and "Confirmed by AAFE":** sponsors no longer see AAFE's review status
  (#240). Check that the card shows the guest without it.
- **Staff app, "'Badge ready' … is disabled without a table":** a guest without a table can now get a badge, with no
  table line (#253). Check that it's allowed and the badge has no table line.

Any pull request that changes a screen should say which click-through steps it changes, so the scripts keep up.

## Where the scripts are

Today the kit is on Aisling's computer, at `D:\aafe-gala-clickthrough\2026-10-23\scripts`: `harness.mjs` (the recorded
browser, the block on hosted projects, screenshots and verdicts), one script per app, `reset-local.sh`, `run-all.sh`
and `report.mjs`. The results of each run sit beside it (`run1/`, `run2/`).

It moves into this repo after the Oct 30 review, so anyone on the team, and AAFE's technical partner after the handoff,
can run it. Before then, `reset-local.sh` needs its two Windows paths replaced (the repo folder, and the full-fixed set,
which becomes `database/seed.full-fixed.sql`), and the scripts a pass for anything specific to one computer.
