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

## Not here yet

These need stored rows, so they belong in `gl_import()` (Natalie's `backend.sql`, spec §9): skipping
unchanged rows, `guest_text_changed`, never filling seats a sponsor or staff already named, the
all-or-nothing transaction, and the new tables (`import_runs`, `import_review`, `tier_mappings`). Spec
test cases 3, 20, 21, 24, 32, and 36 are database tests and come with that work.

It uses Web Crypto rather than Node's `crypto`, so the same code can run in a Supabase Edge Function (Deno) later.
