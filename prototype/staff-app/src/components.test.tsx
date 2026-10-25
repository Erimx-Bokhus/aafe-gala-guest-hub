// @vitest-environment jsdom
// A form saves once: the button stays disabled until the server answers, so a double-click can't record a payment,
// pledge or comp guest twice (review of PR #72). And the pages' own failures say what happened and what to do (Gate 3).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { loadDB } from '@shared/data'
import type { StaffUser } from '@shared/types'
import type { StaffApi } from './api'
import { AddPledgeModal, RecordPaymentModal } from './components'
import { StaffCtx } from './store'
import CheckIn from './pages/CheckIn'
import Integrations from './pages/Integrations'
import Pipeline from './pages/Pipeline'

const RM: StaffUser = { id: 'st-rm', name: 'Test Manager', email: 'rm@aafe-demo.example.org', role: 'relationship_manager' }

/** A server that hasn't answered yet: the save stays in flight until `answer()`. */
function slowApi() {
  let answer: () => void = () => {}
  const pending = new Promise<void>((r) => { answer = r })
  const api = { live: true, recordPayment: vi.fn(() => pending), addPledge: vi.fn(() => pending) } as unknown as StaffApi
  return { api, answer: () => answer() }
}
function renderWith(api: StaffApi, ui: React.ReactNode, o: { user?: StaffUser; toast?: (m: string) => void } = {}) {
  const act = async (p: Promise<unknown>) => { await p; return true }
  return render(<StaffCtx.Provider value={{ db: loadDB(), api, user: o.user ?? RM, toast: o.toast ?? (() => {}), act, demo: null }}>{ui}</StaffCtx.Provider>)
}

afterEach(cleanup)

describe('forms save once', () => {
  it('Record payment: a double-click records one payment, and the button says it is saving', async () => {
    const { api, answer } = slowApi()
    const order = loadDB().orders.find((o) => o.id === 'ord-acme')!
    renderWith(api, <RecordPaymentModal open onClose={() => {}} orderId={order.id} />)
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '500' } })
    const check = document.getElementById('rc') as HTMLInputElement | null
    if (check) fireEvent.change(check, { target: { value: '1042' } })
    const button = screen.getByTestId('save-payment')
    fireEvent.click(button)
    fireEvent.click(button)
    expect(api.recordPayment).toHaveBeenCalledTimes(1)
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.textContent).toBe('Saving…')
    answer()
  })

  it('Add pledge: a double-click records one pledge', () => {
    const { api, answer } = slowApi()
    renderWith(api, <AddPledgeModal open onClose={() => {}} />)
    fireEvent.change(document.getElementById('po')!, { target: { value: 'Example Pledge Co' } })
    fireEvent.change(document.getElementById('pc')!, { target: { value: 'Sam Lee' } })
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'sam@example.org' } })
    const button = screen.getByTestId('save-pledge')
    fireEvent.click(button)
    fireEvent.click(button)
    expect(api.addPledge).toHaveBeenCalledTimes(1)
    answer()
  })
})

describe('page failures say what happened and what to do (Gate 3)', () => {
  const ADMIN: StaffUser = { id: 'st-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' }
  const offline = () => Promise.reject(new Error('TypeError: Failed to fetch'))

  it('check-in: an unknown QR code, and a check-in with the internet down', async () => {
    const db = loadDB()
    const g = db.guests.find((x) => x.attendance_status !== 'checked_in'
      && db.orders.some((o) => o.id === x.order_id && o.event_id === db.meta.current_event_id && o.status !== 'cancelled'))!
    const api = { live: true, checkInByCode: vi.fn(() => Promise.reject(new Error('not_found: unknown QR code'))), checkIn: vi.fn(offline) } as unknown as StaffApi
    const toast = vi.fn()
    renderWith(api, <CheckIn />, { toast })
    fireEvent.change(screen.getByTestId('qr-input'), { target: { value: 'AAFE-OLD-TICKET' } })
    fireEvent.submit(screen.getByTestId('qr-input'))
    await waitFor(() => expect(toast).toHaveBeenLastCalledWith(
      'No guest found for code “AAFE-OLD-TICKET”. The ticket may have been replaced. Search the guest by name, or add an approved exception.'))
    fireEvent.change(screen.getByTestId('checkin-search'), { target: { value: `${g.first_name} ${g.last_name}` } })
    fireEvent.click(screen.getByTestId(`arrive-${g.id}`))
    await waitFor(() => expect(toast).toHaveBeenLastCalledWith(
      'Not checked in. If the internet is down, use the iPad check-in app (it works offline) or the printed list.'))
  })

  it("integrations: the approval list didn't load, an email that failed, and a Salesforce sync that sent only some", async () => {
    const failed = { id: 'em-1', template: 'portal_link', to_name: 'Sam Lee', to_email: 'sam@example.org', trigger: 'staff_manual', created_at: null,
      approved_by: 'Test Admin', attempts: 5, last_error: '550 mailbox unavailable', state: 'failed', order_id: null, organization: null, tier: null,
      deadline: null, seats_unnamed: 0, seats_total: 0, guest: null, payment: null }
    const toast = vi.fn()
    const down = { live: true, emailQueue: vi.fn(offline) } as unknown as StaffApi
    const first = renderWith(down, <Integrations />, { user: ADMIN, toast })
    expect((await screen.findByTestId('email-queue-failed')).textContent)
      .toBe('Couldn’t load the emails waiting for approval. Reload the page; if it keeps happening, ask the gala admin.')
    first.unmount()

    const up = { live: true, emailQueue: vi.fn(async () => [failed]),
      syncSalesforce: vi.fn(async () => ({ sent: 3, failed: 1, by_object: {}, first_error: 'INVALID_FIELD: npe01__Opportunity__r' })) } as unknown as StaffApi
    renderWith(up, <Integrations />, { user: ADMIN, toast })
    const note = await screen.findByText(/^Not sent after 5 tries/)
    expect(note.textContent).toBe('Not sent after 5 tries. Check the address, discard it and send again; if it fails again, ask the technical partner.')
    expect(note.getAttribute('title')).toBe('550 mailbox unavailable')   // the raw reason, for whoever fixes it
    expect(screen.queryByTestId('email-queue-failed')).toBeNull()
    fireEvent.click(screen.getByTestId('sf-sync'))
    // Salesforce's own reason, and since a missing field is a setup problem, not "try later" (Oct 24).
    await waitFor(() => expect(toast).toHaveBeenLastCalledWith('Salesforce: 3 sent, 1 not sent. INVALID_FIELD: npe01__Opportunity__r. '
      + 'This needs a change in Salesforce: show it to your technical partner, with the Salesforce setup list.'))
  })

  it("pipeline: a board that didn't load says why in words", async () => {
    renderWith({ live: true, pipeline: vi.fn(offline) } as unknown as StaffApi, <Pipeline />)
    expect(await screen.findByText('Couldn’t reach AAFE’s database. Check the internet connection and try again.')).toBeTruthy()
  })
})
