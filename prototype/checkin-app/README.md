# iPad check-in app

Written by Natalie Walker

A separate app for gala-night check-in, made for the iPad and used only at the door. Volunteers and
staff working the door see check-in and nothing else: no sponsors, payments, or staff pages.

## What it does
- Opens straight to tonight's gala, the **53rd** (past galas are over, so there's no gala picker). Sign in by
  choosing who is checking guests in (prototype: no password; production uses the staff account, PR #27).
- The full guest list A–Z by last name, with counts for AAFE's seven guest categories (sponsor guests,
  ticket holders, comped, AAFE staff, event volunteers, event staff, government or VIP). The demo list
  has 553 invented guests, the size and shape of AAFE's 2026 gala.
- Search by first or last name, organization, or sponsor; results appear as you type.
- Scan a guest's QR code with the iPad camera. A ticket that was already used shows a warning with who checked it in and when.
- Add an approved exception (walk-ins, unnamed sponsor seats). Tap "+N exceptions" to see them all and undo a mistake.
- Tick one or more names and tap **Checked in**; each row shows the time; tap again to undo.
- Live "N of M checked in" bar and an offline banner with arrivals waiting to sync. While searching, the header shrinks so the list stays visible above the iPad keyboard.
- Install on the iPad from Safari: Share → **Add to Home Screen**. It opens full screen like an app.
  No App Store or Apple developer account needed.

## Run it
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
| `src/App.tsx` | The app: volunteer sign-in, A–Z list, multi-select check-in, QR, exceptions, offline queue |
| `src/doorlist.json` | The door list: 553 invented guests, only door-safe fields (no email, phone, payment, dietary or notes) |
| `make_door_list.mjs` | Rebuilds the door list from `shared/src/seed.json` (read the caution at the top first) |
| `../shared/src/checkinSync.ts` | Sync client with the offline queue (demo: talks to `sync-server/`) |
| `sync-server/server.mjs` | Demo-only sync server (plain Node, 127.0.0.1:8787, no sign-in); replaced by Supabase in production. `POST /api/reset` works only with `DEMO_RESET=1` |
| `../OPEN-CheckIn-App.html` | Double-click copy with logo and photos built in |

## Status and next steps
- Works end to end on demo data: check-ins queue on the iPad and sync through the demo server.
- **To connect (backend):** replace the demo sync with the offline check-in built in PR #46:
  `staff_checkin_snapshot()` for the door list, `staff_sync_check_ins()` for arrivals (first arrival wins),
  and `shared/src/offlineCheckin.ts` (`CheckInDesk`) for the queue and banner. Door staff sign in with
  their staff account (PR #27); the `check_in_volunteer` role sees check-in only.
- **Demo data:** the door list has 553 invented guests (AAFE's 2026 shape). `main`'s demo seed has 48;
  the team needs to decide which the demo uses.
- **For true offline use:** a service worker, so the app itself opens with no internet.
- AAFE's logo and event photos are internal until AAFE approves in writing (CLAUDE.md rule 8).
