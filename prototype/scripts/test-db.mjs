// Shared by the backend test scripts: an in-memory Postgres (PGlite) loaded with schema.sql + seed.sql +
// backend.sql (run twice: re-running must be safe), with stand-ins for Supabase's API roles and
// auth.jwt(), and helpers to run SQL as a role.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const D = fileURLToPath(new URL('../database/', import.meta.url))

export async function openTestDb() {
  const db = new PGlite()
  // Minimal Supabase stand-ins: API roles and auth.jwt() reading the request claims, as Supabase does.
  await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`)
  await db.exec(readFileSync(D + 'schema.sql', 'utf8'))
  await db.exec(readFileSync(D + 'seed.sql', 'utf8'))
  await db.exec(readFileSync(D + 'backend.sql', 'utf8'))
  await db.exec(readFileSync(D + 'backend.sql', 'utf8')) // re-run must be safe

  // Run SQL as an API role, signed in as `email` (null = no JWT).
  async function as(role, email, sql, params = []) {
    await db.exec(`reset role; select set_config('request.jwt.claims', '${email ? JSON.stringify({ email }) : ''}', false)`)
    await db.exec(`set role ${role}`)
    try { return (await db.query(sql, params)).rows } finally { await db.exec('reset role') }
  }
  // The error message, or null if it succeeded.
  async function err(role, email, sql, params = []) {
    try { await as(role, email, sql, params); return null } catch (e) { return e.message }
  }
  return { db, as, err }
}

export function counter() {
  const c = { pass: 0, fail: 0 }
  c.ok = (cond, msg) => { if (cond) c.pass++; else { c.fail++; console.log('FAIL:', msg) } }
  return c
}
