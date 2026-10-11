// @vitest-environment jsdom
// A form saves once: the button stays disabled until the server answers, so a double-click can't record a payment,
// pledge or comp guest twice (review of PR #72).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { loadDB } from '@shared/data'
import type { StaffUser } from '@shared/types'
import type { StaffApi } from './api'
import { AddPledgeModal, RecordPaymentModal } from './components'
import { StaffCtx } from './store'

const RM: StaffUser = { id: 'st-rm', name: 'Test Manager', email: 'rm@aafe-demo.example.org', role: 'relationship_manager' }

/** A server that hasn't answered yet: the save stays in flight until `answer()`. */
function slowApi() {
  let answer: () => void = () => {}
  const pending = new Promise<void>((r) => { answer = r })
  const api = { live: true, recordPayment: vi.fn(() => pending), addPledge: vi.fn(() => pending) } as unknown as StaffApi
  return { api, answer: () => answer() }
}
function renderWith(api: StaffApi, ui: React.ReactNode) {
  const act = async (p: Promise<unknown>) => { await p; return true }
  return render(<StaffCtx.Provider value={{ db: loadDB(), api, user: RM, toast: () => {}, act, demo: null }}>{ui}</StaffCtx.Provider>)
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
