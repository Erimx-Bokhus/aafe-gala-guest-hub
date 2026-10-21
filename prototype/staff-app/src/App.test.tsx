// @vitest-environment jsdom
// Session handling in the staff app: who gets in after the emailed link, and who is signed straight back out.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { StaffUser } from '@shared/types'
import { loadDB } from '@shared/data'

const unsubscribe = vi.fn()
const signOut = vi.fn()
// After sign-in a volunteer loads only the door list (issue #9); managers would read the tables.
const rpc = vi.fn(async (fn: string): Promise<{ data: unknown; error: { message: string } | null }> => {
  const { demoSnapshot } = await vi.importActual<typeof import('./api')>('./api')
  const s = demoSnapshot(loadDB())   // door_sync() with no cursor: the whole list
  return fn === 'door_sync' ? { data: { ...s, cursor: '1', full: true, removed: [], count: s.guests.length }, error: null } : { data: null, error: { message: 'not mocked' } }
})
const tableRead = vi.fn()
let authEvent: (event: string) => void = () => {}

async function renderApp(opts: { session: boolean; staff: StaffUser | null; staffError?: Error }) {
  vi.resetModules()
  vi.doMock('@shared/supabase', () => ({
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: opts.session ? { access_token: 't' } : null } }),
        onAuthStateChange: vi.fn((cb: (event: string) => void) => { authEvent = cb; return { data: { subscription: { unsubscribe } } } }),
      },
      rpc,
      from: tableRead,
    },
    signInFromLink: vi.fn().mockResolvedValue(false),   // no admin-made link in the address
    // A fresh object on every call, as Supabase gives: the app must key on who it is, not on the object.
    currentStaff: vi.fn(async () => { if (opts.staffError) throw opts.staffError; return opts.staff ? { ...opts.staff } : null }),
    signOut,
    sendSignInLink: vi.fn(),
  }))
  const { default: App } = await import('./App')
  return render(<App />)
}

// The first import of the whole staff app takes 1 to 4.3 s while other test files run alongside (12 timed runs, Oct 17),
// later ones about 0.1 s. Inside the first test it once passed the 5-second limit, and that test's late render then
// signed out during the next one. Done once here, with its own time, every test gets the fast import.
beforeAll(async () => {
  vi.doMock('@shared/supabase', () => ({ supabase: null }))
  await import('./App')
  vi.doUnmock('@shared/supabase')
}, 30_000)
afterEach(() => { cleanup(); signOut.mockReset(); rpc.mockClear(); tableRead.mockReset(); unsubscribe.mockReset(); vi.doUnmock('@shared/supabase'); history.replaceState(null, '', '/') })

