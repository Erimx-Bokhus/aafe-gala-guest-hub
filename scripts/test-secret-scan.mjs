#!/usr/bin/env node
// Tests for the secret scan's target and verdict (scripts/secret-scan.mjs). Oct 26: run inside a git worktree, the scan
// mounted the worktree, gitleaks read no commits, and the check passed. The worktree case runs in a throwaway repository
// with a real worktree; what gitleaks would read is checked with git itself, so Docker isn't needed.
//
// Run from anywhere in the repo: node scripts/test-secret-scan.mjs

import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanProblem, scanTarget } from './secret-scan.mjs'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.log(`FAIL: ${m}`) } }
const norm = (p) => p.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()

// ---- The verdict on gitleaks' own output (its log lines, colors included)
const LOG = (n) => `\x1b[90m6:11AM\x1b[0m \x1b[32mINF\x1b[0m \x1b[1m${n} commits scanned.\x1b[0m\n\x1b[90m6:11AM\x1b[0m \x1b[32mINF\x1b[0m \x1b[1mno leaks found\x1b[0m`
ok(scanProblem(LOG(3), 3) === null, 'three commits scanned of three: trusted')
ok(scanProblem(LOG(0), 0) === null, 'nothing new to scan, nothing scanned: trusted')
ok(scanProblem(LOG(0), 2)?.includes('0 commits'), 'nothing scanned though two commits are new: not trusted (the Oct 26 case)')
ok(scanProblem(`[git] fatal: not a git repository: /repo/D:/L3/.git/worktrees/x\n${LOG(0)}`, 0)?.includes('could not read'),
  "gitleaks couldn't read the repository: not trusted, even with nothing new")
ok(scanProblem('no leaks found', 1)?.includes('how many'), 'no count in the output: not trusted')
ok(scanProblem(LOG(12), 5) === null, 'more commits scanned than counted (merge commits): trusted')

// ---- The target in a normal checkout: the checkout itself, the range by commit
const plain = scanTarget({ toplevel: 'D:/repo', gitDir: 'D:/repo/.git', commonDir: 'D:/repo/.git', head: 'h1', base: 'b1' })
ok(plain.repo === 'D:/repo' && !plain.worktree && plain.logOpts === '-m --first-parent b1..h1', `own checkout: ${JSON.stringify(plain)}`)
const plainFull = scanTarget({ toplevel: 'D:/repo', gitDir: 'D:/repo/.git', commonDir: 'D:/repo/.git', head: 'h1', base: null })
ok(plainFull.logOpts === null, 'own checkout, full scan: gitleaks reads everything behind its HEAD, as before')

// ---- In a real worktree: mount the main repository, and the range finds the worktree's own commits there
const dir = realpathSync(mkdtempSync(join(tmpdir(), 'secret-scan-')))
const main = join(dir, 'main'), wt = join(dir, 'wt')
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.name=Scan Test', '-c', 'user.email=scan@example.org', '-c', 'core.autocrlf=false', ...a],
  { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
try {
  execFileSync('git', ['init', '-q', main])
  writeFileSync(join(main, 'a.txt'), 'one\n'); git(main, 'add', '.'); git(main, 'commit', '-qm', 'base')
  const base = git(main, 'rev-parse', 'HEAD')
  git(main, 'worktree', 'add', '-q', '-b', 'feature', wt)
  writeFileSync(join(wt, 'b.txt'), 'two\n'); git(wt, 'add', '.'); git(wt, 'commit', '-qm', 'feature work')
  writeFileSync(join(wt, 'c.txt'), 'three\n'); git(wt, 'add', '.'); git(wt, 'commit', '-qm', 'more feature work')
  const rev = (...a) => git(wt, 'rev-parse', ...a)
  const t = scanTarget({ toplevel: rev('--show-toplevel'), gitDir: rev('--path-format=absolute', '--git-dir'),
    commonDir: rev('--path-format=absolute', '--git-common-dir'), head: rev('HEAD'), base })
  ok(t.worktree, 'a worktree is recognized')
  ok(norm(t.repo) === norm(main), `the main repository is mounted, not the worktree: ${t.repo}`)
  // What gitleaks runs in the mounted folder: git log with the range. There it must find the worktree's two commits,
  // though that folder's own HEAD is still the base commit.
  const range = t.logOpts.split(' ').at(-1)
  ok(git(t.repo, 'rev-list', '--count', '--first-parent', range) === '2', `the range names the worktree's 2 commits in the main repository (${range})`)
  ok(git(t.repo, 'rev-list', '--count', 'HEAD..' + rev('HEAD')) === '2', "the main repository's own HEAD would have missed them")
  const full = scanTarget({ toplevel: rev('--show-toplevel'), gitDir: rev('--path-format=absolute', '--git-dir'),
    commonDir: rev('--path-format=absolute', '--git-common-dir'), head: rev('HEAD'), base: null })
  ok(full.logOpts === rev('HEAD') && git(t.repo, 'rev-list', '--count', full.logOpts) === '3', 'worktree, full scan: everything behind the worktree\'s commit')
} finally {
  try { git(main, 'worktree', 'remove', '--force', wt) } catch { /* removed with the folder below */ }
  rmSync(dir, { recursive: true, force: true })
}

console.log(`secret scan: ${pass} passed, ${fail} failed`)
if (fail) process.exitCode = 1
