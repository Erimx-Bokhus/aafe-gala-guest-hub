// Cloudflare Access in front of the three apps (docs/operations.md, "Who can open the apps"), through Cloudflare's API.
//   node scripts/cloudflare-access.mjs            shows the live setup and what --apply would change; changes nothing
//   node scripts/cloudflare-access.mjs --apply    makes those changes, then checks each address answers with Access's login
// Reads prototype/.env.admin.local (gitignored), so nobody's address is in git:
//   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
//   CLOUDFLARE_ACCESS_DOMAINS   who gets in by email domain, comma-separated (since Oct 19: aafe.org,pursuit.org)
//   CLOUDFLARE_ACCESS_EMAILS    anyone else, comma-separated
// --apply REPLACES the policy's whole list with those two settings: anyone added by hand in the dashboard and not listed
// there is removed, so the dry run names them first. Sessions: 720 hours on the policy, 730 on each app (about a month, so
// gala-night iPads aren't asked for a PIN every day). Safe to run again: it updates the policy and apps by name.
import { readFileSync } from 'node:fs'

const APPLY = process.argv.includes('--apply')
const env = Object.fromEntries(readFileSync(new URL('../.env.admin.local', import.meta.url), 'utf8').split(/\r?\n/)
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const TOKEN = env.CLOUDFLARE_API_TOKEN, ACCT = env.CLOUDFLARE_ACCOUNT_ID
if (!TOKEN || !ACCT) { console.error('Fill in CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in prototype/.env.admin.local first.'); process.exit(1) }
const list = (v) => (v ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
const DOMAINS = list(env.CLOUDFLARE_ACCESS_DOMAINS), EMAILS = list(env.CLOUDFLARE_ACCESS_EMAILS)
// A typo or a pasted placeholder ("<her two addresses>") would become a rule that matches nobody while --apply removes the
// real one, so anything that isn't a plain domain or address stops the script before it reads or changes anything.
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/
const bad = [...DOMAINS.filter((d) => !DOMAIN.test(d)).map((d) => `domain "${d}"`),
  ...EMAILS.filter((e) => !(e.split('@').length === 2 && /^[^\s<>()[\],;:"@]+$/.test(e.split('@')[0]) && DOMAIN.test(e.split('@')[1]))).map((e) => `address "${e}"`)]
if (bad.length) { console.error(`Stopped: not a plain domain or email address in .env.admin.local: ${bad.join(', ')}. Nothing was read or changed.`); process.exit(1) }

const POLICY = 'Team and AAFE reviewers'
const APPS = [['AAFE Gala staff app', 'aafe-gala-staff.pages.dev'], ['AAFE Gala sponsor portal', 'aafe-gala-portal.pages.dev'],
  ['AAFE Gala iPad check-in', 'aafe-gala-checkin.pages.dev']]

async function cf(method, apiPath, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}${apiPath}`, {
    method, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.success === false) throw new Error(`${method} ${apiPath}: ${r.status} ${(j.errors ?? []).map((e) => `${e.code} ${e.message}`).join('; ')}`)
  return j.result
}
const rule = (i) => (i.email_domain ? `@${i.email_domain.domain}` : i.email ? i.email.email : JSON.stringify(i)).toLowerCase()

// What is live now, and what this file would make it.
const policies = await cf('GET', '/access/policies')
let policy = policies.find((p) => p.name === POLICY)
const live = (policy?.include ?? []).map(rule)
const wanted = [...DOMAINS.map((d) => `@${d}`), ...EMAILS]
console.log(`Live policy "${POLICY}": ${live.length ? live.join(', ') : '(none)'}`)
console.log(`From .env.admin.local:   ${wanted.length ? wanted.join(', ') : '(nothing set)'}`)
const dropped = live.filter((x) => !wanted.includes(x)), added = wanted.filter((x) => !live.includes(x))
if (dropped.length) console.log(`--apply would REMOVE: ${dropped.join(', ')}`)
if (added.length) console.log(`--apply would add:    ${added.join(', ')}`)
if (!dropped.length && !added.length) console.log('The list already matches.')
// No process.exit() after a fetch: on Windows it can crash Node while sockets close. The script ends on its own.
if (!APPLY) console.log('\nNothing changed (add --apply to make the changes).')
else if (!wanted.length) { console.error('Stopped: CLOUDFLARE_ACCESS_DOMAINS and CLOUDFLARE_ACCESS_EMAILS are both empty, which would let nobody in.'); process.exitCode = 1 }
else await apply()

async function apply() {
  // 1. The One-time PIN login.
  const idps = await cf('GET', '/access/identity_providers')
  let otp = idps.find((i) => i.type === 'onetimepin')
  if (!otp) { otp = await cf('POST', '/access/identity_providers', { name: 'One-time PIN', type: 'onetimepin', config: {} }); console.log('added the One-time PIN login') }

  // 2. One reusable policy.
  const policyBody = { name: POLICY, decision: 'allow', session_duration: '720h',
    include: [...DOMAINS.map((domain) => ({ email_domain: { domain } })), ...EMAILS.map((email) => ({ email: { email } }))] }
  policy = policy ? await cf('PUT', `/access/policies/${policy.id}`, policyBody) : await cf('POST', '/access/policies', policyBody)
  console.log(`policy "${POLICY}": ${wanted.join(', ')}`)

  // 3. One self-hosted application per address, covering the address and its preview uploads, PIN only.
  const apps = await cf('GET', '/access/apps')
  for (const [name, host] of APPS) {
    const body = { name, type: 'self_hosted', destinations: [{ type: 'public', uri: host }, { type: 'public', uri: `*.${host}` }],
      session_duration: '730h', app_launcher_visible: false, allowed_idps: [otp.id], auto_redirect_to_identity: true,
      policies: [{ id: policy.id, precedence: 1 }] }
    const found = apps.find((a) => a.name === name)
    if (found) await cf('PUT', `/access/apps/${found.id}`, body)
    else await cf('POST', '/access/apps', body)
    console.log(`${found ? 'updated' : 'created'} application "${name}" for ${host} and *.${host}`)
  }

  // 4. The lock check: an address without a PIN should answer with a redirect to <team>.cloudflareaccess.com.
  await new Promise((r) => setTimeout(r, 5000))
  let all = true
  for (const [, host] of APPS) {
    const r = await fetch(`https://${host}/`, { redirect: 'manual' })
    const loc = r.headers.get('location') ?? ''
    const locked = r.status >= 300 && r.status < 400 && /cloudflareaccess\.com/.test(loc)
    all &&= locked
    console.log(`${locked ? 'LOCKED ' : 'OPEN?  '} ${host}  (${r.status}${loc ? ' → ' + new URL(loc).host : ''})`)
  }
  console.log(all ? '\nAll three are locked.' : '\nNot all locked yet: wait a minute and run it again; if one stays open, check its domain in Zero Trust.')
}
