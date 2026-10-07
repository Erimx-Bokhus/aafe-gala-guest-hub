// @vitest-environment jsdom
// Session handling in the staff app: who gets in after the emailed link, and who is signed straight back out.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import type { StaffUser } from '@shared/types'

const unsubscribe = vi.fn()
const signOut = vi.fn()

async function renderApp(opts: { session: boolean; staff: StaffUser | null }) {
  vi.resetModules()
  vi.doMock('./supabase', () => ({
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: opts.session ? { access_token: 't' } : null } }),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe } } })),
      },
    },
    currentStaff: vi.fn().mockResolvedValue(opts.staff),
    signOut,
    sendSignInLink: vi.fn(),
  }))
  const { default: App } = await import('./App')
  return render(<App />)
}

afterEach(() => { cleanup(); signOut.mockReset(); unsubscribe.mockReset(); vi.doUnmock('./supabase'); history.replaceState(null, '', '/') })

describe('staff app session (live mode)', () => {
  it('signs out a session whose email is not on the staff list, and says why', async () => {
    await renderApp({ session: true, staff: null })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('isn’t on the AAFE staff list')
    expect(signOut).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: /Email me a sign-in link/ })).toBeTruthy()
  })

  it('shows the sign-in page, without signing anyone out, when nobody is signed in', async () => {
    await renderApp({ session: false, staff: null })
    expect(await screen.findByRole('button', { name: /Email me a sign-in link/ })).toBeTruthy()
    expect(signOut).not.toHaveBeenCalled()
  })

  it('sends a check-in volunteer straight to check-in', async () => {
    await renderApp({ session: true, staff: { id: 'st-9', name: 'Kenji Abe', email: 'kenji.abe@aafe-demo.example.org', role: 'check_in_volunteer' } as StaffUser })
    await waitFor(() => expect(window.location.hash).toBe('#/checkin'))
    expect(screen.getByText('Kenji Abe')).toBeTruthy()
  })

  it('stops listening for sign-in changes when the app closes', async () => {
    const { unmount } = await renderApp({ session: false, staff: null })
    await screen.findByRole('button', { name: /Email me a sign-in link/ })
    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
