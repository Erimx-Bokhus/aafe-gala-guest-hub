// @vitest-environment jsdom
// Salesforce on the Integrations page (Oct 24, the review against Idlewild and NPSP): records Salesforce refused are
// counted, the latest one's own reason is shown, and the advice depends on it: a setup problem needs a change in
// Salesforce, a dropped connection passes. Before, every refusal said "Try Sync now later".
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { loadDB } from '@shared/data'
import type { DB, StaffUser } from '@shared/types'
import { demoApi, type StaffApi } from '../api'
import { StaffCtx } from '../store'
import Integrations from './Integrations'
import { NO_EMAIL } from '../../../supabase/functions/_shared/salesforce.ts'

afterEach(cleanup)
const ADMIN: StaffUser = { id: 'st-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' }
const HIDDEN = "Salesforce refused (HTTP 400): INVALID_FIELD: No such column 'npe01__HomeEmail__c' on entity 'Contact'."

function setup(rows: DB['salesforce_sync'], sync?: StaffApi['syncSalesforce']) {
  let db = loadDB()
  db = { ...db, salesforce_sync: [...db.salesforce_sync, ...rows] }
  const api = { ...demoApi(ADMIN, (fn) => { db = fn(db) }, () => db), ...(sync ? { syncSalesforce: sync } : {}) }
  const toast = vi.fn()
  render(<StaffCtx.Provider value={{ db, api, user: ADMIN, toast, act: async (p) => { await p; return true }, demo: null }}><Integrations /></StaffCtx.Provider>)
  return { toast }
}
const row = (entity_id: string, error_message: string, at: string) =>
  ({ entity: 'guest', entity_id, sf_object: 'Contact', sf_id: null, status: 'error' as const, last_synced_at: at, error_message })

describe('records Salesforce refused', () => {
  it("are counted, and the latest one's own reason is shown with what to do", () => {
    setup([row('g-1', 'Salesforce refused (HTTP 503)', '2027-05-01T10:00:00Z'), row('g-2', HIDDEN, '2027-05-02T10:00:00Z'), row('g-3', NO_EMAIL, '2027-05-02T11:00:00Z')])
    expect(screen.getByTestId('sf-failed').textContent).toBe('2')   // the guest skipped for no email isn't "not sent"
    const shown = screen.getByTestId('sf-first-error').textContent ?? ''
    expect(shown).toContain("INVALID_FIELD: No such column 'npe01__HomeEmail__c'")
    expect(shown).toContain('This needs a change in Salesforce')
    expect(shown).not.toContain('Try Sync now later')
  })
  it('none refused: no count in red and no message', () => {
    setup([])
    expect(screen.getByTestId('sf-failed').textContent).toBe('0')
    expect(screen.queryByTestId('sf-first-error')).toBeNull()
  })
  it("Sync now says Salesforce's reason, and to try later only when trying later helps", async () => {
    const sync = vi.fn<StaffApi['syncSalesforce']>()
      .mockResolvedValueOnce({ sent: 10, failed: 2, by_object: {}, first_error: HIDDEN })
      .mockResolvedValueOnce({ sent: 10, failed: 2, by_object: {}, first_error: 'Salesforce refused (HTTP 503)' })
    const { toast } = setup([], sync)
    fireEvent.click(screen.getByTestId('sf-sync'))
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1))
    expect(toast.mock.calls[0][0]).toMatch(/^Salesforce: 10 sent, 2 not sent\. Salesforce refused \(HTTP 400\): INVALID_FIELD.*This needs a change in Salesforce/)
    await waitFor(() => expect(screen.getByTestId('sf-sync')).not.toHaveProperty('disabled', true))
    fireEvent.click(screen.getByTestId('sf-sync'))
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(2))
    expect(toast.mock.calls[1][0]).toBe('Salesforce: 10 sent, 2 not sent. Salesforce refused (HTTP 503). Try Sync now later.')
  })
})
