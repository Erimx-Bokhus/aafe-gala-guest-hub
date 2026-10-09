// Builds hub/docs/codemap.json, the data behind the hub's Code map page, from graphify's graph of the repo.
// graphify (https://pypi.org/project/graphifyy/) reads the code with tree-sitter, no AI and no network:
//
//   uv tool install "graphifyy[sql]"        # once; or: pipx install "graphifyy[sql]"
//   graphify update . --force               # from the repo root; writes graphify-out/ (gitignored)
//   node hub/scripts/build-codemap.mjs      # writes hub/docs/codemap.json
//
// Keeps source code only (TypeScript, JavaScript, Python, SQL); leaves out docs, the hub, config files and
// seed data. Every node is placed in one of nine areas, and the layout is computed here, so the page opens
// without running a simulation and the same graph always gives the same picture.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const IN = process.argv[2] || 'graphify-out/graph.json'
const OUT = 'hub/docs/codemap.json'
const g = JSON.parse(readFileSync(IN, 'utf8'))

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
  'indirect_call', 'dynamic_import', 'indexes', 'executes', 'triggers', 'inherits', 'rationale_for']
const base = f => f.split('/').pop()
const kindOf = n => {
  if (n.label === base(n.source_file) || n.source_file.endsWith(n.label)) return 'file'
  if (n.source_file.endsWith('.sql')) return n.label.endsWith('()') ? 'function' : 'table'
  if (n._callable_class) return 'type'
  if (n._callable) return 'function'
  return 'value'
}
const KINDS = ['file', 'function', 'type', 'table', 'value']

const nodes = g.nodes.filter(n => n.source_file && keep(n.source_file))
const index = new Map(nodes.map((n, i) => [n.id, i]))
const seen = new Set()
const edges = []
for (const l of g.links){
  const a = index.get(l.source), b = index.get(l.target)
  if (a === undefined || b === undefined || a === b) continue
  const k = a < b ? `${a},${b}` : `${b},${a}`
  if (seen.has(k)) continue
  seen.add(k)
  edges.push([a, b, Math.max(0, RELS.indexOf(l.relation))])   // source, target, relation: "a calls b", "a contains b"
}
const files = [...new Set(nodes.map(n => n.source_file))].sort()
const fileIx = new Map(files.map((f, i) => [f, i]))
const area = nodes.map(n => areaOf(n.source_file))
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
  areas: AREAS.map(a => a.name), kinds: KINDS, rels: RELS, files,
  // [label, area, file, line, kind, x, y, connections]
  nodes: nodes.map((n, i) => [n.label, area[i], fileIx.get(n.source_file), Number(String(n.source_location || '').replace(/^L/, '')) || 0,
    KINDS.indexOf(kindOf(n)), Math.round(x[i]), Math.round(y[i]), deg[i]]),
  edges,
}
writeFileSync(OUT, JSON.stringify(out))
const counts = AREAS.map((a, i) => `${a.name} ${area.filter(v => v === i).length}`).join(', ')
console.log(`wrote ${OUT}: ${N} nodes, ${edges.length} links, ${files.length} files (${counts})`)
