// @vitest-environment jsdom
// Adding a prospect, from AAFE's Oct 20 walk-through: an individual sponsor needs no organization (item 6), and the
// package list offers ads and tickets beside sponsorships (item 5).
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { loadDB } from '@shared/data'
import type { DB, StaffUser } from '@shared/types'
import { demoApi } from '../api'
import { StaffCtx } from '../store'
import Pipeline from './Pipeline'

afterEach(cleanup)
const MEI: StaffUser = { id: 'st-mei', name: 'Mei Ortiz', email: 'mei.ortiz@aafe-demo.example.org', role: 'gala_admin' }

async function openForm() {
  let db: DB = loadDB()
  const api = { ...demoApi(MEI, (fn) => { db = fn(db) }, () => db), live: false }
  render(<StaffCtx.Provider value={{ db, api, user: MEI, toast: () => {}, act: async (p) => { await p; return true }, demo: null }}><Pipeline /></StaffCtx.Provider>)
  fireEvent.click(await screen.findByTestId('pipeline-add'))
  return within(screen.getByTestId('prospect-form'))
}

describe('adding a prospect', () => {
  it("needs a contact name, not an organization", async () => {
    const form = await openForm()
    const add = form.getByRole('button', { name: 'Add prospect' })
    expect(add.hasAttribute('disabled')).toBe(true)
    fireEvent.change(form.getByLabelText('Contact name'), { target: { value: 'Sam Example Individual' } })
    expect(add.hasAttribute('disabled')).toBe(false)
    expect(form.getByLabelText('Organization (optional)')).toBeTruthy()
  })

  it('offers sponsorships, ads and tickets, grouped, and no complimentary level', async () => {
    const form = await openForm()
    const groups = [...(form.getByLabelText('Package asked for') as HTMLSelectElement).querySelectorAll('optgroup')].map((g) => g.label)
    expect(groups).toEqual(['Sponsorships', 'Ads', 'Tickets'])
    expect(form.queryByRole('option', { name: /Complimentary/ })).toBeNull()
  })
})
