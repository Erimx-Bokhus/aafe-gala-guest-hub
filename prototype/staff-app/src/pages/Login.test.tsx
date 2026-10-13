// @vitest-environment jsdom
// The staff sign-in page in both modes: an emailed link or 6-digit code when Supabase is set up, demo accounts when it isn't.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { loadDB } from '@shared/data'
import { useDisplayPrefs } from '@shared/ui'
import type { StaffUser } from '@shared/types'

const send = vi.fn()
const verify = vi.fn()

async function renderLogin(live: boolean, props: { notice?: string; onLogin?: (u: StaffUser) => void } = {}) {
  vi.resetModules()
  vi.doMock('@shared/supabase', () => ({ supabase: live ? {} : null, sendSignInLink: send, verifySignInCode: verify }))
  const { default: Login } = await import('./Login')
  const db = loadDB()
  function Page() { return <Login db={db} prefs={useDisplayPrefs()} notice={props.notice} onLogin={props.onLogin ?? (() => {})} /> }
  render(<Page />)
  return db
}

afterEach(() => { cleanup(); send.mockReset(); verify.mockReset(); vi.doUnmock('@shared/supabase') })

describe('live sign-in (Supabase configured)', () => {
  it('asks only for an email: no password, no demo accounts', async () => {
    await renderLogin(true)
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(screen.queryByText(/Demo accounts/)).toBeNull()
    expect(screen.getByRole('button', { name: /Email me a sign-in code/ })).toBeTruthy()
  })

  it('needs an email before sending', async () => {
    await renderLogin(true)
    fireEvent.click(screen.getByRole('button', { name: /Email me a sign-in code/ }))
    expect(await screen.findByText('Enter your work email.')).toBeTruthy()
    expect(send).not.toHaveBeenCalled()
  })

  it('sends the link and says to check the inbox', async () => {
    send.mockResolvedValue(undefined)
    await renderLogin(true)
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'mei.ortiz@aafe-demo.example.org' } })
    fireEvent.click(screen.getByRole('button', { name: /Email me a sign-in code/ }))
    expect(await screen.findByTestId('link-sent')).toBeTruthy()
    expect(send).toHaveBeenCalledWith('mei.ortiz@aafe-demo.example.org')
  })

  it('then signs in with the 6-digit code from the email, and can ask for a new one', async () => {
    send.mockResolvedValue(undefined)
    await renderLogin(true)
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'mei.ortiz@aafe-demo.example.org' } })
    fireEvent.click(screen.getByRole('button', { name: /Email me a sign-in code/ }))
    const code = await screen.findByLabelText('6-digit code')
    const signIn = screen.getByRole('button', { name: /Sign in/ }) as HTMLButtonElement
    expect(signIn.disabled).toBe(true)
    fireEvent.change(code, { target: { value: '12 34 56' } })
    expect((code as HTMLInputElement).value).toBe('123456')
    verify.mockRejectedValueOnce(new Error('Token has expired or is invalid'))
    fireEvent.click(signIn)
    expect(await screen.findByText(/That code didn.t work/)).toBeTruthy()
    verify.mockResolvedValueOnce(undefined)
    fireEvent.click(screen.getByRole('button', { name: /Sign in/ }))
    await waitFor(() => expect(verify).toHaveBeenLastCalledWith('mei.ortiz@aafe-demo.example.org', '123456'))
    fireEvent.click(screen.getByRole('button', { name: 'Send a new email' }))
    expect(screen.getByRole('button', { name: /Email me a sign-in code/ })).toBeTruthy()
  })

  it('shows one message for any failure, so the form never reveals who is on the staff list', async () => {
    send.mockRejectedValue(new Error('Signups not allowed for otp'))
    await renderLogin(true)
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'stranger@example.org' } })
    fireEvent.click(screen.getByRole('button', { name: /Email me a sign-in code/ }))
    const msg = await screen.findByText(/couldn.t send a sign-in email/)
    expect(msg.textContent).not.toMatch(/Signups|not allowed|not invited|staff list/i)
  })

  it('shows why a sign-in was refused', async () => {
    await renderLogin(true, { notice: 'That email isn’t on the AAFE staff list. Ask the gala admin to add you.' })
    expect(screen.getByRole('alert').textContent).toContain('staff list')
  })
})

describe('demo sign-in (no Supabase settings)', () => {
  it('keeps the demo accounts and signs in a listed demo user', async () => {
    const onLogin = vi.fn()
    const db = await renderLogin(false, { onLogin })
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByText(/Demo accounts/)).toBeTruthy()
    fireEvent.click(screen.getByTestId('sign-in'))
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(db.staff_users[0]))
    expect(send).not.toHaveBeenCalled()
  })

  it('refuses an email that is not a demo account', async () => {
    const onLogin = vi.fn()
    await renderLogin(false, { onLogin })
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'stranger@example.org' } })
    fireEvent.click(screen.getByTestId('sign-in'))
    expect(await screen.findByText(/not on the AAFE staff list/)).toBeTruthy()
    expect(onLogin).not.toHaveBeenCalled()
  })
})
