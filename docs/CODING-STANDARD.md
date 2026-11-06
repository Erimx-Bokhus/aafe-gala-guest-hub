# Coding standard

Adopted October 15, 2026, for the stability run to Stable V1 (Gate 4, #150). It adapts NASA/JPL's "Power of Ten" rules for safety-critical code (Gerard Holzmann, JPL, 2006) to TypeScript and SQL. Those rules were written for C on spacecraft; what carries over is the discipline: code simple enough to check, every limit explicit, every error handled, and the checking done by tools on every change rather than by memory.

The gala tool handles six-figure sponsorships, guest names that go onto badges, and check-in at a door with no second chance. The standard is how we keep that trustworthy.

## How it's enforced

- `npm run lint` at the repo root runs ESLint with these rules, **zero warnings allowed** (`eslint.config.mjs`; each rule there is tagged R1–R10).
- TypeScript runs in `strict` mode in every package.
- The SQL rules (S1–S7) are checked by the backend test suites (`npm run test:backend` in `prototype/`).
- `node scripts/ci-local.mjs` runs all of it on a laptop first, then the same checks run on every pull request.
- **The fast lane (Oct 18).** Push with `node scripts/ci-local.mjs --push` instead of `git push`: it runs all seven checks on your last commit and, only if they all pass, pushes it and marks it `local-ci` on GitHub right away (GitHub's checks wait a few seconds for the mark). For a pull request on that exact commit, if the base branch adds no files it lacks, GitHub's two long checks (backend, frontend) then pass in seconds instead of running again; otherwise they run in full. A pull request whose head is main's own "Merge pull request" commit uses the mark of the branch it merged, since that commit has exactly the branch's files (Oct 22). The secret scan and the real-data guard always run on GitHub. The mark is trust-based: anyone with write access can set it, so it saves Actions minutes, it doesn't prove anything. Nothing runs again after a merge into `main` (the pull request already tested the merged code); a weekly full run on `main` and the Actions tab's **Run workflow** button catch what a laptop missed.
- **Exceptions** are allowed only with a reason, on the line itself: `// eslint-disable-next-line <rule> -- <why this is safe>`. A reviewer reads every one.

## Stages

- **Stage 1 (now):** the critical modules, where a mistake costs money, a guest, or the door:
  - the Give Lively import (`import-engine/src`, `staff-app/src/importer.ts`, `gl_import` and the sync);
  - offline check-in and its sync (`shared/src/offlineCheckin.ts`, `checkin-app/src/liveDoor.ts`);
  - sign-in and roles (`shared/src/supabase.ts`, the `require_staff` checks);
  - the server functions (`supabase/functions`) and the database functions (`backend.sql`).
- **Stage 2:** the same rules spread to the rest, one module at a time.
- Stage 1 is done when the critical modules pass with zero warnings, every bug found in them has a fix and a test that failed before it, and a full click-through plus the gala-night load test find no high or medium bugs two runs in a row.

## The rules

| # | JPL's rule | Ours | Checked by |
| --- | --- | --- | --- |
| R1 | Simple control flow: no goto, setjmp or recursion | No labels or jumps. Nesting at most 4 deep. Each function's branching (cyclomatic complexity) at most 15. Recursion only over data with a fixed depth, with a comment saying what bounds it | `no-labels`, `max-depth`, `complexity`; review for recursion |
| R2 | Every loop has a fixed upper bound | No `while (true)`. Every loop over outside data has a stated limit: paging (`PAGE`), retry counts (`retry` takes its delays), the rows in one file | `no-constant-condition`; review |
| R3 | No dynamic memory allocation after start-up | Every input has a size limit before it's stored or processed: text cut at a stated length in SQL (`left(..., 500)`), upload sizes, page sizes. Nothing grows without a bound | Review; SQL tests |
| R4 | Functions fit on one page (about 60 lines) | At most 60 lines of code per function, at most 5 parameters (pass an object beyond that) | `max-lines-per-function`, `max-params` |
| R5 | At least two assertions per function | Check what can't happen. Input is validated where it enters (the CSV reader's schema, `require_staff` and `invalid_input` in SQL). Inside, an impossible state throws with a message, through `must()`, never a silent `!` | `no-non-null-assertion`; tests |
| R6 | Data at the smallest possible scope | `const` by default, nothing reassigned that doesn't need to be, no shadowed names, no module-level mutable state except a documented cache | `prefer-const`, `no-var`, `no-param-reassign`, `no-shadow` |
| R7 | Check every return value and every parameter | Every promise is awaited or handled. Every Supabase `{ error }` is checked. No empty `catch`. Only `Error`s are thrown. A `switch` over a union covers every case | `no-floating-promises`, `no-misused-promises`, `no-empty`, `only-throw-error`, `switch-exhaustiveness-check` |
| R8 | Limit the preprocessor | No code built at run time: no `eval`, `new Function` or string timers | `no-eval`, `no-implied-eval`, `no-new-func` |
| R9 | Restrict pointers | No escapes from the type system: no `any`, no unchecked `!`, no `as` that only silences the checker, no use of untyped data before it's checked | `no-explicit-any`, `no-non-null-assertion`, `no-unsafe-*`, `no-unnecessary-type-assertion` |
| R10 | Compile with all warnings on; zero warnings; static analysis daily | `strict` TypeScript; lint and tests on every change, on a laptop first and on every pull request; zero warnings | `tsc`, `npm run lint`, `scripts/ci-local.mjs`, CI |

`==` is not used, except `x == null` to mean "null or undefined", which ESLint's `eqeqeq` allows as `null: 'ignore'`.

## SQL rules (`backend.sql`)

| # | Rule | Checked by |
| --- | --- | --- |
| S1 | A function that runs with the owner's rights (`security definer`) sets `search_path = public`, so a caller can't swap in their own tables | `test-sql-standard.mjs` |
| S2 | A staff function checks the caller's role first (`require_staff(...)` as its first declaration), so a refused caller gets `forbidden` before anything runs | `test-access.mjs` (every function, every role) |
| S3 | Only the functions the apps call can be called through the API, each from the private schema behind a wrapper | `test-access.mjs` |
| S4 | Every change a person makes is written to the change log, with old and new values where there are some (hard rule 7) | `test-audit.mjs` (every staff function is listed) |
| S5 | Money is `numeric`, never floating point, and a refund never makes an amount negative | Schema review; `test-reports.mjs` |
| S6 | No SQL built from text at run time inside a function, except names quoted with `format('%I')` | `test-sql-standard.mjs` |
| S7 | Re-running `backend.sql` is safe, and an upgrade that changes data runs once on every database | `test-db.mjs` runs it twice; the version table (Gate 1, #146) |

## Writing a check that can't fail silently

```ts
import { must } from './must.ts'
const m = must(PATTERN.exec(text), 'a purchase time always matches PATTERN here')   // throws with this message if not
```

`must()` is the one place an "it can't be missing" lives, so a wrong assumption fails loudly with a reason instead of crashing later with "cannot read properties of undefined".
