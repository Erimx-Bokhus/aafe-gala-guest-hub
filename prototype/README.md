# AAFE Gala Apps (Capstone prototype — synthetic data only)

Three apps and one shared database, built by ERIMX BOKHUS for Asian Americans for Equality (AAFE): the sponsor
portal, the staff app and the iPad check-in app.

```
prototype/
  guest-portal/        Sponsors & ticket buyers (private emailed link)  — English (other languages hidden for v1, #241)
  staff-app/           AAFE staff "client app" (login + roles)
  checkin-app/         iPad check-in at the door; installs as an app and works offline (see its README)
  supabase/functions/  Server functions: email sender, Give Lively sync, Salesforce push, and their demo stand-ins
  scripts/             Loading demo data, checks and setup
  shared/
    src/               types, seed.json, theme (light/dark), UI, text-size controls
    public/            AAFE logos + approved photo picks
  database/
    schema.sql         Postgres / Supabase schema (13 tables, 2 views, RLS notes)
    seed.sql           Synthetic seed — load after schema.sql
    backend.sql        Security, the apps' server functions, the import and the email queue (docs/BACKEND.md)
    generate_seed.py   Regenerates seed.sql + shared/src/seed.json
  docs/WORKFLOW.md     How the apps work together + backend/front-end needs
```

## Open without installing
Double-click **`OPEN-Guest-Portal.html`**, **`OPEN-Staff-App.html`** or **`OPEN-CheckIn-App.html`** in this folder. Each is one self-contained file (code, styles and photos inside) and works offline except for web fonts.
Double-clicking `guest-portal/index.html` or `staff-app/index.html` also works: it jumps to the matching OPEN file. For development, use the `npm run dev:…` commands below.
Rebuild the OPEN files after changes: `npm run build`, then `python3 scripts/make_open_files.py`.

## Run
Needs **Node 22.18** or newer (`node --version`). The backend tests load TypeScript files directly, which Node does from 22.18; older versions fail with `ERR_UNKNOWN_FILE_EXTENSION`. With nvm, `nvm install` in this folder picks the version from `.nvmrc`.
```bash
npm ci                 # once, at this folder (npm workspaces; installs the locked versions)
npm run dev:guest      # http://localhost:5173  -> open #/s/ac-6w9k3p5d
npm run dev:staff      # http://localhost:5174  -> pick a demo account
npm run dev:ipad --workspace checkin-app   # http://localhost:5175, the iPad app (checkin-app/README.md)
npm run build          # builds all three apps into */dist
npm run seed           # regenerate synthetic data
npm run translations   # rebuild the translation review sheet (docs/translations/) after changing guest-portal/src/i18n.ts
```

## Load the seed into Supabase
1. Supabase dashboard → SQL editor → paste `database/schema.sql` → Run.
2. Paste `database/seed.sql` → Run (wrapped in a transaction).
3. Check: `select * from v_fee_totals order by event_id;` returns 2024–2027 totals.

## Backend (Supabase + Give Lively)
Run `database/backend.sql` after the seed, then follow **`docs/BACKEND.md`** to deploy the Give Lively poller and email sender. `npm run test:backend` checks the backend locally. It also runs the import engine, so install that once first: `npm ci --prefix ../import-engine`.

## Seed contents (all fictional)
This is the **Small** demo set. Two full-size sets of 553 guests, shaped like AAFE's 2026 gala, load with
`npm run db:load -- full-as-sent` or `full-fixed` (`docs/BACKEND.md`, "Switch demo data sets").

- 4 galas (2024 50th anniversary, 2025, 2026 history; 2027 current demo)
- 15 sponsors; 15 current orders across Platinum → Community Ticket, ad-only and comp
- 24 payments (card, Amex, Give Lively ACH, check, direct ACH, wire) with Give Lively fee fields
- 70 seats / 48 named guests, 11 tables × 10 seats, 8 relationship guests with QR tokens
- Email log, 120+ audit entries, Salesforce sync map

Demo portal links: `#/s/ac-6w9k3p5d` (pledged, check), `#/s/ng-5t1w8e3z` (paid on Give Lively, donor covered fee), `#/s/mf-2p8x4r1d` (partially paid by wire), `#/s/hb-7f3k9q2m` (Platinum, 20 seats).
Staff demo accounts: Mei Lin Ortiz (gala admin), Daniel Seo (relationship manager), Kenji Abe (check-in volunteer — sees only check-in).

The Small set's sponsorship levels and seat counts come from AAFE's public 2025 sponsorship flyer. The Full fixed set uses the 2026 levels (decided Oct 5), and gala admins set each gala's levels in the staff app (decided Oct 14). Photos are from AAFE's gala and community programs; AAFE's logo and event photos may appear in everything we build (decided Oct 13, hard rule 8).
