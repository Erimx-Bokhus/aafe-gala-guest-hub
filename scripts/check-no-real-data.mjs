#!/usr/bin/env node
// Real-data guard (hard rule 1: no real donor data, ever). Fails if a committed file contains
//   1. an email address outside the reserved demo domains (example.org/.com/.net and their
//      subdomains, .test, .example, .invalid) or the short list of public addresses below;
//   2. a US phone number outside the fictional range 555-0100 to 555-0199;
//   3. a spreadsheet, or a CSV outside seed/ and fixtures/ (the same rule as .gitignore, which
//      `git add -f` can bypass);
//   4. a document or archive (PDF, Word, zip...): the scan can't read inside one, and an export could be there.
// It reads the last commit from git, not the files on disk, so a run on a laptop gives GitHub's answer even when
// the working copy holds something else (a local build, an edit not committed yet). Files that differ from the
// commit are scanned too and reported as "not committed yet" warnings: fix them before committing.
// UTF-16 text (Excel's "Unicode Text") is read, not skipped as binary.
// It can't recognize a real name, so it's a backstop for reviewers, not a replacement.
//
// Run from anywhere in the repo: node scripts/check-no-real-data.mjs   (tested by scripts/test-check-no-real-data.mjs)

import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Public addresses that are not people: AAFE's published gala inbox (in its own Give Lively form)
// and Resend's documented test sender.
const ALLOWED_EMAILS = new Set(['gala@aafe.org', 'onboarding@resend.dev'])
const DEMO_DOMAIN = /(^|\.)example\.(org|com|net)$|\.(test|example|invalid)$/

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
const PHONE = /(?:\(\d{3}\)\s?|\b\d{3}[-.\s])(\d{3})[-.\s](\d{4})\b/g
const SPREADSHEET = /\.(xlsx|xlsm|xlsb|xltx|xls|numbers|ods)$/i
const DOCUMENT = /\.(pdf|docx?|rtf|odt|pages|pptx?|key|zip|7z|rar|gz|tgz)$/i
const CSV = /\.(csv|tsv)$/i
const CSV_ALLOWED = /(^|\/)(seed|fixtures)\//

/** The file as text, or null when it's binary. UTF-16 (with or without a byte-order mark) is text full of zero bytes. */
function asText(buf) {
  if (!buf.includes(0)) return buf.toString('utf8')
  const even = (b) => b.subarray(0, b.length - (b.length % 2))
  const strip = (s) => s.replace(/^﻿/, '')   // the byte-order mark isn't content
  if (buf[0] === 0xff && buf[1] === 0xfe) return strip(buf.toString('utf16le'))
  if (buf[0] === 0xfe && buf[1] === 0xff) return strip(Buffer.from(even(buf)).swap16().toString('utf16le'))
  const head = buf.subarray(0, 512)
  let zeroOdd = 0, zeroEven = 0
  for (let i = 0; i < head.length; i++) if (head[i] === 0) i % 2 ? zeroOdd++ : zeroEven++
  if (zeroEven === 0 && zeroOdd > head.length / 4) return buf.toString('utf16le')
  if (zeroOdd === 0 && zeroEven > head.length / 4) return Buffer.from(even(buf)).swap16().toString('utf16le')
  return null
}
// The decoder checks itself on every run: an export saved as UTF-16 must be read, a PNG must not.
{
  const t = 'jane@example.org\n', le = Buffer.from(t, 'utf16le')
  if (asText(Buffer.concat([Buffer.from([0xff, 0xfe]), le])) !== t || asText(le) !== t || asText(Buffer.from(le).swap16()) !== t
      || asText(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0])) !== null) {
    console.error('check-no-real-data.mjs: the UTF-16 reader failed its self-check'); process.exit(1)
  }
}

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const git = (args, input) => execFileSync('git', args, { cwd: root, input, maxBuffer: 1 << 30 })
const names = (out) => out.toString('utf8').split('\0').filter(Boolean)

/** Every committed file's content, read from git in one `git cat-file --batch` call. */
function readCommitted() {
  const paths = names(git(['ls-tree', '-r', '-z', '--name-only', 'HEAD']))
  const out = git(['cat-file', '--batch'], paths.map((p) => `HEAD:${p}`).join('\n') + '\n')
  const files = new Map()
  let at = 0
  for (const p of paths) {
    const nl = out.indexOf(0x0a, at)
    const header = out.subarray(at, nl).toString('utf8')   // "<sha> <type> <size>", or "HEAD:<path> missing"
    at = nl + 1
    if (header.endsWith(' missing')) continue
    const [, type, size] = header.split(' ')
    if (type === 'blob') files.set(p, out.subarray(at, at + Number(size)))   // submodules aren't files to read
    at += Number(size) + 1
  }
  return files
}

