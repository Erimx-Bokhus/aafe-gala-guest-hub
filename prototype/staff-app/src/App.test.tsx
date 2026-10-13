// @vitest-environment jsdom
// Session handling in the staff app: who gets in after the emailed link, and who is signed straight back out.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { StaffUser } from '@shared/types'
import { loadDB } from '@shared/data'

const unsubscribe = vi.fn()
const signOut = vi.fn()
// After sign-in a volunteer loads only the door list (issue #9); managers would read the tables.
const rpc = vi.fn(async (fn: string) => {
  const { demoSnapshot } = await vi.importActual<typeof import('./api')>('./api')
  return fn === 'staff_checkin_snapshot' ? { data: demoSnapshot(loadDB()), error: null } : { data: null, error: { message: 'not mocked' } }
})
const tableRead = vi.fn()
let authEvent: (event: string) => void = () => {}

async function renderApp(opts: { session: boolean; staff: StaffUser | null }) {
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
    currentStaff: vi.fn(async () => (opts.staff ? { ...opts.staff } : null)),
    signOut,
    sendSignInLink: vi.fn(),
  }))
  const { default: App } = await import('./App')
  return render(<App />)
}

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
    expect(rpc).toHaveBeenCalledWith('staff_checkin_snapshot')
    expect(tableRead).not.toHaveBeenCalled()
  })

  it("doesn't reload the gala when Supabase says \"signed in\" again for the same person (e.g. the tab regains focus)", async () => {
    await renderApp({ session: true, staff: { id: 'st-9', name: 'Kenji Abe', email: 'kenji.abe@aafe-demo.example.org', role: 'check_in_volunteer' } as StaffUser })
    expect(await screen.findByText('Kenji Abe')).toBeTruthy()
    const loads = rpc.mock.calls.filter(([fn]) => fn === 'staff_checkin_snapshot').length
    authEvent('SIGNED_IN')
    await new Promise((r) => setTimeout(r, 50))
    expect(rpc.mock.calls.filter(([fn]) => fn === 'staff_checkin_snapshot').length).toBe(loads)
    expect(screen.queryByText('Loading the gala…')).toBeNull()
  })

  it('stops listening for sign-in changes when the app closes', async () => {
    const { unmount } = await renderApp({ session: false, staff: null })
    await screen.findByRole('button', { name: /Email me a sign-in code/ })
    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
