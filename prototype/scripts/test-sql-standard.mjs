// The coding standard's SQL rules the database itself can check (docs/CODING-STANDARD.md). S2–S4 are checked by
// test-access.mjs and test-audit.mjs; S5 by test-reports.mjs; S7 by test-db.mjs running backend.sql twice.
// Runs with npm run test:backend.
import { counter, openTestDb } from './test-db.mjs'
const { db } = await openTestDb()
const count = counter(), ok = count.ok

const fns = (await db.query(`
  select n.nspname || '.' || p.proname as name, p.prosecdef as definer, p.proconfig as config, p.prosrc as src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
   where n.nspname in ('public', 'private') and l.lanname in ('sql', 'plpgsql')`)).rows
ok(fns.length > 100, `the database functions are there to check (${fns.length})`)

// S1: a function that runs with the owner's rights sets search_path, so a caller can't put their own tables first.
const unpinned = fns.filter((f) => f.definer && !(f.config ?? []).some((c) => c.startsWith('search_path=')))
ok(unpinned.length === 0, `every owner-rights function sets search_path (S1)${unpinned.length ? ': ' + unpinned.map((f) => f.name).join(', ') : ''}`)

// S6: no SQL made from text at run time inside a function; names, if ever needed, only through format('%I').
const dynamic = fns.filter((f) => /\bexecute\b(?!\s+format\s*\()/i.test(f.src))
ok(dynamic.length === 0, `no function runs SQL built from text (S6)${dynamic.length ? ': ' + dynamic.map((f) => f.name).join(', ') : ''}`)

console.log(`sql standard: ${count.pass} passed, ${count.fail} failed`)
if (count.fail) process.exitCode = 1