/** What's wrong in one file (its name, then its text). */
function check(file, buf) {
  if (SPREADSHEET.test(file)) return [`${file}: spreadsheet files can't be committed`]
  if (CSV.test(file) && !CSV_ALLOWED.test(file)) return [`${file}: CSV files belong under seed/ or fixtures/ only`]
  if (DOCUMENT.test(file)) return [`${file}: documents and archives can't be committed (the scan can't read inside them)`]
  const text = asText(buf)
  if (text === null) return [] // binary (images, fonts)
  const found = []
  text.split('\n').forEach((line, i) => {
    for (const [email] of line.matchAll(EMAIL)) {
      const address = email.toLowerCase()
      const domain = address.slice(address.lastIndexOf('@') + 1)
      if (!DEMO_DOMAIN.test(domain) && !ALLOWED_EMAILS.has(address)) {
        found.push(`${file}:${i + 1}: email ${email} is not on a demo domain (use name@example.org)`)
      }
    }
    for (const [phone, exchange, number] of line.matchAll(PHONE)) {
      if (exchange !== '555' || !/^01\d\d$/.test(number)) {
        found.push(`${file}:${i + 1}: phone ${phone.trim()} is outside the fictional range 555-0100 to 555-0199`)
      }
    }
  })
  return found
}

// The commit decides the result, as on GitHub. (A repository with no commit yet has only files on disk.)
const hasHead = spawnSync('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd: root }).status === 0
const committed = hasHead ? readCommitted() : new Map()
const problems = [...committed].flatMap(([file, buf]) => check(file, buf))

// On Nov 6, 2026 the history was rewritten to take client staff names out of the docs. A copy cloned before then still
// holds the old commits, and this one (the old version of the first rewritten commit) is in every one of them, never in
// the new history, so a branch built on an old copy fails here instead of bringing the names back. (GitHub's check
// needs the full history to see it: fetch-depth 0 in .github/workflows/real-data.yml.)
const OLD_HISTORY = 'c3afd863d0f4ace2057a0d11df9448b10c23c691'
if (hasHead && spawnSync('git', ['merge-base', '--is-ancestor', OLD_HISTORY, 'HEAD'], { cwd: root }).status === 0) {
  problems.push("this commit is built on the repository's history from before Nov 6, 2026, which was rewritten to remove client names. Clone the repository again and redo the change there; don't merge an old copy")
}

// Files on disk that differ from the commit (edited, added, or rebuilt locally): warnings, since GitHub doesn't see
// them until they're committed. Only what the commit doesn't already have is listed; line numbers may differ.
const withoutLine = (p) => p.replace(/:\d+: /, ': ')
const known = new Set(problems.map(withoutLine))
const notYet = []
for (const file of names(hasHead ? git(['diff', '--name-only', '-z', 'HEAD']) : git(['ls-files', '-z']))) {
  let buf
  try { buf = readFileSync(join(root, file)) } catch { continue } // deleted on disk: nothing new to commit
  for (const p of check(file, buf)) if (!known.has(withoutLine(p))) notYet.push(p)
}
if (notYet.length) {
  console.warn(`Not committed yet: ${notYet.length} place${notYet.length === 1 ? '' : 's'} in files that differ from your last commit.`)
  console.warn("GitHub doesn't see these until they're committed. Fix them before you commit:\n")
  for (const p of notYet) console.warn(`  ${p}`)
  console.warn('')
}

if (problems.length) {
  console.error(`Possible real data in ${problems.length} place${problems.length === 1 ? '' : 's'}:\n`)
  for (const p of problems) console.error(`  ${p}`)
  console.error('\nDemo data must be invented (CLAUDE.md, hard rule 1). If a match is not personal data, add it to')
  console.error('ALLOWED_EMAILS in scripts/check-no-real-data.mjs in the same pull request, so a reviewer sees it.')
  process.exit(1)
}
console.log(`No real-data patterns in ${committed.size} committed files${notYet.length ? ' (your uncommitted changes have the warnings above)' : ''}.`)
