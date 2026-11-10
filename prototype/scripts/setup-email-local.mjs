// npm run email:local -- <your Resend sign-in email> [--replace]
// Your own email settings for testing send-emails on your laptop, with your own free Resend account, so the hosted
// project keeps its own. First sign in once:  npx resend-cli@2.26.0 login
// It makes a sending-only key on your account, writes it with the other settings to supabase/functions/.env (git
// ignores it; the key is never printed), and sends one test email to you. --replace swaps an earlier key for a new
// one and deletes the old one. Without a verified domain Resend delivers only to its account owner, so every email is
// redirected to you (EMAIL_REDIRECT_TO). How to run send-emails locally: docs/BACKEND.md, "Test emails on your laptop".
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const RESEND = ['-y', 'resend-cli@2.26.0']   // pinned: the commands below are this version's
const FILE = fileURLToPath(new URL('../supabase/functions/.env', import.meta.url))
const PROTO = fileURLToPath(new URL('..', import.meta.url))
const stop = (why) => { console.error(`Stopped: ${why}`); process.exit(1) }
// npx run by Node itself, with no shell, the same on every OS: a shell would read the "<" and ">" in a sender
// address as redirection. npm run sets npm_execpath to npm's own script, and npx's sits beside it.
if (!process.env.npm_execpath) stop('run it through npm:  npm run email:local -- you@example.org')
const NPX = path.join(path.dirname(process.env.npm_execpath), 'npx-cli.js')
/** One Resend CLI call, answered in JSON; a key, when given, goes in the environment, never on the command line. */
function resend(args, key) {
  try {
    const out = execFileSync(process.execPath, [NPX, ...RESEND, ...args, '--json'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: key ? { ...process.env, RESEND_API_KEY: key } : process.env })
    return JSON.parse(out)
  } catch (e) {
    const text = `${e.stdout ?? ''}${e.stderr ?? ''}`
    const msg = text.match(/"message"\s*:\s*"([^"]+)"/)?.[1] ?? text.trim().split('\n').pop()
    throw new Error(msg || e.message)
  }
}

const args = process.argv.slice(2)
const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase()
const replace = args.includes('--replace')
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  stop('give the email you signed up to Resend with:  npm run email:local -- you@example.org')
}

// The file must stay out of git: it holds your key.
try { execFileSync('git', ['check-ignore', '-q', FILE], { cwd: PROTO }) } catch { stop(`${FILE} isn't ignored by git, so the key could be committed. Nothing was changed.`) }
let who
try { who = resend(['whoami']) } catch (e) { who = { authenticated: false, error: e.message } }
if (!who.authenticated) stop('not signed in to Resend. Run  npx resend-cli@2.26.0 login  (choose the browser login), then run this again.')

const old = existsSync(FILE) ? readFileSync(FILE, 'utf8') : ''
if (old && !replace) stop(`${FILE} already exists. Run again with --replace to swap in a new key (the old one is deleted).`)

const name = `aafe-gala-local-${email.split('@')[0].replace(/[^a-z0-9]+/g, '-')}`
const created = resend(['api-keys', 'create', '--name', name, '--permission', 'sending_access'])
if (!created.token) stop('Resend made no key. Nothing was written.')
console.log(`1/3 Sending-only key "${name}" made on your Resend account (not shown).`)

writeFileSync(FILE, [
  '# Your own settings for testing send-emails on this laptop (npm run email:local). Git ignores this file:',
  '# never commit it or paste the key anywhere. Delete the key in Resend when you no longer need it.',
  `# Resend key id: ${created.id}`,
  `RESEND_API_KEY=${created.token}`,
  'EMAIL_FROM="AAFE Gala Local <onboarding@resend.dev>"',
  `EMAIL_REDIRECT_TO=${email}`,
  'GUEST_PORTAL_URL=http://localhost:5173/',
  `CRON_SECRET=${randomBytes(24).toString('hex')}`,
  `LINK_TOKEN_SECRET=${randomBytes(32).toString('hex')}`,
  '',
].join('\n'))
console.log(`2/3 Settings written to ${FILE}.`)

// Swapped: the old key stops working only once the new one is in place.
const oldId = old.match(/^# Resend key id: (\S+)$/m)?.[1]
if (oldId && oldId !== created.id) {
  try { resend(['api-keys', 'delete', oldId, '--yes']); console.log(`    Your earlier key (${oldId}) is deleted.`) } catch (e) { console.log(`    Couldn't delete your earlier key ${oldId} (${e.message}); delete it at resend.com/api-keys.`) }
}

try {
  const sent = resend(['emails', 'send', '--from', 'AAFE Gala Local <onboarding@resend.dev>', '--to', email,
    '--subject', 'AAFE Gala: your local email test (synthetic)',
    '--text', 'Your laptop can send the AAFE Gala prototype\'s emails with your own Resend key. Every email will come to this inbox.'], created.token)
  console.log(`3/3 Test email sent to ${email} with your new key (id ${sent.id}). Check your inbox.`)
} catch (e) {
  stop(`the test email didn't send: ${e.message}\n  Without a verified domain Resend only delivers to the email you signed up with. If that isn't ${email}, run again with --replace and that email.`)
}
console.log('Done. To run send-emails on this laptop: docs/BACKEND.md, "Test emails on your laptop".')
