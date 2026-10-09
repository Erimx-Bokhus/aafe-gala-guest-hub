# Code map
<!-- new 2026-10-08 23:55 Aisling -->
<!-- reviewed 2026-10-08 Aisling -->

Every file, function, type and database table in the prototype, and how they connect, drawn from the code on `main`. It's built by a tool called graphify, which reads the code itself, with no AI and nothing sent anywhere. Use it to see how the pieces fit before you change one, or to find where something lives. Only code is shown: docs, settings files and demo data are left out.

## The map
<!-- new 2026-10-08 23:55 Aisling -->

```codemap
```

Tests are switched off at first because they connect to almost everything; switch them on with the Tests chip. Your choice of areas is remembered in your browser.

## The areas
<!-- new 2026-10-08 23:55 Aisling -->

| Area | Folder | What's in it |
| --- | --- | --- |
| Staff app | `prototype/staff-app` | The staff workspace: dashboard, sponsors, guest list, payments, badges, check-in, gala settings |
| Sponsor portal | `prototype/guest-portal` | The private page a sponsor opens from their link to name their guests, in English and Korean |
| iPad check-in | `prototype/checkin-app` | The door app for volunteers, plus its demo sync server and door-list builder |
| Shared code | `prototype/shared` | What the apps share: data types, the demo data, the offline check-in desk, sync, buttons and forms |
| Database | `prototype/database` | Tables, access rules and the server functions every staff and sponsor action goes through |
| Edge functions | `prototype/supabase/functions` | Server jobs: the Give Lively sync and sending staff-approved emails |
| Import engine | `import-engine/src` | Reading a Give Lively export, matching buyers and guests, and preparing the upload |
| Scripts and demo data | `prototype/scripts`, `scripts` | Generators for the invented demo data, the double-click demo files, and the real-data guard |
| Tests | across the repo | The automated checks CI runs on every pull request |

## What stands out
<!-- new 2026-10-08 23:55 Aisling -->

- **The busiest parts.** The staff app's `App.tsx` and its `useStaff()` store, the `orders` table, the shared `data.ts` and `types.ts`, `sponsorOf()` (which sponsor a seat belongs to), `CheckInDesk` (the iPad's offline check-in), and the iPad's `DoorScreen()`. A change to any of these reaches the most other code, so they deserve the most care and the most tests.
- **No loops between files.** No file imports another that imports it back.
- **The import engine stands apart.** It has its own folder, tests and package, as the stack decision asked, so it can be checked and replaced on its own.

## What the map doesn't show
<!-- new 2026-10-08 23:55 Aisling -->

- **Links from the apps to the database.** The apps call server functions such as `staff_check_in` by name through Supabase, and the tool can't follow a call from TypeScript into SQL. Those links are listed in `prototype/docs/BACKEND.md`.
- **The database's access rules and triggers.** The tables and server functions are drawn; the rules that decide who can read each table, and the triggers that write the change log, aren't.
- **What the code means.** It shows what uses what, not whether it's right. The tests and code review do that.

## Rebuild it
<!-- team -->
<!-- new 2026-10-08 23:55 Aisling -->

After code changes on `main`, from the repo root (graphify needs Python; `uv` or `pipx` installs it):

    uv tool install "graphifyy[sql]"
    graphify update . --force
    node hub/scripts/build-codemap.mjs

The first command is needed once. The second writes `graphify-out/`, which stays out of git; the third writes `hub/docs/codemap.json`. Commit that file and publish the hub. `graphify-out/graph.html` is graphify's own full view, including docs and settings files; it needs the internet to open.
