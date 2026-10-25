import { describe, expect, it } from 'vitest'
import { appLineProblem, browserEnvGuard, browserEnvProblems } from './envGuard'

// Fake keys are built at run time so no key-shaped string is committed (the secret scan would flag it).
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const fakeJwt = (role: string) => [b64({ alg: 'HS256', typ: 'JWT' }), b64({ iss: 'supabase', role }), 'signature'].join('.')
const fakeSecret = ['sb', 'secret', 'x'.repeat(32)].join('_')
const fakePublishable = ['sb', 'publishable', 'x'.repeat(32)].join('_')

describe('browserEnvProblems', () => {
  it('allows the public settings: project URL, anon key, publishable key', () => {
    expect(browserEnvProblems({
      VITE_SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co',
      VITE_SUPABASE_ANON_KEY: fakeJwt('anon'),
      VITE_PUBLISHABLE: fakePublishable,
      VITE_GUEST_PORTAL_URL: 'https://portal.example.org',
    })).toEqual([])
  })

  it('blocks a service_role key, whatever the variable is called', () => {
    const problems = browserEnvProblems({ VITE_SUPABASE_ANON_KEY: fakeJwt('service_role') })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('service_role')
  })

  it('blocks a new-style secret key', () => {
    expect(browserEnvProblems({ VITE_SUPABASE_ANON_KEY: fakeSecret })[0]).toContain('sb_secret_')
  })

  it('blocks browser variables whose names say they are secrets', () => {
    for (const name of ['VITE_SUPABASE_SERVICE_ROLE_KEY', 'VITE_RESEND_SECRET', 'VITE_DB_PASSWORD', 'VITE_PRIVATE_TOKEN']) {
      expect(browserEnvProblems({ [name]: 'anything' }), name).toHaveLength(1)
    }
  })

  it('ignores server-only variables, which never reach the browser', () => {
    expect(browserEnvProblems({ SUPABASE_SERVICE_ROLE_KEY: fakeJwt('service_role'), RESEND_API_KEY: fakeSecret })).toEqual([])
  })

  it('does not trip on values that only look like a JWT', () => {
    expect(browserEnvProblems({ VITE_NOTE: 'eyJ.not-base64.json', VITE_EMPTY: '', VITE_UNSET: undefined })).toEqual([])
  })
})

describe('browserEnvGuard plugin', () => {
  const run = (env: Record<string, string>) => () =>
    (browserEnvGuard().configResolved as (c: { env: Record<string, string> }) => void)({ env })

  it('lets a safe build through', () => {
    expect(run({ VITE_SUPABASE_ANON_KEY: fakeJwt('anon') })).not.toThrow()
  })

  it('stops the build with instructions when a secret would ship', () => {
    expect(run({ VITE_SUPABASE_ANON_KEY: fakeJwt('service_role') })).toThrow(/Refusing to build[\s\S]*keys-and-secrets/)
  })
})

// Oct 25, Cornell's #256 review: forgetting VITE_APP_LINE=nightly made nightly silently look like stable again.
describe('the nightly label check', () => {
  const nightly = 'https://tykckkoxuudvwdosturh.supabase.co', stable = 'https://abmlzjwnwpkypubpzcsn.supabase.co'
  const run = (env: Record<string, string>) => () =>
    (browserEnvGuard().configResolved as (c: { env: Record<string, string> }) => void)({ env })

  it('lets nightly with its label, and stable and demo builds without one, through', () => {
    expect(appLineProblem({ VITE_SUPABASE_URL: nightly, VITE_APP_LINE: 'Nightly ' })).toBeNull()
    expect(appLineProblem({ VITE_SUPABASE_URL: stable })).toBeNull()
    expect(appLineProblem({})).toBeNull()
  })

  it('stops a nightly build that forgot its label', () => {
    expect(run({ VITE_SUPABASE_URL: nightly })).toThrow(/Refusing to build: VITE_SUPABASE_URL is the nightly project/)
  })

  it('stops any other build that would wrongly say nightly', () => {
    for (const url of [stable, '']) expect(run({ VITE_SUPABASE_URL: url, VITE_APP_LINE: 'nightly' })).toThrow(/not the nightly project/)
  })
})
