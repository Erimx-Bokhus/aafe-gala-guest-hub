// Builds the data behind the hub's Code map page from graphify's graph of the repo:
//   hub/docs/codemap.json         every file, function, type, table, access rule and trigger, their links, and a layout
//   hub/docs/codemap-source.json  the source of each file, loaded only when someone opens a code preview
// graphify (https://pypi.org/project/graphifyy/) reads the code with tree-sitter, no AI and no network:
//
//   uv tool install "graphifyy[sql]"        # once; or: pipx install "graphifyy[sql]"
//   graphify update . --force               # from the repo root; writes graphify-out/ (gitignored)
//   node hub/scripts/build-codemap.mjs      # writes the two files above
//
// Keeps source code only (TypeScript, JavaScript, Python, SQL); leaves out docs, the hub, config files and
// seed data. Every node is placed in one of nine areas, and the layout is computed here, so the page opens
// without running a simulation and the same graph always gives the same picture.
//
// graphify can't follow what crosses from the apps into the database, so this script adds it from the code:
//   - an app or edge function calling a database function by name (rpc('staff_check_in'), write('staff_…'))
//   - an app, edge function or SQL function using a table (.from('orders'), "from orders", "update seats")
//   - a database function calling another (portal_get_view() calls portal_order())
//   - the access rules (row-level security), written in backend.sql as a loop over table names
//   - the triggers, and the function each one runs
// Each file's purpose is its opening comment, or its line in hub/scripts/codemap-purposes.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const IN = process.argv[2] || 'graphify-out/graph.json'
const OUT = 'hub/docs/codemap.json', OUT_SRC = 'hub/docs/codemap-source.json'
const g = JSON.parse(readFileSync(IN, 'utf8'))
const PURPOSES = JSON.parse(readFileSync(new URL('./codemap-purposes.json', import.meta.url), 'utf8'))

// Areas, in the page's legend order. The first match wins, so tests are picked out before their app.
const AREAS = [
  {id: 'staff',   name: 'Staff app',        test: f => f.startsWith('prototype/staff-app/')},
  {id: 'portal',  name: 'Sponsor portal',   test: f => f.startsWith('prototype/guest-portal/')},
  {id: 'checkin', name: 'iPad check-in',    test: f => f.startsWith('prototype/checkin-app/')},
  {id: 'shared',  name: 'Shared code',      test: f => f.startsWith('prototype/shared/')},
  {id: 'db',      name: 'Database',         test: f => f.startsWith('prototype/database/') && f.endsWith('.sql')},
  {id: 'edge',    name: 'Edge functions',   test: f => f.startsWith('prototype/supabase/functions/')},
  {id: 'import',  name: 'Import engine',    test: f => f.startsWith('import-engine/src/')},
  {id: 'scripts', name: 'Scripts and demo data', test: () => true},
  {id: 'tests',   name: 'Tests',            test: () => false},
]
const isTest = f => /\.test\.tsx?$/.test(f) || /^import-engine\/test\/(?!fixtures\/)/.test(f) ||
  /^prototype\/scripts\/test-/.test(f) || f.endsWith('/live-smoke.mjs')
const areaOf = f => isTest(f) ? AREAS.length - 1 : AREAS.findIndex(a => a.test(f))
const keep = f => /^(prototype|import-engine|scripts)\//.test(f) && /\.(tsx?|mts|mjs|py|sql)$/.test(f) &&
  !/(^|\/)(vite|vitest)\.config\.ts$|\/env\.d\.ts$|\/seed[^/]*\.sql$/.test(f)

const RELS = ['contains', 'calls', 'imports', 'imports_from', 'reads_from', 'references', 'method', 're_exports',
  'indirect_call', 'dynamic_import', 'indexes', 'executes', 'triggers', 'inherits', 'rationale_for',
  'calls_db', 'uses_table', 'guards']
