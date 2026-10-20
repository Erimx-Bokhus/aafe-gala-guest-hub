// @vitest-environment jsdom
// Every download says "synthetic" only for a demo gala (docs/salesforce-file.md, gap 1). Six of them used to say it on
// AAFE's real galas too: "-SYNTHETIC" in the file name, and for five a notice on line 1, which Salesforce's import
// wizard would read as the column names. This clicks each export button on a real gala and on a demo one.
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { loadDB } from '@shared/data'
import type { DB, StaffUser } from '@shared/types'
import { demoApi } from '../api'
import { NOTICE } from '../exports'
import { StaffCtx } from '../store'
import AuditLog from './AuditLog'
import Badges from './Badges'
import CheckIn from './CheckIn'
import GuestList from './GuestList'
import Integrations from './Integrations'
import Payments from './Payments'

const downloadCsv = vi.hoisted(() => vi.fn())
vi.mock('@shared/ui', async (actual) => ({ ...(await actual<typeof import('@shared/ui')>()), downloadCsv }))
afterEach(() => { cleanup(); downloadCsv.mockReset() })

const ADMIN: StaffUser = { id: 'st-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' }
// [download, page, its button, whether a demo file starts with the notice line (the activity log never had one)]
const PAGES: [string, () => ReactElement, string, boolean][] = [
  ['badge file', () => <Badges />, 'CSV for printer', true],
  ['check-in list', () => <CheckIn />, 'Printed check-in list', true],
  ['Salesforce file', () => <Integrations />, 'Download Salesforce file', true],
  ['guest list', () => <GuestList />, 'Export CSV', true],
  ['payments', () => <Payments />, 'Export', true],
  ['activity log', () => <AuditLog />, 'Export', false],
]

/** Clicks the page's export button and returns what it downloaded. */
async function download(real: boolean, page: () => ReactElement, button: string) {
  let db: DB = loadDB()
  if (real) db = { ...db, gala_events: db.gala_events.map((e) => ({ ...e, is_synthetic: false })) }
  const api = demoApi(ADMIN, (fn) => { db = fn(db) }, () => db)
  render(<StaffCtx.Provider value={{ db, api, user: ADMIN, toast: () => {}, act: async (p) => { await p; return true }, demo: null }}>{page()}</StaffCtx.Provider>)
  fireEvent.click(screen.getByRole('button', { name: button }))
  await waitFor(() => expect(downloadCsv).toHaveBeenCalledOnce())
  const [name, rows] = downloadCsv.mock.calls[0] as [string, unknown[][]]
  return { name, first: rows[0] }
}

describe.each(PAGES)('the %s download', (_, page, button, notice) => {
  it('on a real gala: no "synthetic" notice and no demo mark in the name', async () => {
    const { name, first } = await download(true, page, button)
    expect(name).toMatch(/\.csv$/)
    expect(name).not.toMatch(/DEMO|SYNTHETIC/i)
    expect(first).not.toEqual(NOTICE)
  })

  it('on a demo gala: the name ends in -DEMO, and the notice is on line 1 where the file has one', async () => {
    const { name, first } = await download(false, page, button)
    expect(name).toMatch(/-DEMO\.csv$/)
    if (notice) expect(first).toEqual(NOTICE)
    else expect(first).not.toEqual(NOTICE)
  })
})
