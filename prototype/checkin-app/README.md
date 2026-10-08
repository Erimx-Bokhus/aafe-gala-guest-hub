# iPad check-in app

Written by Natalie Walker

A separate app for gala-night check-in, made for the iPad and used only at the door. Volunteers and
staff working the door see check-in and nothing else: no sponsors, payments, or staff pages.

## What it does
- Opens straight to tonight's gala, the **53rd** (past galas are over, so there's no gala picker).
  **Live** (Supabase keys set): staff sign in with an emailed link to their AAFE staff account (PR #27); the
  `check_in_volunteer` role sees check-in only. **Demo** (no keys): choose who is checking guests in, no password.
- The full guest list A–Z by last name, with counts for AAFE's seven guest categories (sponsor guests,
  ticket holders, comped, AAFE staff, event volunteers, event staff, government or VIP). The demo list
  has 553 invented guests, the size and shape of AAFE's 2026 gala.
- Search by first or last name, organization, or sponsor; results appear as you type.
- Scan a guest's QR code with the iPad camera. A ticket that was already used shows a warning with who checked it in and when.
- Add an approved exception (walk-ins, unnamed sponsor seats). Tap "+N exceptions" to see them all and undo a mistake.
- Tick one or more names and tap **Checked in**; each row shows the time; tap again to undo. In live mode only the
  person who checked a guest in, or a gala admin, can undo it (the server checks).
- A guest with accessibility needs shows an **Access needs** flag; the details stay in the staff app.
- Live "N of M checked in" bar and an offline banner with arrivals waiting to sync. While searching, the header shrinks so the list stays visible above the iPad keyboard.
- Install on the iPad from Safari: Share → **Add to Home Screen**. It opens full screen like an app.
  No App Store or Apple developer account needed.

## Run it
**Live, on Supabase:** copy `.env.example` to `.env.local` with the project URL and anon key (never the service_role
key; the build refuses it), add the app's address to Supabase → Authentication → URL Configuration → Redirect URLs,
then `npm run dev:ipad`. The door list comes from `staff_checkin_snapshot()`; nothing is bundled.

**Demo, no keys:**
```
cd prototype/checkin-app
npm run sync-server    # demo sync server, this computer only (127.0.0.1:8787)
npm run dev:ipad       # the app on http://localhost:5175 and on your Wi-Fi address
```
(Run `npm install` in `prototype/` first.) On an iPad on the same Wi-Fi, open the "Network" address Vite prints
(e.g. `http://192.168.x.x:5175`) in Safari, then Share → **Add to Home Screen**. The app reaches the sync
server through Vite's `/api` proxy, so several iPads share check-ins. Or double-click
`prototype/OPEN-CheckIn-App.html` to try it alone on one computer.

## Files
| Path | What |
| --- | --- |
| `src/App.tsx` | The screens: sign-in (live or demo), A–Z list, multi-select check-in, QR, exceptions, undo, notices |
| `src/door.ts` | What the screen needs from either mode (`Door`), and `LIVE`, fixed at build time from the keys |
| `src/liveDoor.ts` | Live: the list from `staff_checkin_snapshot()`, check-ins through `CheckInDesk` and `staff_sync_check_ins()` (works offline, first arrival wins), QR codes matched on their hash, undo through `staff_undo_check_in()`; the saved list is per person and cleared on sign-out or when the gala closes |
| `src/demoDoor.ts` | Demo: the bundled door list and the demo sync server; left out of a build with keys |
| `src/doorlist.json` | The door list: 553 invented guests, only door-safe fields (no email, phone, payment, dietary or notes) |
| `make_door_list.mjs` | Rebuilds the door list from `shared/src/seed.json` (read the caution at the top first) |
| `../shared/src/checkinSync.ts` | Sync client with the offline queue (demo: talks to `sync-server/`) |
| `sync-server/server.mjs` | Demo-only sync server (plain Node, 127.0.0.1:8787, no sign-in); replaced by Supabase in production. `POST /api/reset` works only with `DEMO_RESET=1` |
| `../OPEN-CheckIn-App.html` | Double-click copy with logo and photos built in |
| `scripts/make_open_file.py` | Rebuilds `../OPEN-CheckIn-App.html` after `npm run build` (`python3 scripts/make_open_file.py`); an unchanged door list gives the same file byte for byte |
| `scripts/screenshots.mjs` | Retakes the eight screenshots in `docs/screenshots/ipad-checkin/` that show guest rows (02, 05, 06, 09, 10, 11, 12, 13) with fixed steps and times; setup and run steps are at the top of the file |
| `scripts/live-smoke.mjs` | Tries live mode with no Supabase project: a stand-in answers like the backend, nothing leaves the computer; 18 checks (sign-in, list, sync, QR hash, undo rules, exceptions, offline, conflicts, sign-out clears the iPad) |

## Status and next steps
- **Connected to the backend (Oct 8):** live mode follows Natalie's "To connect" list from PR #56: door list from
  the server, QR hash and expiry, `CheckInDesk` sync with the actor from the sign-in, undo limited to the same person
  or a gala admin, refused check-ins shown as notices, the iPad cleared on sign-out and when the gala closes. Tried
  against a stand-in (`scripts/live-smoke.mjs`); the first run on the real project is the in-person sign-in test.
- **Demo mode stays** for the double-click file and a backup on the night (decided Oct 8), so `sync-server/` stays too.
- **Demo data:** the door list's 553 invented guests are also the Full demo data sets (PR #66), so the demo and a
  Supabase project loaded with `npm run db:load -- full-fixed` show the same people.
- **For true offline use:** a service worker, so the app itself opens with no internet.
- AAFE's logo and event photos are internal until AAFE approves in writing (CLAUDE.md rule 8).