const KINDS = ['file', 'function', 'type', 'table', 'value', 'rule', 'trigger']
const base = f => f.split('/').pop()
const kindOf = n => {
  if (n.label === base(n.source_file) || n.source_file.endsWith(n.label)) return 'file'
  if (n.source_file.endsWith('.sql')) return n.label.endsWith('()') ? 'function' : 'table'
  if (n._callable_class) return 'type'
  if (n._callable) return 'function'
  return 'value'
}

const nodes = g.nodes.filter(n => n.source_file && keep(n.source_file)).map(n => ({id: n.id, label: n.label, file: n.source_file,
  line: Number(String(n.source_location || '').replace(/^L/, '')) || 1, kind: kindOf(n)}))
const files = [...new Set(nodes.map(n => n.file))].sort()
const src = new Map(files.map(f => [f, readFileSync(f, 'utf8')]))
const lines = new Map(files.map(f => [f, src.get(f).split('\n')]))

/* ---------- the database's access rules and triggers, which graphify doesn't read ---------- */
const SQL = 'prototype/database/backend.sql'
const lineAt = (text, i) => text.slice(0, i).split('\n').length
const ROLE = {gala_admin: 'gala admins', relationship_manager: 'relationship managers', check_in_volunteer: 'check-in volunteers'}
const ACTION = {select: 'read', insert: 'add', update: 'change', delete: 'delete', all: 'change'}
const extra = []                                         // [rule or trigger node, links by name]
if (src.has(SQL)){
  const s = src.get(SQL)
  // foreach t in array array['orders', ...] loop ... create policy NAME on %I for ACTION ... staff_role() ... end loop
  for (const m of s.matchAll(/foreach\s+\w+\s+in\s+array\s+array\[([^\]]+)\]\s*loop([\s\S]*?)end\s+loop/gi)){
    const tables = [...m[1].matchAll(/'(\w+)'/g)].map(t => t[1])
    for (const p of m[2].matchAll(/create\s+policy\s+(\w+)\s+on\s+%I\s+for\s+(\w+)([\s\S]*?)\$p\$/gi)){
      const roles = [...new Set([...p[3].matchAll(/'(\w+)'/g)].map(r => ROLE[r[1]] || r[1]))]
      const who = roles.length ? roles.join(' and ') : 'signed-in staff'
      extra.push({node: {label: p[1], file: SQL, line: lineAt(s, m.index + m[0].indexOf(p[0])), kind: 'rule',
        doc: `Access rule: ${who} can ${ACTION[p[2].toLowerCase()] || p[2]} rows in ${tables.length} tables. Anyone else can't, unless a database function does it for them.`},
        links: [...tables.map(t => ['guards', t, 'table']), ...(/staff_role\(\)/.test(p[3]) ? [['calls', 'staff_role', 'function']] : [])]})
    }
  }
  // create trigger NAME before|after EVENTS on TABLE for each row execute function FN()
  for (const m of s.matchAll(/create\s+trigger\s+(\w+)\s+(before|after)\s+([\s\S]+?)\s+on\s+(\w+)\s+for\s+each\s+row\s+execute\s+function\s+(\w+)\(\)/gi))
    extra.push({node: {label: m[1], file: SQL, line: lineAt(s, m.index), kind: 'trigger',
      doc: `Trigger: runs ${m[5]}() ${m[2].toLowerCase()} each ${m[3].toLowerCase()} on ${m[4]}.`},
      links: [['triggers', m[4], 'table', true], ['executes', m[5], 'function']]})
}
for (const e of extra) nodes.push({id: `${e.node.kind}:${e.node.label}`, ...e.node})

