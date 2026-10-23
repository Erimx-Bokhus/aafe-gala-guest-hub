// @vitest-environment jsdom
// Staff sign-in helpers (issue #8): demo mode without settings, and the live calls to Supabase Auth.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  auth: { signInWithOtp: vi.fn(), verifyOtp: vi.fn(), getSession: vi.fn(), signOut: vi.fn() },
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

  it('emails a one-time link back to this page, and may make a first login (the database decides who)', async () => {
    const s = await load(true)
    m.auth.signInWithOtp.mockResolvedValue({ error: null })
    await s.sendSignInLink('  mei.ortiz@aafe-demo.example.org ')
    expect(m.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'mei.ortiz@aafe-demo.example.org',
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + window.location.pathname },
    })
  })

  it('signs in with the 6-digit code from the same email', async () => {
    const s = await load(true)
    m.auth.verifyOtp.mockResolvedValue({ error: null })
    await s.verifySignInCode(' mei.ortiz@aafe-demo.example.org ', '123 456')
    expect(m.auth.verifyOtp).toHaveBeenCalledWith({ email: 'mei.ortiz@aafe-demo.example.org', token: '123456', type: 'email' })
    m.auth.verifyOtp.mockResolvedValue({ error: new Error('Token has expired or is invalid') })
    await expect(s.verifySignInCode('mei.ortiz@aafe-demo.example.org', '000000')).rejects.toThrow()
  })

  it('signs in from an admin-made link, then takes the token out of the address', async () => {
    const s = await load(true)
    m.auth.verifyOtp.mockResolvedValue({ error: null })
    window.history.replaceState(null, '', '/?token_hash=abc123&type=magiclink#/checkin')
    await expect(s.signInFromLink()).resolves.toBe(true)
    expect(m.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'magiclink' })
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('#/checkin')
  })

  it('does nothing without a link token, and nothing in demo mode', async () => {
    window.history.replaceState(null, '', '/#/')
    const s = await load(true)
    await expect(s.signInFromLink()).resolves.toBe(false)
    expect(m.auth.verifyOtp).not.toHaveBeenCalled()
    const d = await load(false)
    await expect(d.signInFromLink()).resolves.toBe(false)
    await expect(d.verifySignInCode('a@example.org', '123456')).rejects.toThrow('not_configured')
  })

  it('words a sending failure: "wait a minute" only for too many requests, the same words otherwise', async () => {
    const s = await load(true)
    const wait = 'Too many sign-in emails for now. Wait a minute, then ask for a new code.'
    expect(s.sendFailure(Object.assign(new Error('For security purposes, you can only request this after 41 seconds.'), { status: 429 }))).toBe(wait)
    expect(s.sendFailure({ message: 'Email rate limit exceeded', status: 429 })).toBe(wait)
    const same = 'We couldn’t send a sign-in email. Check the internet connection and the email address; if both are right, ask the gala admin to invite you.'
    expect(s.sendFailure(new Error('Signups not allowed for otp'))).toBe(same)   // a stranger and a typo read the same
    expect(s.sendFailure(new TypeError('Failed to fetch'))).toBe(same)
    expect(s.sendFailure('weird')).toBe(same)
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

  it('stops the sign-in on a staff record it cannot trust: an unknown role or a field that is not text (coding standard R9)', async () => {
    const s = await load(true)
    m.auth.getSession.mockResolvedValue({ data: { session: { access_token: 't' } } })
    const me = { id: 'st-1', name: 'Mei Lin Ortiz', email: 'mei.ortiz@aafe-demo.example.org', role: 'gala_admin' }
    for (const bad of [{ ...me, role: 'superuser' }, { ...me, role: undefined }, { ...me, email: 42 }, 'gala_admin']) {
      m.rpc.mockResolvedValue({ data: bad, error: null })
      await expect(s.currentStaff()).rejects.toThrow(/staff_me returned an unexpected/)
    }
    expect(s.asStaffUser({ ...me, extra: 'ignored' })).toEqual(me)
  })

  it('signs in from a link only with a type Supabase knows; anything else is treated as a magic link', async () => {
    const s = await load(true)
    m.auth.verifyOtp.mockResolvedValue({ error: null })
    window.history.replaceState(null, '', '/?token_hash=abc123&type=not-a-real-type#/')
    await expect(s.signInFromLink()).resolves.toBe(true)
    expect(m.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'magiclink' })
  })

  it('signs out of Supabase', async () => {
    const s = await load(true)
    await s.signOut()
    expect(m.auth.signOut).toHaveBeenCalledOnce()
  })

  it('signs out once when two checks ask at the same moment, and again later', async () => {
    const s = await load(true)
    let end = () => {}
    m.auth.signOut.mockImplementationOnce(() => new Promise<void>((r) => { end = r }))
    const both = Promise.all([s.signOut(), s.signOut()])
    expect(m.auth.signOut).toHaveBeenCalledOnce()   // the second call waits on the first: no second logout to answer 403
    end(); await both
    await s.signOut()
    expect(m.auth.signOut).toHaveBeenCalledTimes(2)
  })
})
