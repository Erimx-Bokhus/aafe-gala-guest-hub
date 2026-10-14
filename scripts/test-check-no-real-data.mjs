#!/usr/bin/env node
// Tests for the real-data guard: it reads the last commit, as GitHub does, and reports files changed on disk as
// "not committed yet" warnings only (the Oct 12 audit's low finding: the local checks read the working copy, not
// the commit). Runs the real script in a throwaway git repository.
//
// Run from anywhere in the repo: node scripts/test-check-no-real-data.mjs

import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = mkdtempSync(join(tmpdir(), 'real-data-guard-'))
const git = (...a) => execFileSync('git', ['-c', 'user.name=Guard Test', '-c', 'user.email=guard@example.org', '-c', 'core.autocrlf=false', ...a],
  { cwd: dir, stdio: 'pipe' })
const guard = () => {
  const r = spawnSync(process.execPath, [join(dir, 'scripts', 'check-no-real-data.mjs')], { cwd: dir, encoding: 'utf8' })
  return { code: r.status, out: r.stdout + r.stderr }
}
let pass = 0, fail = 0
const ok = (c, m, out = '') => { if (c) pass++; else { fail++; console.log(`FAIL: ${m}\n${out}`) } }
// A personal-looking address, put together at run time so this file passes the guard itself.
const REAL = ['pat.lee', 'gmail.com'].join('@')

try {
  git('init', '-q')
  mkdirSync(join(dir, 'scripts'))
  copyFileSync(fileURLToPath(new URL('./check-no-real-data.mjs', import.meta.url)), join(dir, 'scripts', 'check-no-real-data.mjs'))
  writeFileSync(join(dir, 'guests.md'), 'Ana Diaz, ana@example.org\n')
  git('add', '.'); git('commit', '-q', '-m', 'invented guests')

  let r = guard()
  ok(r.code === 0 && /No real-data patterns in 2 committed files\./.test(r.out), 'a clean commit passes', r.out)

  writeFileSync(join(dir, 'guests.md'), `Ana Diaz, ana@example.org\nPat Lee, ${REAL}\n`)
  r = guard()
  ok(r.code === 0 && /Not committed yet: 1 place/.test(r.out) && r.out.includes(`guests.md:2: email ${REAL}`),
    'an address only on disk is a warning, and the run passes, as it would on GitHub', r.out)

  git('commit', '-q', '-am', 'a real address slips in')
  r = guard()
  ok(r.code === 1 && r.out.includes(`guests.md:2: email ${REAL}`) && !/Not committed yet/.test(r.out), 'once committed, it fails', r.out)

  unlinkSync(join(dir, 'guests.md'))
  r = guard()
  ok(r.code === 1 && r.out.includes(REAL), "deleting the file on disk doesn't hide what the commit holds", r.out)

  writeFileSync(join(dir, 'export.csv'), 'name\nAna Diaz\n'); git('add', 'export.csv')
  r = guard()
  ok(r.code === 1 && /export\.csv: CSV files belong under seed\/ or fixtures\/ only/.test(r.out) && /Not committed yet/.test(r.out),
    'a staged CSV outside seed/ is flagged before it is committed', r.out)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log(`real-data guard: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