/* ---------- where each node's code ends, for the code preview ---------- */
// TypeScript, JavaScript and SQL tables: until the brackets opened on the first line close again.
// SQL functions: until the closing $$. Python: while lines stay indented. Files: their first 40 lines.
function endOf(n){
  const L = lines.get(n.file), s = n.line - 1, cap = Math.min(L.length, s + 120)
  if (n.kind === 'file') return Math.min(L.length, 40)
  if (n.kind === 'rule' || n.kind === 'trigger') { for (let i = s; i < cap; i++) if (/;\s*$|\$p\$, t\);/.test(L[i])) return i + 1; return s + 1 }
  if (n.file.endsWith('.py')){
    const ind = l => l.match(/^\s*/)[0].length, i0 = ind(L[s]); let i = s + 1
    while (i < cap && (!L[i].trim() || ind(L[i]) > i0)) i++
    while (i > s + 1 && !L[i - 1].trim()) i--
    return i
  }
  if (n.file.endsWith('.sql') && L.slice(s, s + 4).some(l => l.includes('$$'))){
    let seen = 0
    for (let i = s; i < cap; i++){ seen += (L[i].match(/\$\$/g) || []).length; if (seen >= 2 && /;\s*(--.*)?$/.test(L[i])) return i + 1 }
    return cap
  }
  let depth = 0, opened = false, q = null
  for (let i = s; i < cap; i++){
    const l = L[i]
    for (let c = 0; c < l.length; c++){
      const ch = l[c]
      if (q){ if (ch === '\\') c++; else if (ch === q) q = null; continue }
      if (ch === '/' && l[c + 1] === '/') break
      if (ch === '-' && l[c + 1] === '-' && n.file.endsWith('.sql')) break
      if (ch === '"' || ch === "'" || ch === '`') q = ch
      else if ('{(['.includes(ch)){ depth++; opened = true }
      else if ('})]'.includes(ch)) depth--
    }
    if (q === "'" || q === '"') q = null                 // an unclosed quote on one line is an apostrophe in JSX text
    if (opened && depth <= 0) return i + 1
    if (!opened && i === s && !/[=,(\[{]\s*$/.test(l)) return i + 1
  }
  return cap
}

// The comment right above a node (JSDoc, // lines, -- lines, # lines), as one paragraph.
const clean = ls => ls.map(l => l.trim().replace(/^(\/\*\*?|\*\/|\*|\/\/|--|#|"""|''')\s?/, '').replace(/\*\/$|"""$|'''$/, '').trim())
  .filter(l => l && !/^[=\-*]{4,}$/.test(l) && !/^@vitest-environment/.test(l)).join(' ').replace(/\s+/g, ' ').trim()
function docAbove(n){
  const L = lines.get(n.file), out = []
  for (let i = n.line - 2; i >= 0 && out.length < 12; i--){
    const l = L[i].trim()
    if (/^(\/\/|\*|\/\*\*?|--|#)/.test(l) || l.endsWith('*/')) out.unshift(l); else break
  }
  return clean(out)
}
// A file's purpose: its line in codemap-purposes.json, or the comment it opens with.
function about(f){
  if (PURPOSES[f]) return PURPOSES[f]
  const L = lines.get(f); let i = 0
  while (i < L.length && /^#!|^\s*$|^['"]use /.test(L[i])) i++
  const out = []
  if (/^\s*("""|''')/.test(L[i] || '')){ for (; i < L.length && out.length < 14; i++){ out.push(L[i]); if (out.length > 1 && /"""|'''/.test(L[i])) break } }
  else for (; i < L.length && out.length < 14 && /^\s*(\/\/|\/\*|\*|--|#)/.test(L[i]); i++) out.push(L[i])
  const t = clean(out)
  return t.length > 700 ? t.slice(0, 700).replace(/\s\S*$/, '') + '…' : t
}

/* ---------- links ---------- */
const index = new Map(nodes.map((n, i) => [n.id, i]))
const seen = new Set(), edges = []
const link = (a, b, rel) => {
  if (a === undefined || b === undefined || a === b) return
  const k = a < b ? `${a},${b}` : `${b},${a}`
  if (seen.has(k)) return
  seen.add(k); edges.push([a, b, Math.max(0, RELS.indexOf(rel))])   // source, target, relation: "a calls b", "a contains b"
}
// graphify records a trigger as "function triggers table"; the trigger nodes added above say it the right way round
for (const l of g.links) if (l.relation !== 'triggers') link(index.get(l.source), index.get(l.target), l.relation)

const ends = nodes.map(endOf)
const byName = kind => { const m = new Map(); nodes.forEach((n, i) => { if (n.file.endsWith('.sql') && n.kind === kind){ const k = n.label.replace(/\(\)$/, ''); (m.get(k) || m.set(k, []).get(k)).push(i) } }); return m }
const sqlFns = byName('function'), sqlTables = byName('table')
for (const e of extra){ const i = index.get(`${e.node.kind}:${e.node.label}`)
  for (const [rel, name, kind, reverse] of e.links) for (const j of (kind === 'table' ? sqlTables : sqlFns).get(name) || []) reverse ? link(j, i, rel) : link(i, j, rel) }
// The innermost node whose code holds a line; the file itself if none does.
const fileNode = new Map(nodes.map((n, i) => [n, i]).filter(([n]) => n.kind === 'file').map(([n, i]) => [n.file, i]))
const holder = (f, ln) => { let best = fileNode.get(f), span = Infinity
  nodes.forEach((n, i) => { if (n.file === f && n.kind !== 'file' && n.line <= ln && ln <= ends[i] && ends[i] - n.line < span){ best = i; span = ends[i] - n.line } })
  return best }
let crossings = 0
for (const f of files){
  const sql = f.endsWith('.sql'), test = isTest(f)
  lines.get(f).forEach((l, k) => {
    const t = l.trim()
    if (/^(\/\/|\*|\/\*|--|#)/.test(t)) return
    const at = () => holder(f, k + 1), before = edges.length
    if (!sql){
      // a database function named in quotes, or called inside SQL text in a test
      for (const m of t.matchAll(/(['"`])([a-z][a-z0-9_]*)\1/g)) for (const j of sqlFns.get(m[2]) || []) link(at(), j, 'calls_db')
      if (test) for (const m of t.matchAll(/\b([a-z][a-z0-9]*_[a-z0-9_]+)\s*\(/g)) for (const j of sqlFns.get(m[1]) || []) link(at(), j, 'calls_db')
      for (const m of t.matchAll(/\.from\(\s*['"`](\w+)['"`]/g)) for (const j of sqlTables.get(m[1]) || []) link(at(), j, 'uses_table')
    } else {
      // tables a database function reads or writes, and the database functions it calls
      const h = at()
      if (nodes[h].kind === 'function'){
        for (const m of t.matchAll(/\b(?:from|join|into|update)\s+(?:public\.|private\.)?(\w+)/gi)) for (const j of sqlTables.get(m[1]) || []) link(h, j, 'uses_table')
        if (!/create\s+(or\s+replace\s+)?function/i.test(t))
          for (const m of t.matchAll(/\b(?:public\.|private\.)?([a-z][a-z0-9_]*)\s*\(/g)) for (const j of sqlFns.get(m[1]) || []) link(h, j, 'calls')
      }
    }
    crossings += edges.length - before
  })
}

const fileIx = new Map(files.map((f, i) => [f, i]))
const area = nodes.map(n => areaOf(n.file))
const deg = new Array(nodes.length).fill(0)
for (const [a, b, r] of edges) if (RELS[r] !== 'contains') { deg[a]++; deg[b]++ }

/* ---------- layout: force-directed (Fruchterman–Reingold) with a pull toward each area's home ---------- */
// Homes on a ring, ordered so areas that talk to each other sit side by side; tests sit in the middle,
// near everything they test.
const HOME = {staff: 200, portal: 245, shared: 290, checkin: 335, edge: 25, db: 70, import: 115, scripts: 160}
const R = 600
const home = AREAS.map(a => a.id === 'tests' ? [0, 0] : [R * Math.cos(HOME[a.id] * Math.PI / 180), R * Math.sin(HOME[a.id] * Math.PI / 180)])
let seed = 20261009
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
const N = nodes.length
const x = new Float64Array(N), y = new Float64Array(N), dx = new Float64Array(N), dy = new Float64Array(N)
for (let i = 0; i < N; i++){ const t = rand() * 2 * Math.PI, r = 160 * Math.sqrt(rand()); x[i] = home[area[i]][0] + r * Math.cos(t); y[i] = home[area[i]][1] + r * Math.sin(t) }
const K = 26, ITER = 500
for (let it = 0; it < ITER; it++){
  const temp = 40 * (1 - it / ITER) + 0.5
  dx.fill(0); dy.fill(0)
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++){
    let ex = x[i] - x[j], ey = y[i] - y[j], d2 = ex * ex + ey * ey
    if (d2 > 90000) continue                       // ignore pairs more than 300 apart
    if (d2 < 0.01){ ex = rand() - 0.5; ey = rand() - 0.5; d2 = 0.01 }
    const f = K * K / d2
    dx[i] += ex * f; dy[i] += ey * f; dx[j] -= ex * f; dy[j] -= ey * f
  }
  for (const [a, b, r] of edges){
    const ex = x[a] - x[b], ey = y[a] - y[b], d = Math.sqrt(ex * ex + ey * ey) || 0.01
    const w = RELS[r] === 'contains' ? 1.4 : area[a] === area[b] ? 1 : 0.25   // links across areas pull less
    const f = w * d / K
    dx[a] -= ex * f; dy[a] -= ey * f; dx[b] += ex * f; dy[b] += ey * f
  }
  for (let i = 0; i < N; i++){
    const pull = area[i] === AREAS.length - 1 ? 0.004 : 0.07
    dx[i] += (home[area[i]][0] - x[i]) * pull * K; dy[i] += (home[area[i]][1] - y[i]) * pull * K
    const d = Math.sqrt(dx[i] * dx[i] + dy[i] * dy[i]) || 1, s = Math.min(d, temp) / d
    x[i] += dx[i] * s; y[i] += dy[i] * s
  }
}

const sha = (() => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {encoding: 'utf8'}).trim() } catch { return '' } })()
const date = new Date().toLocaleString('sv-SE', {timeZone: 'America/New_York'}).slice(0, 16)
const out = {
  generated: date, commit: sha, tool: `graphify ${g.graph?.graphify_version || ''}`.trim(),
  repo: 'https://github.com/Erimx-Bokhus/aafe-gala-guest-hub',
  areas: AREAS.map(a => a.name), kinds: KINDS, rels: RELS, files, about: files.map(about),
  // [label, area, file, first line, kind, x, y, connections, last line, the comment above it]
  nodes: nodes.map((n, i) => [n.label, area[i], fileIx.get(n.file), n.line, KINDS.indexOf(n.kind), Math.round(x[i]), Math.round(y[i]), deg[i],
    ends[i], n.kind === 'file' ? '' : (n.doc || docAbove(n)).slice(0, 600)]),
  edges,
}
writeFileSync(OUT, JSON.stringify(out))
// One line of code per line of JSON, as in the files themselves, so the secret scan reads it the same way
// (a gitleaks:allow comment covers its own line only, never the whole file)
writeFileSync(OUT_SRC, `{"commit":${JSON.stringify(sha)},"files":[\n` + files.map(f => '[\n' + lines.get(f).map(l => JSON.stringify(l)).join(',\n') + '\n]').join(',\n') + '\n]}\n')
const counts = AREAS.map((a, i) => `${a.name} ${area.filter(v => v === i).length}`).join(', ')
console.log(`wrote ${OUT}: ${N} nodes (${extra.length} access rules and triggers), ${edges.length} links (${crossings} added by this script), ${files.length} files (${counts})`)
console.log(`wrote ${OUT_SRC}: ${files.length} files, ${Math.round(readFileSync(OUT_SRC).length / 1024)} KB`)
