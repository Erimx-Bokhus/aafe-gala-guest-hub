// @vitest-environment jsdom
// Staff sign-in helpers (issue #8): demo mode without settings, and the live calls to Supabase Auth.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  auth: { signInWithOtp: vi.fn(), getSession: vi.fn(), signOut: vi.fn() },
  rpc: vi.fn(),
  createClient: vi.fn(),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: m.createClient }))

async function load(live: boolean) {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', live ? 'https://abcdefghijklmnop.supabase.co' : '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', live ? 'test-anon-key' : '')
  return import('./supabase')
}

beforeEach(() => {
  vi.clearAllMocks()
  m.createClient.mockReturnValue({ auth: m.auth, rpc: m.rpc })
})
afterEach(() => vi.unstubAllEnvs())

describe('demo mode (no Supabase settings)', () => {
  it('creates no client and signs nobody in', async () => {
    const s = await load(false)
    expect(s.supabase).toBeNull()
    expect(m.createClient).not.toHaveBeenCalled()
    await expect(s.sendSignInLink('mei@example.org')).rejects.toThrow('not_configured')
    await expect(s.currentStaff()).resolves.toBeNull()
    await expect(s.signOut()).resolves.toBeUndefined()
  })
})

describe('live mode', () => {
  it('uses PKCE and keeps the session across reloads', async () => {
    await load(true)
    expect(m.createClient).toHaveBeenCalledWith('https://abcdefghijklmnop.supabase.co', 'test-anon-key',
      { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } })
  })

  it('emails a one-time link to invited staff only, back to this page', async () => {
    const s = await load(true)
    m.auth.signInWithOtp.mockResolvedValue({ error: null })
    await s.sendSignInLink('  mei.ortiz@aafe-demo.example.org ')
    expect(m.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'mei.ortiz@aafe-demo.example.org',
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + window.location.pathname },
    })
  })

  it('passes a sending error up to the login page', async () => {
    const s = await load(true)
    m.auth.signInWithOtp.mockResolvedValue({ error: new Error('Signups not allowed for otp') })
    await expect(s.sendSignInLink('stranger@example.org')).rejects.toThrow()
  })

  it('reports nobody signed in without asking the database', async () => {
    const s = await load(true)
    m.auth.getSession.mockResolvedValue({ data: { session: null } })
    await expect(s.currentStaff()).resolves.toBeNull()
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('takes the name and role from staff_users through staff_me()', async () => {
    const s = await load(true)
    const me = { id: 'st-1', name: 'Mei Lin Ortiz', email: 'mei.ortiz@aafe-demo.example.org', role: 'gala_admin' }
    m.auth.getSession.mockResolvedValue({ data: { session: { access_token: 't' } } })
    m.rpc.mockResolvedValue({ data: me, error: null })
    await expect(s.currentStaff()).resolves.toEqual(me)
    expect(m.rpc).toHaveBeenCalledWith('staff_me')
  })

  it('returns null for a signed-in email that is not on the staff list', async () => {
    const s = await load(true)
    m.auth.getSession.mockResolvedValue({ data: { session: { access_token: 't' } } })
    m.rpc.mockResolvedValue({ data: null, error: null })
    await expect(s.currentStaff()).resolves.toBeNull()
  })

  it('throws when the staff lookup fails, instead of guessing a role', async () => {
    const s = await load(true)
    m.auth.getSession.mockResolvedValue({ data: { session: { access_token: 't' } } })
    m.rpc.mockResolvedValue({ data: null, error: new Error('network') })
    await expect(s.currentStaff()).rejects.toThrow('network')
  })

  it('signs out of Supabase', async () => {
    const s = await load(true)
    await s.signOut()
    expect(m.auth.signOut).toHaveBeenCalledOnce()
  })
})
