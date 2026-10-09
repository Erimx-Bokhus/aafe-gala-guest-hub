# Code map
<!-- new 2026-10-08 23:55 Aisling -->
<!-- reviewed 2026-10-08 Aisling -->

Every file, function, type, database table, access rule and trigger in the prototype, and how they connect, drawn from the code on `main`. Click any of them to see what it's for and read its code. It's built by a tool called graphify, which reads the code itself, with no AI and nothing sent anywhere, plus a step of our own that adds the links into the database. Use it to see how the pieces fit before you change one, or to find where something lives. Only code is shown: docs, settings files and demo data are left out. <!-- modified 2026-10-09 00:45 Aisling -->

## The map
<!-- new 2026-10-08 23:55 Aisling -->

```codemap
```

Tests are switched off at first because they connect to almost everything; switch them on with the Tests chip. Your choice of areas is remembered in your browser.

Clicking a dot shows what it's for beside the map: a file's own opening note, or the comment above a function; a function with neither shows its file's note. Below the map is its code, with line numbers. **Whole file** shows the rest of the file with those lines marked, and **Open on GitHub** opens the same lines in the repository, for the team only. Anyone with the hub's link can read the code shown here. It holds no secrets or real data: the secret scan and the real-data guard check every pull request. <!-- new 2026-10-09 00:45 Aisling -->

## The areas
<!-- new 2026-10-08 23:55 Aisling -->

| Area | Folder | What's in it |
| --- | --- | --- |
| Staff app | `prototype/staff-app` | The staff workspace: dashboard, sponsors, guest list, payments, badges, check-in, gala settings |
| Sponsor portal | `prototype/guest-portal` | The private page a sponsor opens from their link to name their guests, in English, Chinese, Korean and Spanish <!-- modified 2026-10-09 00:45 Aisling --> |
| iPad check-in | `prototype/checkin-app` | The door app for volunteers, plus its demo sync server and door-list builder |
| Shared code | `prototype/shared` | What the apps share: data types, the demo data, the offline check-in desk, sync, buttons and forms |
| Database | `prototype/database` | Tables, access rules, triggers, and the server functions every staff and sponsor action goes through <!-- modified 2026-10-09 00:45 Aisling --> |
| Edge functions | `prototype/supabase/functions` | Server jobs: the Give Lively sync and sending staff-approved emails |
| Import engine | `import-engine/src` | Reading a Give Lively export, matching buyers and guests, and preparing the upload |
| Scripts and demo data | `prototype/scripts`, `scripts` | Generators for the invented demo data, the double-click demo files, and the real-data guard |
| Tests | across the repo | The automated checks CI runs on every pull request |

## What stands out
<!-- new 2026-10-08 23:55 Aisling -->

- **The busiest parts.** The staff app's `App.tsx` and its `useStaff()` store, the `orders` table, the shared `data.ts` and `types.ts`, `sponsorOf()` (which sponsor a seat belongs to), `CheckInDesk` (the iPad's offline check-in), and the iPad's `DoorScreen()`. A change to any of these reaches the most other code, so they deserve the most care and the most tests.
- **No loops between files.** No file imports another that imports it back.
- **The database functions no screen calls yet.** 14 are built and tested in the database, but no app calls them yet: the three exports (`staff_export_badges`, `staff_export_checkin`, `staff_export_salesforce`), the import (`staff_import_givelively`, `staff_resolve_import_review`, `staff_set_tier_mapping`, `staff_set_gala_page`), the email queue (`staff_email_queue`, `staff_queue_guest_list_reminders`), the sponsor pipeline (`staff_pipeline`, `staff_save_prospect`, `staff_set_prospect_stage`, `staff_set_sponsorship_goal`) and sponsor arrivals (`staff_set_sponsor_arrivals`). Wiring them to buttons is on the [Build plan](#build-plan.where-each-component-stands). <!-- new 2026-10-09 00:45 Aisling -->
- **Who can touch each table.** Four access rules guard the tables: `staff_read` lets gala admins and relationship managers read 19 tables, and `admin_insert`, `admin_update` and `admin_delete` let only gala admins change the 4 setup tables. Every other change goes through a database function, which checks the role and writes the change log. <!-- new 2026-10-09 00:45 Aisling -->
- **The import engine stands apart.** It has its own folder, tests and package, as the stack decision asked, so it can be checked and replaced on its own.

## What the map doesn't show
<!-- modified 2026-10-09 00:45 Aisling The links into the database, access rules and triggers are now drawn -->

- **Calls the code builds at run time.** The links into the database come from names written in the code: an app calling `staff_check_in` by name, a `.from('orders')`, a database function naming another. A name put together while the app runs wouldn't be found; none are today. <!-- modified 2026-10-09 00:45 Aisling -->
- **The order things happen in.** A line means one uses the other, not when or how often. <!-- new 2026-10-09 00:45 Aisling -->
- **What the code means.** It shows what uses what, not whether it's right. The tests and code review do that.

## Rebuild it
<!-- team -->
<!-- new 2026-10-08 23:55 Aisling -->

After code changes on `main`, from the repo root (graphify needs Python; `uv` or `pipx` installs it):

    uv tool install "graphifyy[sql]"
    graphify update . --force
    node hub/scripts/build-codemap.mjs

The first command is needed once. The second writes `graphify-out/`, which stays out of git; the third writes `hub/docs/codemap.json` and `hub/docs/codemap-source.json` (the code previews). Commit both and publish the hub. A file without an opening comment gets its purpose from `hub/scripts/codemap-purposes.json`; add a line there for a new file, or better, start the file with a comment. <!-- modified 2026-10-09 00:45 Aisling --> `graphify-out/graph.html` is graphify's own full view, including docs and settings files; it needs the internet to open.
