// @vitest-environment jsdom
// The iPad app's live screens (Supabase keys set): what it says when the gala is closed and when signing in fails,
// so staff at the door know what happened and what to do (Gate 3).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { StaffUser } from '@shared/types'
import App from './App'

const m = vi.hoisted(() => ({ currentStaff: vi.fn(), sendSignInLink: vi.fn(), verifySignInCode: vi.fn(), loadDoor: vi.fn() }))
vi.mock('./door', async (actual) => ({ ...(await actual<typeof import('./door')>()), LIVE: true }))
vi.mock('./liveDoor', () => ({ loadDoor: m.loadDoor, checkLiveSignOut: vi.fn(), deskFor: vi.fn() }))
vi.mock('@shared/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) } },
  currentStaff: m.currentStaff, sendSignInLink: m.sendSignInLink, verifySignInCode: m.verifySignInCode,
  signInFromLink: async () => false, signOut: async () => {},
}))

const KENJI: StaffUser = { id: 'st-test-door', name: 'Door Tester', email: 'door@example.org', role: 'check_in_volunteer' }
const online = (on: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => on })

afterEach(() => { cleanup(); vi.clearAllMocks(); online(true); localStorage.clear() })

describe('the iPad says what happened and what to do', () => {
  it('a closed gala says how to reopen it, and Try again loads the door again', async () => {
    m.currentStaff.mockResolvedValue(KENJI)
    m.loadDoor.mockResolvedValue(null)   // no open gala: the list was cleared
    render(<App />)
    expect(await screen.findByText('The guest list has been cleared from this iPad. If guests are still arriving, ask a gala admin to reopen the gala in the staff app, then tap Try again.')).toBeTruthy()
    fireEvent.click(screen.getByTestId('door-retry'))
    await waitFor(() => expect(m.loadDoor).toHaveBeenCalledTimes(2))
  })

  it('a sign-in email that could not be sent points to the connection, then the address', async () => {
    m.currentStaff.mockResolvedValue(null)
    m.sendSignInLink.mockRejectedValue(new Error('TypeError: Failed to fetch'))
    render(<App />)
    fireEvent.change(await screen.findByTestId('email'), { target: { value: 'door@example.org' } })
    fireEvent.click(screen.getByTestId('send-link'))
    expect((await screen.findByRole('alert')).textContent)
      .toBe('We couldn’t send a sign-in email. Check the internet connection and the email address; if both are right, ask the gala admin to invite you.')
  })

  it('a code typed while offline says to connect first, not that the code is wrong', async () => {
    m.currentStaff.mockResolvedValue(null)
    m.sendSignInLink.mockResolvedValue(undefined)
    m.verifySignInCode.mockRejectedValue(new Error('TypeError: Failed to fetch'))
    render(<App />)
    fireEvent.change(await screen.findByTestId('email'), { target: { value: 'door@example.org' } })
    fireEvent.click(screen.getByTestId('send-link'))
    fireEvent.change(await screen.findByTestId('code'), { target: { value: '123456' } })
    online(false)
    fireEvent.click(screen.getByTestId('verify-code'))
    expect((await screen.findByRole('alert')).textContent).toBe('No internet connection. Connect to Wi-Fi, then type the code again.')
  })

  it('an iPad that is offline and signed out says to connect to sign in', async () => {
    online(false)
    m.currentStaff.mockRejectedValue(new Error('TypeError: Failed to fetch'))
    render(<App />)
    expect((await screen.findByRole('alert')).textContent).toBe('This iPad is offline and not signed in. Connect to Wi-Fi to sign in.')
  })
})
