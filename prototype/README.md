# AAFE Gala Apps (Capstone prototype — synthetic data only)

Two front-end apps and one shared database, built by ERIMX BOKHUS for Asian Americans for Equality (AAFE).

```
aafe-gala-apps/
  guest-portal/        Sponsors & ticket buyers (private emailed link)  — EN / 中文 / 한국어 / Español
  staff-app/           AAFE staff "client app" (login + roles)
  shared/
    src/               types, seed.json, theme (light/dark), UI, text-size controls
    public/            AAFE logos + approved photo picks
  database/
    schema.sql         Postgres / Supabase schema (13 tables, 2 views, RLS notes)
    seed.sql           Synthetic seed — load after schema.sql
    generate_seed.py   Regenerates seed.sql + shared/src/seed.json
  docs/WORKFLOW.md     How the apps work together + backend/front-end needs
```

## Open without installing
Double-click **`OPEN-Guest-Portal.html`** or **`OPEN-Staff-App.html`** in this folder. Each is one self-contained file (code, styles and photos inside) and works offline except for web fonts.
Double-clicking `guest-portal/index.html` or `staff-app/index.html` also works: it jumps to the matching OPEN file. For development use `npm run dev`.
Rebuild the OPEN files after changes: `npm run build`, then `python3 scripts/make_open_files.py`.

## Run
```bash
npm install            # once, at this folder (npm workspaces)
npm run dev:guest      # http://localhost:5173  -> open #/s/ac-6w9k3p5d
npm run dev:staff      # http://localhost:5174  -> pick a demo account
npm run build          # builds both into */dist
npm run seed           # regenerate synthetic data
npm run translations   # rebuild the translation review sheet (docs/translations/) after changing guest-portal/src/i18n.ts
```

## Load the seed into Supabase
1. Supabase dashboard → SQL editor → paste `database/schema.sql` → Run.
2. Paste `database/seed.sql` → Run (wrapped in a transaction).
3. Check: `select * from v_fee_totals order by event_id;` returns 2024–2027 totals.

## Backend (Supabase + Give Lively)
Run `database/backend.sql` after the seed, then follow **`docs/BACKEND.md`** to deploy the Give Lively poller and email sender. `npm run test:backend` checks the backend locally.

## Seed contents (all fictional)
- 4 galas (2024 50th anniversary, 2025, 2026 history; 2027 current demo)
- 15 sponsors; 15 current orders across Platinum → Community Ticket, ad-only and comp
- 24 payments (card, Amex, Give Lively ACH, check, direct ACH, wire) with Give Lively fee fields
- 70 seats / 48 named guests, 11 tables × 10 seats, 8 relationship guests with QR tokens
- Email log, 120+ audit entries, Salesforce sync map

Demo portal links: `#/s/ac-6w9k3p5d` (pledged, check), `#/s/ng-5t1w8e3z` (paid on Give Lively, donor covered fee), `#/s/mf-2p8x4r1d` (partially paid by wire), `#/s/hb-7f3k9q2m` (Platinum, 20 seats).
Staff demo accounts: Mei Lin Ortiz (gala admin), Daniel Seo (relationship manager), Kenji Abe (check-in volunteer — sees only check-in).

Sponsorship tiers and seat counts are based on AAFE's public 2025 sponsorship flyer; confirm future-year packages with AAFE before production use. Photos are from AAFE's gala and community programs and need AAFE approval.
