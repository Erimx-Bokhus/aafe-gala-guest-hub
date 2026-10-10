#!/usr/bin/env node
// The six GitHub checks, run on your own computer: same steps as .github/workflows/, no Actions minutes.
// Each check runs on its own, like a separate CI job; the summary at the end says which passed.
//
//   node scripts/ci-local.mjs                  all six checks (about 5 minutes)
//   node scripts/ci-local.mjs --quick          skip the backend tests and the demo-file rebuild (about 1 minute)
//   node scripts/ci-local.mjs frontend backend only the checks named (real-data, secrets, import-engine,
//                                              frontend, backend, edge-functions)
//   node scripts/ci-local.mjs --full-scan      scan the whole git history for secrets, not just your new commits
//   node scripts/ci-local.mjs --install-hook   run --quick before every git push (skip once with git push --no-verify)
//
// Needs Node 22+ and Python. Docker (for the secret scan) and Deno (for the server-function check) are optional:
// a check whose tool is missing is skipped with a note, not failed.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'

const root = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).stdout.trim()
const proto = join(root, 'prototype')
const args = process.argv.slice(2)
const flag = (f) => args.includes(f)
const named = args.filter((a) => !a.startsWith('--'))

if (flag('--install-hook')) {
  const hook = join(root, '.git', 'hooks', 'pre-push')
  writeFileSync(hook, '#!/bin/sh\n# Installed by scripts/ci-local.mjs: quick local checks before every push.\nnode scripts/ci-local.mjs --quick\n')
  try { chmodSync(hook, 0o755) } catch { /* Windows: Git for Windows runs it anyway */ }
  console.log(`Installed ${hook}. Every git push now runs the quick checks first; skip once with git push --no-verify.`)
  process.exit(0)
}

/** Run a shell command in a folder, output shown live. Returns true when it exits 0. */
function sh(cmd, cwd = root) {
  console.log(`\n$ ${cmd}${cwd === root ? '' : `   (in ${cwd.slice(root.length + 1)})`}`)
  return spawnSync(cmd, { cwd, shell: true, stdio: 'inherit' }).status === 0
}
const quiet = (cmd, cwd = root) => spawnSync(cmd, { cwd, shell: true, encoding: 'utf8' })
const has = (cmd) => quiet(cmd).status === 0
const python = has('python3 -c "print(1)"') ? 'python3' : 'python'   // Windows has "python", not "python3"
const deps = (dir) => existsSync(join(dir, 'node_modules')) || sh('npm ci', dir)
const hashFiles = (files) => files.map((f) => existsSync(f) ? createHash('sha256').update(readFileSync(f)).digest('hex') : '-').join()

// Files the frontend check rebuilds; CI fails when the committed copies are out of date.
const GENERATED = ['database/seed.sql', 'shared/src/seed.json', 'database/seed.full-as-sent.sql', 'database/seed.full-fixed.sql',
  'shared/src/seed.full-as-sent.json', 'shared/src/seed.full-fixed.json', 'OPEN-Guest-Portal.html', 'OPEN-Staff-App.html', 'OPEN-CheckIn-App.html']
  .map((f) => join(proto, f))

const SKIP = Symbol('skip')
const checks = {
  'real-data': () => sh('node scripts/check-no-real-data.mjs'),

  // .github/workflows/gitleaks.yml: your commits not yet on main (merge commits included), or everything with --full-scan.
  secrets: () => {
    if (!has('docker info')) return [SKIP, 'Docker is not running; start Docker Desktop to scan for secrets']
    const range = flag('--full-scan') ? '' : ` --log-opts="-m --first-parent origin/main..HEAD"`
    return sh(`docker run --rm -v "${root}:/repo" ghcr.io/gitleaks/gitleaks:v8.30.1 git /repo --redact --no-banner${range}`)
  },

  'import-engine': () => {
    const dir = join(root, 'import-engine')
    return deps(dir) && sh('npm run typecheck', dir) && sh('npm test', dir)
  },

  // .github/workflows/frontend.yml: tests, then rebuild the seeds and double-click files and check nothing changed.
  frontend: () => {
    if (!(deps(proto) && deps(join(root, 'import-engine')) && sh('npm test', proto))) return false
    if (flag('--quick')) return true
    const crlf = quiet('git ls-files --eol').stdout.split('\n').filter((l) => /^i\/lf\s+w\/crlf/.test(l))
    if (crlf.length) console.log(`\nNote: ${crlf.length} file(s) have Windows line endings in your working copy; the rebuild may differ from CI.`)
    const before = hashFiles(GENERATED)
    const built = sh(`${python} database/generate_seed.py`, proto) && sh(`${python} database/generate_full_seed.py`, proto) &&
      sh('npm run build', proto) && sh(`${python} scripts/make_open_files.py`, proto) && sh(`${python} checkin-app/scripts/make_open_file.py`, proto)
    if (!built) return false
    if (hashFiles(GENERATED) !== before) {
      console.log('\nThe demo files were out of date and are now rebuilt. Commit them (CI fails otherwise):')
      sh(`git status --short -- ${GENERATED.map((f) => `"${f}"`).join(' ')}`)
      return false
    }
    return true
  },

  backend: () => {
    if (flag('--quick')) return [SKIP, 'skipped with --quick']
    return deps(proto) && deps(join(root, 'import-engine')) && sh('npm run test:backend', proto)
  },

  // .github/workflows/edge-functions.yml
  'edge-functions': () => {
    if (!has('deno --version')) return [SKIP, 'Deno is not installed (winget install DenoLand.Deno, or https://deno.com)']
    const dir = join(proto, 'supabase', 'functions')
    const files = readdirSync(dir).filter((d) => existsSync(join(dir, d, 'index.ts'))).map((d) => `supabase/functions/${d}/index.ts`)
    return sh(`deno check --node-modules-dir=auto ${files.join(' ')}`, proto)
  },
}

const unknown = named.filter((n) => !checks[n])
if (unknown.length) { console.error(`Unknown check: ${unknown.join(', ')}. Choose from: ${Object.keys(checks).join(', ')}`); process.exit(2) }

const results = []
for (const name of named.length ? named : Object.keys(checks)) {
  console.log(`\n━━━━━━━━ ${name} ━━━━━━━━`)
  const start = Date.now()
  let r
  try { r = checks[name]() } catch (e) { console.error(e); r = false }
  const secs = Math.round((Date.now() - start) / 1000)
  results.push(Array.isArray(r) && r[0] === SKIP ? { name, status: 'skipped', note: r[1], secs } : { name, status: r ? 'passed' : 'FAILED', secs })
}

console.log('\n━━━━━━━━ Summary ━━━━━━━━')
for (const r of results) console.log(`${r.status === 'passed' ? '✓' : r.status === 'skipped' ? '–' : '✗'} ${r.name.padEnd(15)} ${r.status.padEnd(8)} ${String(r.secs).padStart(4)}s${r.note ? `   ${r.note}` : ''}`)
const failed = results.filter((r) => r.status === 'FAILED')
console.log(failed.length ? `\n${failed.length} check(s) failed. Fix before pushing; CI runs the same steps.` : '\nAll checks that ran passed.')
process.exit(failed.length ? 1 : 0)
