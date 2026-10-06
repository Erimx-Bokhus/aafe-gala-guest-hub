#!/usr/bin/env node
// Real-data guard (hard rule 1: no real donor data, ever). Fails if a tracked file contains
//   1. an email address outside the reserved demo domains (example.org/.com/.net and their
//      subdomains, .test, .example, .invalid) or the short list of public addresses below;
//   2. a US phone number outside the fictional range 555-0100 to 555-0199;
//   3. a spreadsheet, or a CSV outside seed/ and fixtures/ (the same rule as .gitignore, which
//      `git add -f` can bypass).
// It can't recognize a real name, so it's a backstop for reviewers, not a replacement.
//
// Run from anywhere in the repo: node scripts/check-no-real-data.mjs

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Public addresses that are not people: AAFE's published gala inbox (in its own Give Lively form)
// and Resend's documented test sender.
const ALLOWED_EMAILS = new Set(['gala@aafe.org', 'onboarding@resend.dev'])
const DEMO_DOMAIN = /(^|\.)example\.(org|com|net)$|\.(test|example|invalid)$/

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
const PHONE = /(?:\(\d{3}\)\s?|\b\d{3}[-.\s])(\d{3})[-.\s](\d{4})\b/g
const SPREADSHEET = /\.(xlsx|xlsm|xls|numbers|ods)$/i
const CSV = /\.(csv|tsv)$/i
const CSV_ALLOWED = /(^|\/)(seed|fixtures)\//

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean)

const problems = []
for (const file of files) {
  if (SPREADSHEET.test(file)) { problems.push(`${file}: spreadsheet files can't be committed`); continue }
  if (CSV.test(file) && !CSV_ALLOWED.test(file)) { problems.push(`${file}: CSV files belong under seed/ or fixtures/ only`); continue }

  let buf
  try { buf = readFileSync(join(root, file)) } catch { continue } // deleted in the working tree
  if (buf.includes(0)) continue // binary (images, fonts)
  const lines = buf.toString('utf8').split('\n')

  lines.forEach((line, i) => {
    for (const [email] of line.matchAll(EMAIL)) {
      const address = email.toLowerCase()
      const domain = address.slice(address.lastIndexOf('@') + 1)
      if (!DEMO_DOMAIN.test(domain) && !ALLOWED_EMAILS.has(address)) {
        problems.push(`${file}:${i + 1}: email ${email} is not on a demo domain (use name@example.org)`)
      }
    }
    for (const [phone, exchange, number] of line.matchAll(PHONE)) {
      if (exchange !== '555' || !/^01\d\d$/.test(number)) {
        problems.push(`${file}:${i + 1}: phone ${phone.trim()} is outside the fictional range 555-0100 to 555-0199`)
      }
    }
  })
}

if (problems.length) {
  console.error(`Possible real data in ${problems.length} place${problems.length === 1 ? '' : 's'}:\n`)
  for (const p of problems) console.error(`  ${p}`)
  console.error('\nDemo data must be invented (CLAUDE.md, hard rule 1). If a match is not personal data, add it to')
  console.error('ALLOWED_EMAILS in scripts/check-no-real-data.mjs in the same pull request, so a reviewer sees it.')
  process.exit(1)
}
console.log(`No real-data patterns in ${files.length} tracked files.`)
