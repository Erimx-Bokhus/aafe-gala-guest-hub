// npm run db:drift -- <set>   Does the linked Supabase project's demo data match the seed set exactly? (Gate 1, box 6)
// Read-only: it loads the set the way npm run db:load does into an in-memory Postgres, reads the same tables from the
// project, and compares them row by row and field by field. Exit 1, with what differs, when they don't match.
// Run from prototype/ after `npx supabase link`. Tested in scripts/test-demo-drift.mjs.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { SETS, buildLoadSql } from './demo-data.mjs'

// Every table a demo set fills, but the staff list, which a load keeps (scripts/demo-data.mjs).
export const SEED_TABLES = ['gala_events', 'sponsorship_tiers', 'sponsors', 'orders', 'payments', 'event_tables',
  'guests', 'seats', 'check_ins', 'email_log', 'audit_log', 'salesforce_sync']
/** A row's fields a load doesn't take from the set. Found by loading each set twice and comparing; a new one fails
 *  scripts/test-demo-drift.mjs, so it can't hide here unnoticed. */
export function notFromTheSet(table, row) {
  return ['sync_txid', ...loadOnly(table, row)]   // the transaction that last wrote the row: its number is the database's own
}
function loadOnly(table, row) {
  if (table === 'gala_events') return ['givelively_page_name']   // kept from before the load: Pull now needs it
  if (table === 'payments' || table === 'email_log') return ['created_at']   // the seeds leave it to the database clock
  // backend.sql builds the sponsor pipeline after a load: its lines carry the time and the new prospect's random id.
  if (table === 'audit_log' && row.entity === 'prospect' && row.actor_type === 'system' && row.actor === 'Pipeline') return ['at', 'entity_id']
  return []
}

/** One query that returns every row of these tables, ordered by id: { table: [row, ...] }. */
export const snapshotSql = (tables = SEED_TABLES) =>
  `select jsonb_build_object(${tables.map((t) => `'${t}', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from ${t} x)`).join(', ')}) s`

// The same instant or the same value, whatever the time zone a database writes times in.
const TIME = /^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b) || (typeof a === 'string' && typeof b === 'string' && TIME.test(a) && TIME.test(b) && Date.parse(a) === Date.parse(b))

/** What differs between the set as loaded (ref) and the project (live): per table, rows missing, added, changed. */
export function compare(ref, live, skip = notFromTheSet) {
  const out = {}
  for (const t of Object.keys(ref)) {
    const a = new Map(ref[t].map((r) => [String(r.id), r])), b = new Map((live[t] ?? []).map((r) => [String(r.id), r]))
    const fields = (r) => { const ignore = skip(t, r ?? {}); return Object.keys(r ?? {}).filter((k) => !ignore.includes(k)) }
    const anyRef = ref[t][0], anyLive = live[t]?.[0]
    const d = {
      missing: [...a.keys()].filter((id) => !b.has(id)),
      added: [...b.keys()].filter((id) => !a.has(id)),
      changed: [],
      // A field only one side has: the project's backend.sql is older or newer than this checkout's.
      onlyInSet: anyRef && anyLive ? fields(anyRef).filter((k) => !(k in anyLive)) : [],
      onlyInProject: anyRef && anyLive ? fields(anyLive).filter((k) => !(k in anyRef)) : [],
    }
    for (const [id, r] of a) {
      const l = b.get(id)
      if (!l) continue
      const diff = fields(r).filter((k) => k in l && !same(r[k], l[k]))
      if (diff.length) d.changed.push({ id, fields: Object.fromEntries(diff.map((k) => [k, { set: r[k], project: l[k] }])) })
    }
    if (d.missing.length || d.added.length || d.changed.length || d.onlyInSet.length || d.onlyInProject.length) out[t] = d
  }
  return out
}

/** The set as `npm run db:load` would leave it, in an in-memory Postgres: { table: [row, ...] }. */
export async function loadedSet(set) {
  const { openTestDb, D } = await import('./test-db.mjs')
  const { db } = await openTestDb()
  await db.exec(buildLoadSql(set))
  await db.exec(readFileSync(D + 'backend.sql', 'utf8'))
  return { db, rows: (await db.query(snapshotSql())).rows[0].s }
}

/** Plain-words report, a few examples per table. */
export function report(diff, set) {
  const tables = Object.entries(diff)
  if (!tables.length) return `The project's demo data matches "${SETS[set].label}" exactly (${SEED_TABLES.length} tables).`
  const few = (xs) => xs.slice(0, 5).join(', ') + (xs.length > 5 ? `, and ${xs.length - 5} more` : '')
  const lines = [`The project's demo data differs from "${SETS[set].label}":`]
  for (const [t, d] of tables) {
    lines.push(`  ${t}:`)
    if (d.onlyInSet.length) lines.push(`    fields the project doesn't have: ${d.onlyInSet.join(', ')} (run npm run db:backend)`)
    if (d.onlyInProject.length) lines.push(`    fields this checkout doesn't have: ${d.onlyInProject.join(', ')}`)
    if (d.missing.length) lines.push(`    ${d.missing.length} row(s) of the set missing: ${few(d.missing)}`)
    if (d.added.length) lines.push(`    ${d.added.length} row(s) not in the set: ${few(d.added)}`)
    for (const c of d.changed.slice(0, 5)) {
      lines.push(`    ${c.id}: ${Object.entries(c.fields).map(([k, v]) => `${k} ${JSON.stringify(v.set)} in the set, ${JSON.stringify(v.project)} in the project`).join('; ')}`)
    }
    if (d.changed.length > 5) lines.push(`    and ${d.changed.length - 5} more row(s) changed`)
  }
  lines.push('To make it match: npm run db:load -- ' + set + ' (replaces the demo data; the staff list and page names are kept).')
  return lines.join('\n')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const set = process.argv[2]
  if (!SETS[set]) {
    console.error(`Usage: npm run db:drift -- <set>\nSets: ${Object.entries(SETS).map(([k, v]) => `${k} (${v.label})`).join(', ')}`)
    process.exit(2)
  }
  const CLI = fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url))
  const answer = JSON.parse(execFileSync(process.execPath, [CLI, 'db', 'query', '--linked', '-o', 'json', snapshotSql()], { encoding: 'utf8', maxBuffer: 1 << 28 }))
  const live = answer.rows[0].s
  const { rows } = await loadedSet(set)
  const diff = compare(rows, live)
  console.log(report(diff, set))
  process.exit(Object.keys(diff).length ? 1 : 0)
}
