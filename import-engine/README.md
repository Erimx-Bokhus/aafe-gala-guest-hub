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
| `src/readExport.ts` | §1, §2 | Reads AAFE's ticket export (Papa Parse), finds columns by name, validates each row (Zod), rejects bad rows with their row number, drops phone numbers, computes the purchase key |
| `src/values.ts` | §1 | `$1,000.00 ` → 1000; `2026-02-05 05:14:46 PM EST` → UTC |
| `src/purchaseKey.ts` | §2 | SHA-256 of buyer email + UTC purchase time; shared by the CSV upload and the JSON sync |
| `src/tiers.ts` | §3 | Tier mapping, then longest-name match; seat counts; the gala page filter |
| `src/guestList.ts` | §3 | Splits the free-text guest list, or leaves it for the sponsor when unclear |
| `src/matching.ts` | §4 | Buyer → sponsor; imported guest → `double_booked` / `possible_duplicate` |
| `src/missing.ts` | §5 | Purchases missing from a later export, within its date range |
| `src/prepareUpload.ts` | §2–5, §8 | Runs all of the above on an upload and builds the report |

`prepareUpload(csv, context)` takes the export text plus a snapshot of what the database holds (tiers,
tier mappings, sponsors, this gala's guests, earlier purchases) and returns the rows ready for
`gl_import()` and the report. It never writes anything.

## Into the database

`toGlImport(prepared, fileName, csv)` (`src/glImport.ts`) turns a prepared upload into the two arguments of
`staff_import_givelively(p_rows, p_run)` in `prototype/database/backend.sql`. The database side does what
needs stored rows: dedupe on `payments.purchase_key`, skip unchanged rows, pre-fill guests only into orders
nobody has named, `guest_text_changed`, refunds, the review queue (`import_review`), tier mappings
(`tier_mappings`), and one run record per upload (`import_runs`). One upload is one transaction.

The staff app's upload screen is the remaining piece (frontend pair): read the file, call
`prepareUpload` with a snapshot of the tables, show the report and any `GalaPageNotSetError` or unknown
tiers, then call `staff_import_givelively` with `toGlImport`'s result. The database tests in
`prototype/scripts/test-backend.mjs` run that whole path on a sample CSV.

It uses Web Crypto rather than Node's `crypto`, so the same code can run in a Supabase Edge Function (Deno) later.
