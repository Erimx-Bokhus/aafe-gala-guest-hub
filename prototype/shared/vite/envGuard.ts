// Build-time guard: secret keys must never reach the browser.
// Vite copies every VITE_* variable into the built JavaScript, so anyone who opens the app can read it.
// The Supabase URL and the anon / publishable key are public by design (access rules protect the data);
// the service_role / secret key bypasses every access rule and must stay in Supabase's Edge Function
// secrets. This stops the build if a VITE_* variable holds one. See docs/keys-and-secrets.md.
// It also stops a build whose "Nightly · test copy" label doesn't match its Supabase project (Cornell's #256 review).
import type { Plugin } from 'vite'

const SECRET_NAME = /SERVICE_ROLE|SECRET|PRIVATE|PASSWORD/i
const BROWSER_SAFE_ROLES = new Set(['anon', 'authenticated'])
// The nightly project's ref (prototype/docs/BACKEND.md). Project refs are public: every build carries its URL.
const NIGHTLY_REF = 'tykckkoxuudvwdosturh'

/** The JWT payload's `role`, or null when the value isn't a decodable JWT. */
function jwtRole(value: string): string | null {
  const parts = value.split('.')
  if (parts.length !== 3 || !parts[0].startsWith('eyJ')) return null
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const role = (JSON.parse(json) as { role?: unknown }).role
    return typeof role === 'string' ? role : null
  } catch {
    return null
  }
}

/** Every reason the browser-bound (VITE_*) variables are unsafe. Empty means safe to build. */
export function browserEnvProblems(env: Record<string, string | undefined>): string[] {
  const problems: string[] = []
  for (const [name, raw] of Object.entries(env)) {
    if (!name.startsWith('VITE_')) continue
    const value = (raw ?? '').trim()
    if (SECRET_NAME.test(name)) problems.push(`${name}: the name says it's a secret, and VITE_ variables are readable by anyone in the browser`)
    if (value.startsWith('sb_secret_')) problems.push(`${name}: holds a Supabase secret key (sb_secret_…); use the publishable key instead`)
    const role = jwtRole(value)
    if (role && !BROWSER_SAFE_ROLES.has(role)) problems.push(`${name}: holds a Supabase key with role "${role}"; only the anon key belongs in the browser`)
  }
  return problems
}

/** Why the nightly label doesn't match the Supabase project, or null when it does. Forgetting the label made
 *  nightly look like stable; setting it on any other build would tell AAFE their copy is a test copy. */
export function appLineProblem(env: Record<string, string | undefined>): string | null {
  const onNightly = (env.VITE_SUPABASE_URL ?? '').includes(`${NIGHTLY_REF}.supabase.co`)
  const labelled = (env.VITE_APP_LINE ?? '').trim().toLowerCase() === 'nightly'
  if (onNightly && !labelled) return 'VITE_SUPABASE_URL is the nightly project but VITE_APP_LINE=nightly is missing, so nightly would look like stable'
  if (labelled && !onNightly) return 'VITE_APP_LINE=nightly but VITE_SUPABASE_URL is not the nightly project, so this copy would wrongly say "Nightly · test copy"'
  return null
}

/** Vite plugin: fails the build (and the dev server) when browserEnvProblems or appLineProblem finds anything. */
export function browserEnvGuard(): Plugin {
  return {
    name: 'aafe-browser-env-guard',
    configResolved(config) {
      const env = config.env as Record<string, string>
      const problems = browserEnvProblems(env)
      if (problems.length) {
        throw new Error(`Refusing to build: a secret would be shipped to the browser.\n- ${problems.join('\n- ')}\n` +
          'Remove it from the .env.local file. Secret keys belong in Supabase Edge Function secrets (docs/keys-and-secrets.md).')
      }
      const line = appLineProblem(env)
      if (line) throw new Error(`Refusing to build: ${line}.\nFix the .env.local file (both projects are listed in prototype/docs/BACKEND.md).`)
    },
  }
}
