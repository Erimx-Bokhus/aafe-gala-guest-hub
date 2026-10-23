// @vitest-environment jsdom
// The iPad app's live screens (Supabase keys set): what it says when the gala is closed and when signing in fails,
// so staff at the door know what happened and what to do (Gate 3).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { StaffUser } from '@shared/types'
import App from './App'
import type { Arrival, Door, DoorGuest } from './door'

const m = vi.hoisted(() => ({
  currentStaff: vi.fn(), sendSignInLink: vi.fn(), verifySignInCode: vi.fn(), loadDoor: vi.fn(), signInFromLink: vi.fn(async () => false),
  session: null as object | null, onAuth: null as ((ev: string) => void) | null,
}))
vi.mock('./door', async (actual) => ({ ...(await actual<typeof import('./door')>()), LIVE: true }))
vi.mock('./liveDoor', () => ({ loadDoor: m.loadDoor, checkLiveSignOut: vi.fn(), deskFor: vi.fn() }))
vi.mock('@shared/supabase', async (actual) => ({
  sendFailure: (await actual<typeof import('@shared/supabase')>()).sendFailure,   // the real wording
  supabase: { auth: {
    getSession: async () => ({ data: { session: m.session } }),
    onAuthStateChange: (f: (ev: string) => void) => { m.onAuth = f; return { data: { subscription: { unsubscribe: () => {} } } } },
  } },
  currentStaff: m.currentStaff, sendSignInLink: m.sendSignInLink, verifySignInCode: m.verifySignInCode,
  signInFromLink: () => m.signInFromLink(), signOut: async () => { m.session = null },
}))

const KENJI: StaffUser = { id: 'st-test-door', name: 'Door Tester', email: 'door@example.org', role: 'check_in_volunteer' }
const online = (on: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => on })

afterEach(() => { cleanup(); vi.clearAllMocks(); online(true); localStorage.clear(); m.session = null; m.signInFromLink.mockImplementation(async () => false) })

describe('the iPad says what happened and what to do', () => {
  // Oct 19 click-through: a login that isn't on the staff list was signed out without a word. The sign-in screen was
  // already showing (a typed code, or a link checked twice), and it only read its message when it first appeared.
  it("a login that isn't on the staff list is told so, even with the sign-in screen already showing", async () => {
    m.currentStaff.mockResolvedValue(null)
    render(<App />)
    await screen.findByTestId('email')                     // nobody signed in yet
    m.session = { user: { email: 'not.staff@example.org' } }
    act(() => m.onAuth?.('SIGNED_IN'))                     // a code or link signs in someone not on the list
    expect((await screen.findByRole('alert')).textContent).toBe('That account isn’t on the AAFE staff list. Ask the gala admin to add you.')
    expect(m.session).toBeNull()                           // and they are signed out again
  })

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

  // Oct 19 click-through: a second code within a minute is refused by Supabase (429); the door said to check the
  // connection and the address, when the fix is to wait.
  it('too many code requests say to wait a minute, not to check the connection', async () => {
    m.currentStaff.mockResolvedValue(null)
    m.sendSignInLink.mockRejectedValue(Object.assign(new Error('For security purposes, you can only request this after 52 seconds.'), { status: 429 }))
    render(<App />)
    fireEvent.change(await screen.findByTestId('email'), { target: { value: 'door@example.org' } })
    fireEvent.click(screen.getByTestId('send-link'))
    expect((await screen.findByRole('alert')).textContent).toBe('Too many sign-in emails for now. Wait a minute, then ask for a new code.')
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

  // Oct 22 story run: Sam's QR ticket checked him in, and the scanner closed without a word, so the volunteer never
  // saw whose ticket it was and had no Undo.
  it('a QR check-in names the guest, with Undo, like a tap does', async () => {
    const sam: DoorGuest = { id: 'g-sam', order_id: 'ord-1', first_name: 'Sam', last_name: 'Ortega', title: null, organization: null,
      sponsor: 'AAFE', category: 'comp_relationship', seat_label: 'Complimentary guest of AAFE', table: null, access: false }
    const arrivals = new Map<string, Arrival>()
    const door: Door = {
      gala: { id: 'ev-2027', name: 'AAFE Gala (demo)', event_date: '2027-05-20', doors_time: null, venue_name: null },
      guests: [sam], sponsors: [], status: { online: true, pending: 0 },
      arrivals: () => arrivals, exceptions: () => [], notices: () => [], dismiss: () => {}, checkIn: () => [], addException: () => '',
      scan: vi.fn(async () => { arrivals.set('g-sam', { handle: 'c-sam', at: new Date().toISOString(), by: 'Door Tester', queued: true }); return { guestId: 'g-sam', handle: 'c-sam' } }),
      undo: vi.fn(async () => null), subscribe: () => () => {}, start: () => {}, stop: () => {},
    }
    m.session = { user: { email: KENJI.email } }
    m.currentStaff.mockResolvedValue(KENJI)
    m.loadDoor.mockResolvedValue(door)
    render(<App />)
    fireEvent.click(await screen.findByTestId('open-scan'))
    fireEvent.change(screen.getByTestId('qr-input'), { target: { value: 'AAFE-TEST-0001' } })
    fireEvent.click(screen.getByTestId('qr-submit'))
    expect((await screen.findByTestId('undo-toast')).textContent).toMatch(/Checked in\s*Sam Ortega · no assigned table · /)
    expect(screen.queryByTestId('qr-input')).toBeNull()   // the scanner closed
    fireEvent.click(screen.getByTestId('undo'))
    await waitFor(() => expect(door.undo).toHaveBeenCalledWith(['c-sam']))
  })

  it('an iPad that is offline and signed out says to connect to sign in', async () => {
    online(false)
    m.currentStaff.mockRejectedValue(new Error('TypeError: Failed to fetch'))
    render(<App />)
    expect((await screen.findByRole('alert')).textContent).toBe('This iPad is offline and not signed in. Connect to Wi-Fi to sign in.')
  })
})
