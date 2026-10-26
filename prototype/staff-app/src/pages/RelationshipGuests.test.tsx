// @vitest-environment jsdom
// Relationship guests, from AAFE's Oct 20 walk-through: a name is enough to add one (D4), and one button sends every
// unsent QR invitation (D5) without touching a guest who was already sent one (a send replaces the code).
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { loadDB } from '@shared/data'
import type { DB, StaffUser } from '@shared/types'
import { demoApi } from '../api'
import { StaffCtx, addCompGuest } from '../store'
import Relationship from './Relationship'

afterEach(cleanup)
const ADMIN: StaffUser = { id: 'st-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' }
const blank = { first_name: '', last_name: '', title: '', organization: '', email: '', relationship_note: '' }
const qrSends = (db: DB) => db.email_log.filter((e) => e.template === 'qr_invitation')

function mount(prep: (db: DB) => DB = (d) => d) {
  const box = { db: prep(loadDB()) }
  const api = { ...demoApi(ADMIN, (fn) => { box.db = fn(box.db) }, () => box.db), live: false }
  render(<StaffCtx.Provider value={{ db: box.db, api, user: ADMIN, toast: () => {}, act: async (p) => { await p; return true }, demo: null }}><Relationship /></StaffCtx.Provider>)
  return box
}

describe('a relationship guest card', () => {
  it('shows the table, never a seat number (Oct 20 walk-through, 36:39)', () => {
    const box = mount()
    const seated = box.db.guests.find((g) => g.guest_type === 'comp_relationship' && g.table_id)
    if (!seated) throw new Error('the demo data needs a seated relationship guest')
    const table = box.db.event_tables.find((x) => x.id === seated.table_id)!
    const card = screen.getByText(`${seated.first_name} ${seated.last_name}`).closest('.card')!
    expect(card.textContent).toContain(`Table ${table.number}`)
    expect(card.textContent).not.toMatch(/seat \d/i)
  })
})

describe('adding a relationship guest (D4)', () => {
  it('needs only a name; a typed email must still look like one', () => {
    mount()
    fireEvent.click(screen.getByRole('button', { name: /Add guest/ }))
    const save = screen.getByTestId('save-comp')
    expect(save.hasAttribute('disabled')).toBe(true)
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: "Borough President's guest" } })
    expect(save.hasAttribute('disabled')).toBe(false)
    fireEvent.change(screen.getByLabelText('Email (optional)'), { target: { value: 'not-an-email' } })
    expect(save.hasAttribute('disabled')).toBe(true)
  })

  it('shows a guest without an email how they get in, with no Send button that would fail', () => {
    mount((d) => addCompGuest(d, ADMIN, { ...blank, first_name: 'Noemail', last_name: 'Guest' }))
    expect(screen.getByTestId('no-email').textContent).toContain('check in by name')
  })
})

describe('"Send all unsent QR invites" (D5)', () => {
  it('sends to every guest with an email and no invitation yet, and to no one else', async () => {
    const box = mount((d) => addCompGuest(addCompGuest(d, ADMIN, { ...blank, first_name: 'Ada', last_name: 'New', email: 'ada.new@example.org' }), ADMIN, { ...blank, first_name: 'Bo', last_name: 'Noemail' }))
    const before = box.db
    const offered = Number(/\((\d+)\)/.exec(screen.getByTestId('send-all-qr').textContent ?? '')?.[1])
    fireEvent.click(screen.getByTestId('send-all-qr'))
    fireEvent.click(screen.getByTestId('send-all-confirm'))
    await waitFor(() => expect(qrSends(box.db).length).toBe(qrSends(before).length + offered))
    const sent = qrSends(box.db).slice(qrSends(before).length).map((e) => before.guests.find((g) => g.id === e.guest_id)!)
    expect(sent.map((g) => g.first_name)).toContain('Ada')
    expect(sent.some((g) => g.first_name === 'Bo')).toBe(false)
    expect(sent.every((g) => g.email && !qrSends(before).some((e) => e.guest_id === g.id))).toBe(true)
  })
})