describe('staff app session (live mode)', () => {
  it('signs out a session whose email is not on the staff list, and says why', async () => {
    await renderApp({ session: true, staff: null })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('isn’t on the AAFE staff list')
    expect(signOut).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: /Email me a sign-in code/ })).toBeTruthy()
  })

  it('shows the sign-in page, without signing anyone out, when nobody is signed in', async () => {
    await renderApp({ session: false, staff: null })
    expect(await screen.findByRole('button', { name: /Email me a sign-in code/ })).toBeTruthy()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('sends a check-in volunteer straight to check-in', async () => {
    await renderApp({ session: true, staff: { id: 'st-9', name: 'Kenji Abe', email: 'kenji.abe@aafe-demo.example.org', role: 'check_in_volunteer' } as StaffUser })
    await waitFor(() => expect(window.location.hash).toBe('#/checkin'))
    expect(await screen.findByText('Kenji Abe')).toBeTruthy()
    expect(rpc).toHaveBeenCalledWith('door_sync', { p_cursor: null, p_event: null })
    expect(tableRead).not.toHaveBeenCalled()
  })

  // Oct 19 click-through: reloading any page sent staff back to the dashboard.
  it('a reload keeps the page in the address when the role can open it', async () => {
    history.replaceState(null, '', '/#/guests')
    await renderApp({ session: true, staff: { id: 'st-1', name: 'Mei Lin Ortiz', email: 'mei.ortiz@aafe-demo.example.org', role: 'gala_admin' } as StaffUser })
    await waitFor(() => expect(screen.queryByText('Loading the gala…') ?? screen.queryByRole('alert')).toBeTruthy())   // signed in, loading
    await new Promise((r) => setTimeout(r, 20))
    expect(window.location.hash).toBe('#/guests')
  })

  it("a volunteer whose address is a managers' page still lands on check-in", async () => {
    history.replaceState(null, '', '/#/reports')
    await renderApp({ session: true, staff: { id: 'st-9', name: 'Kenji Abe', email: 'kenji.abe@aafe-demo.example.org', role: 'check_in_volunteer' } as StaffUser })
    await waitFor(() => expect(window.location.hash).toBe('#/checkin'))
  })

  // Oct 19 click-through: on a phone the open menu covered the header's Close button.
  it('on a phone the open menu has its own Close button', async () => {
    await renderApp({ session: true, staff: { id: 'st-9', name: 'Kenji Abe', email: 'kenji.abe@aafe-demo.example.org', role: 'check_in_volunteer' } as StaffUser })
    expect(await screen.findByText('Kenji Abe')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }))
    const navs = screen.getAllByRole('navigation', { name: 'Staff navigation' })
    expect(navs).toHaveLength(2)                                       // the side menu (hidden on phones by CSS) and the drawer
    fireEvent.click(within(navs[1].parentElement!).getByRole('button', { name: 'Close menu' }))
    expect(screen.getAllByRole('navigation', { name: 'Staff navigation' })).toHaveLength(1)
  })

  it("doesn't reload the gala when Supabase says \"signed in\" again for the same person (e.g. the tab regains focus)", async () => {
    await renderApp({ session: true, staff: { id: 'st-9', name: 'Kenji Abe', email: 'kenji.abe@aafe-demo.example.org', role: 'check_in_volunteer' } as StaffUser })
    expect(await screen.findByText('Kenji Abe')).toBeTruthy()
    const loads = rpc.mock.calls.filter(([fn]) => fn === 'door_sync').length
    authEvent('SIGNED_IN')
    await new Promise((r) => setTimeout(r, 50))
    expect(rpc.mock.calls.filter(([fn]) => fn === 'door_sync').length).toBe(loads)
    expect(screen.queryByText('Loading the gala…')).toBeNull()
  })

  it('stops listening for sign-in changes when the app closes', async () => {
    const { unmount } = await renderApp({ session: false, staff: null })
    await screen.findByRole('button', { name: /Email me a sign-in code/ })
    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})

// Gate 3: every failure staff can hit says what happened and what to do.
describe('staff app failures say what happened and what to do', () => {
  const KENJI = { id: 'st-9', name: 'Kenji Abe', email: 'kenji.abe@aafe-demo.example.org', role: 'check_in_volunteer' } as StaffUser

  it('a sign-in check that fails points to the connection first', async () => {
    await renderApp({ session: true, staff: null, staffError: new Error('TypeError: Failed to fetch') })
    expect((await screen.findByRole('alert')).textContent).toBe('Sign-in failed. Check the internet connection and try again, or ask the gala admin.')
  })

  it('says so plainly when no gala is open', async () => {
    rpc.mockImplementationOnce(async () => ({ data: null, error: null }))   // door_sync() with no open gala
    await renderApp({ session: true, staff: KENJI })
    expect((await screen.findByRole('alert')).textContent).toBe('No gala is open right now. Ask a gala admin to check the gala’s status.')
  })

  it('keeps the data on screen when a background refresh fails, and says it may be out of date', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    await renderApp({ session: true, staff: KENJI })
    expect(await screen.findByText('Kenji Abe')).toBeTruthy()
    expect(screen.queryByTestId('stale-data')).toBeNull()
    rpc.mockImplementationOnce(async () => ({ data: null, error: { message: 'TypeError: Failed to fetch' } }))
    const now = Date.now()
    const later = vi.spyOn(Date, 'now').mockReturnValue(now + 60_000)   // past the refresh's 5-second guard
    try {
      window.dispatchEvent(new Event('focus'))
      expect((await screen.findByTestId('stale-data')).textContent)
        .toBe('Couldn’t refresh: what you see may be out of date. Check the internet connection; the app keeps trying.')
      expect(screen.getByText('Kenji Abe')).toBeTruthy()   // the last good data stays
    } finally {
      later.mockRestore()
    }
  })
})
