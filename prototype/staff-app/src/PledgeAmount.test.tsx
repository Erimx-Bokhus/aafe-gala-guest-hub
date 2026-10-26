// @vitest-environment jsdom
// New pledge's amount (AAFE's Oct 20 walk-through, item 1): blank means the level's price; staff type another for a donation
// or a different gift. The demo store keeps staff_add_pledge's rule (scripts/test-backend.mjs checks the server's).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { levelsOf, loadDB } from '@shared/data'
import { money } from '@shared/ui'
import type { StaffUser } from '@shared/types'
import type { StaffApi } from './api'
import { AddPledgeModal } from './components'
import { StaffCtx, addPledge } from './store'

afterEach(cleanup)
const RM: StaffUser = { id: 'st-rm', name: 'Test Manager', email: 'rm@aafe-demo.example.org', role: 'relationship_manager' }

function show() {
  const db = loadDB()
  const addPledgeApi = vi.fn(async () => {})
  const api = { live: false, addPledge: addPledgeApi } as unknown as StaffApi
  render(<StaffCtx.Provider value={{ db, api, user: RM, toast: () => {}, act: async (p) => { await p; return true }, demo: null }}><AddPledgeModal open onClose={() => {}} /></StaffCtx.Provider>)
  fireEvent.change(document.getElementById('po')!, { target: { value: 'Example Gift Fund' } })
  fireEvent.change(document.getElementById('pc')!, { target: { value: 'Sam Lee' } })
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'sam@example.org' } })
  const level = levelsOf(db).find((t) => t.id === (document.getElementById('pt') as HTMLSelectElement).value)!
  return { addPledgeApi, level, amount: screen.getByLabelText('Amount') as HTMLInputElement, save: screen.getByTestId('save-pledge') as HTMLButtonElement }
}
const sentAmount = (fn: ReturnType<typeof vi.fn>) => (fn.mock.calls[0] as [{ amount: number | null }])[0].amount

describe('New pledge: the amount', () => {
  it("left blank, sends no amount (the level's price), and says what that price is", () => {
    const { addPledgeApi, level, amount, save } = show()
    expect(amount.placeholder).toBe(String(level.contribution_amount))
    expect(screen.getByText(new RegExp(`level's ${money(level.contribution_amount).replace('$', '\\$')}`))).toBeTruthy()
    fireEvent.click(save)
    expect(sentAmount(addPledgeApi)).toBeNull()
  })

  it('typed, sends that amount', () => {
    const { addPledgeApi, amount, save } = show()
    fireEvent.change(amount, { target: { value: '2000' } })
    fireEvent.click(save)
    expect(sentAmount(addPledgeApi)).toBe(2000)
  })

  it('$0 is refused on the form, with the reason', () => {
    const { addPledgeApi, amount, save } = show()
    fireEvent.change(amount, { target: { value: '0' } })
    expect(save.disabled).toBe(true)
    expect(screen.getByText('More than $0, at most $10,000,000')).toBeTruthy()
    fireEvent.click(save)
    expect(addPledgeApi).not.toHaveBeenCalled()
  })
})

describe('addPledge in the demo store', () => {
  const base = { org: 'Example Gift Fund', contact: 'Sam Lee', email: 'sam@example.org', source: 'check' as const }
  it("keeps a typed amount, names it in the change log, and otherwise takes the level's price", () => {
    const db = loadDB()
    const level = levelsOf(db).find((t) => t.tier_category === 'sponsorship')!
    const gift = addPledge(db, RM, { ...base, tierId: level.id, amount: 2000.004 })
    expect(gift.orders.at(-1)?.commitment_amount).toBe(2000)
    const order = gift.orders.at(-1)!
    expect(gift.audit_log.find((a) => a.entity_id === order.id && a.action === 'order.created')?.summary.endsWith(', $2,000.00.')).toBe(true)
    expect(addPledge(db, RM, { ...base, tierId: level.id }).orders.at(-1)?.commitment_amount).toBe(level.contribution_amount)
    expect(() => addPledge(db, RM, { ...base, tierId: level.id, amount: 0 })).toThrow('invalid_input')
  })
})
