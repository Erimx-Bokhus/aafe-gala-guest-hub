// @vitest-environment jsdom
// Demo mode (no Supabase): the pages run their actions through StaffApi with the same role rules as the server (issue #9).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { loadDB } from '@shared/data'

async function renderDemo() {
  vi.resetModules()
  vi.doMock('@shared/supabase', () => ({ supabase: null, currentStaff: vi.fn(), signOut: vi.fn(), sendSignInLink: vi.fn() }))
  const { default: App } = await import('./App')
  return render(<App />)
}

// The first import of the whole staff app takes up to 4.6 s while other test files run alongside (Oct 17): done once
// here, with its own time, so it doesn't count against the first test's 5 seconds (App.test.tsx has the details).
beforeAll(async () => { await renderDemo(); cleanup() }, 30_000)
afterEach(() => { cleanup(); vi.doUnmock('@shared/supabase'); history.replaceState(null, '', '/') })

describe('staff app (demo mode)', () => {
  it('a volunteer checks a guest in from the door list, which holds no email addresses', async () => {
    const { container } = await renderDemo()
    fireEvent.click(await screen.findByTestId('login-check_in_volunteer'))
    await waitFor(() => expect(window.location.hash).toBe('#/checkin'))

    const db = loadDB()
    const g = db.guests.find((x) => x.attendance_status === 'expected' && x.email && x.order_id !== 'ord-rel')!
    fireEvent.change(screen.getByTestId('checkin-search'), { target: { value: `${g.first_name} ${g.last_name}` } })
    fireEvent.click(await screen.findByTestId(`arrive-${g.id}`))
    expect(await screen.findByText(`${g.first_name} ${g.last_name} checked in`)).toBeTruthy()
    expect(container.innerHTML).not.toContain(g.email)
  })

  it("a volunteer's page is matched by its own address, not a prefix (Gate 2)", async () => {
    await renderDemo()
    fireEvent.click(await screen.findByTestId('login-check_in_volunteer'))
    await waitFor(() => expect(window.location.hash).toBe('#/checkin'))
    window.location.hash = '#/checkinx'
    expect(await screen.findByTestId('export-checkin')).toBeTruthy()
    expect(screen.queryByText('Gala dashboard')).toBeNull()
  })

  it('a gala admin saves the gala information', async () => {
    await renderDemo()
    fireEvent.click(await screen.findByTestId('login-gala_admin'))
    window.location.hash = '#/gala'
    const dress = await screen.findByLabelText('Dress code')
    fireEvent.change(dress, { target: { value: 'Festive cocktail' } })
    fireEvent.submit(dress.closest('form')!)
    expect(await screen.findByText('Gala information saved')).toBeTruthy()
  })
})
