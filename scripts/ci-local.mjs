#!/usr/bin/env node
// The six GitHub checks, run on your own computer: same steps as .github/workflows/, no Actions minutes.
// Each check runs on its own, like a separate CI job; the summary at the end says which passed.
//
//   node scripts/ci-local.mjs                  all six checks (about 5 minutes)
//   node scripts/ci-local.mjs --quick          skip the backend tests and the demo-file rebuild (about 1 minute)
//   node scripts/ci-local.mjs frontend backend only the checks named (real-data, secrets, import-engine,
//                                              lint, frontend, backend, edge-functions)
//   node scripts/ci-local.mjs --full-scan      scan the whole git history for secrets, not just your new commits
//   node scripts/ci-local.mjs --install-hook   run --quick before every git push (skip once with git push --no-verify)
//   node scripts/ci-local.mjs --push           all seven checks on your last commit, then, only if they all pass,
//                                              push it and mark it for GitHub's fast lane (use it instead of git push)
//
// Needs Node 22+ and Python. Docker (for the secret scan) and Deno (for the server-function check) are optional:
// a check whose tool is missing is skipped with a note, not failed.
//
// The fast lane: when a full run (all seven checks, no --quick) passes on a commit with nothing left uncommitted, it
// marks that commit "local-ci" on GitHub (with the GitHub CLI you're signed in with). GitHub's two long checks,
// backend and frontend, then pass in seconds for a pull request on that exact commit, if it already includes the
// latest base branch; otherwise they run in full. The secret scan and real-data guard always run on GitHub.
// Use --push instead of git push: GitHub starts its checks the moment a commit arrives, so the mark has to follow the
// push at once (the checks wait a few seconds for it). Without --push, the commit must already be on GitHub.
// The mark is trust-based: anyone with write access can set it (docs/CODING-STANDARD.md).

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
  'real-data': () => sh('node scripts/check-no-real-data.mjs') && sh('node scripts/test-check-no-real-data.mjs'),

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

  // The coding standard (docs/CODING-STANDARD.md): ESLint from the repo root, zero warnings. Type information comes
  // from each package, so their modules are installed too. Also in frontend.yml.
  lint: () => deps(root) && deps(proto) && deps(join(root, 'import-engine')) && sh('npm run lint', root),

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
    return sh(`deno check --no-lock --node-modules-dir=auto ${files.join(' ')}`, proto)   // --no-lock: no deno.lock left behind
  },
}

const unknown = named.filter((n) => !checks[n])
if (unknown.length) { console.error(`Unknown check: ${unknown.join(', ')}. Choose from: ${Object.keys(checks).join(', ')}`); process.exit(2) }

// The real-data and secret scans read your commits, as GitHub does. Tests and builds read the files on disk.
const changed = quiet('git status --porcelain --untracked-files=no').stdout.split('\n').filter(Boolean).length
if (changed) console.log(`Note: ${changed} file(s) differ from your last commit. The real-data and secret scans check what's committed, as GitHub does;`
  + ' tests and builds use the files on disk. Commit first for results that match GitHub\'s.')

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
if (!failed.length) {
  const why = (flag('--push') && pushHead()) || markLocalPass()
  console.log(why ? `Not marked for GitHub's fast lane: ${why}.` : 'Marked this commit "local-ci" on GitHub: its backend and frontend checks will pass in seconds.')
  if (why && flag('--push')) process.exit(1)
} else if (flag('--push')) console.log('Not pushed: a check failed.')
process.exit(failed.length ? 1 : 0)

/** --push: pushes the commit that just passed (its checks already ran in full, so no pre-push hook). */
function pushHead() {
  if (named.length || flag('--quick')) return 'only a full run is pushed (all seven checks, no --quick)'
  if (results.some((r) => r.status !== 'passed')) return `${results.filter((r) => r.status !== 'passed').map((r) => r.name).join(', ')} didn't run, so nothing was pushed`
  if (changed) return 'files differ from your last commit, so nothing was pushed; commit them and run again'
  const branch = quiet('git branch --show-current').stdout.trim()
  if (!branch) return 'not on a branch, so nothing was pushed'
  const upstream = quiet('git rev-parse --abbrev-ref --symbolic-full-name @{u}').status === 0
  console.log(`\nPushing ${branch}...`)
  return sh(upstream ? 'git push --no-verify' : `git push --no-verify -u origin ${branch}`) ? null : 'the push failed'
}

/** Marks HEAD "local-ci" on GitHub when this was a full pass on committed, pushed code; else says why not. */
function markLocalPass() {
  if (named.length || flag('--quick')) return 'only a full run counts (all seven checks, no --quick)'
  const skipped = results.filter((r) => r.status !== 'passed').map((r) => r.name)
  if (skipped.length) return `${skipped.join(', ')} didn't run`
  if (changed) return 'files differ from your last commit; commit them, push, and run again'
  const sha = quiet('git rev-parse HEAD').stdout.trim()
  if (!quiet(`git branch -r --contains ${sha}`).stdout.trim()) return 'this commit isn\'t on GitHub yet; push it, then run again'
  if (!has('gh auth status')) return 'the GitHub CLI isn\'t signed in (gh auth login)'
  const repo = quiet('gh repo view --json nameWithOwner -q .nameWithOwner').stdout.trim()
  const who = quiet('gh api user -q .login').stdout.trim()
  const os = { win32: 'Windows', darwin: 'macOS' }[process.platform] ?? 'Linux'
  const r = quiet(`gh api repos/${repo}/statuses/${sha} -f state=success -f context=local-ci -f "description=All 7 checks passed locally (${os}) by ${who}"`)
  return r.status === 0 ? null : `GitHub refused the mark (${(r.stderr || r.stdout).trim().split('\n').pop()})`
}
