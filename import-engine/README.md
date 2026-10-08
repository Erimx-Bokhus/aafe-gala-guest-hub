# Import engine

The Give Lively import rules from `docs/import-matching-spec.md`, as one TypeScript module with no UI or
database code, so every rule is unit-tested. All test data is invented (hard rule 1).

```bash
cd import-engine
npm install
npm test            # Vitest, once
npm run test:watch  # re-runs on save
npm run typecheck
```

A GitHub check runs the typecheck and tests on every pull request that touches this folder.

## What's here

| File | Spec | Does |
| --- | --- | --- |
| `src/readExport.ts` | §1, §2 | Reads AAFE's ticket export (Papa Parse), finds columns by name, validates each row (Zod), rejects bad rows with their row number, drops phone numbers and the typed guest list, computes the purchase key |
| `src/values.ts` | §1 | `$1,000.00 ` → 1000; `2026-02-05 05:14:46 PM EST` → UTC |
| `src/purchaseKey.ts` | §2 | SHA-256 of buyer email + UTC purchase time; shared by the CSV upload and the JSON sync |
| `src/tiers.ts` | §3 | Tier mapping, then longest-name match; seat counts; the gala page filter |
| `src/matching.ts` | §4 | Buyer → sponsor |
| `src/missing.ts` | §5 | Purchases missing from a later export, within its date range |
| `src/prepareUpload.ts` | §2–5, §8 | Runs all of the above on an upload and builds the report |

`prepareUpload(csv, context)` takes the export text plus a snapshot of what the database holds (tiers,
tier mappings, sponsors, earlier purchases) and returns the rows ready for `gl_import()` and the report.
It never writes anything. No guest names are read (decided Oct 7): the guest-list column is dropped like
the phone number, and sponsors name their guests through their private link.

## Into the database

`toGlImport(prepared, fileName, csv)` (`src/glImport.ts`) turns a prepared upload into the two arguments of
`staff_import_givelively(p_rows, p_run)` in `prototype/database/backend.sql`. The database side does what
needs stored rows: dedupe on `payments.purchase_key`, skip unchanged rows, refunds, the review queue (`import_review`), tier mappings
(`tier_mappings`), and one run record per upload (`import_runs`). One upload is one transaction.

The staff app's upload screen is the remaining piece (frontend pair): read the file, call
`prepareUpload` with a snapshot of the tables, show the report and any `GalaPageNotSetError` or unknown
tiers, then call `staff_import_givelively` with `toGlImport`'s result. The database tests in
`prototype/scripts/test-backend.mjs` run that whole path on a sample CSV.

## A full-size test gala

`test/fixtures/gala-2026/` is an invented, messy gala shaped like AAFE's 2026 one: 553 guests. The Give
Lively export (`givelively-export.csv`) has 234 sponsor-guest seats in 29 sponsorships and 107 ticket seats,
plus rows to leave out or flag (another campaign, a refund, an unmapped tier, an unreadable email, a shared
inbox). `staff-added.json` holds the 212 guests staff add by hand (109
comped, 53 government or VIP, 45 AAFE staff, 3 event volunteers, 2 event staff). Guest lists are typed every
way buyers type them, and the tests check that none of that text reaches the database; `expected.json` says
what the import should make of each row.

`generate.mts` writes all three from a fixed seed; run `node test/fixtures/gala-2026/generate.mts` after
changing it (the tests fail if the files drift). `test/gala2026.test.ts` checks every row here;
`prototype/scripts/test-gala-2026.mjs` runs the whole gala into the database. For tests only: the demo keeps
its own seed data unless the team decides otherwise.

It uses Web Crypto rather than Node's `crypto`, so the same code can run in a Supabase Edge Function (Deno) later.
