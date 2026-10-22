// @vitest-environment jsdom
// The QR invitation's Send button (AAFE's Oct 20 walk-through, triage B3): it said "Send (simulated)" in live mode too,
// where it really sends. It says "Send" live and keeps "(simulated)" in the demo.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { loadDB } from '@shared/data'
import type { DB, StaffUser } from '@shared/types'
import { demoApi } from '../api'
import { StaffCtx } from '../store'
import Relationship from './Relationship'

afterEach(cleanup)
const ADMIN: StaffUser = { id: 'st-admin', name: 'Test Admin', email: 'admin@aafe-demo.example.org', role: 'gala_admin' }

function openPreview(live: boolean) {
  let db: DB = loadDB()
  const api = { ...demoApi(ADMIN, (fn) => { db = fn(db) }, () => db), live }
  render(<StaffCtx.Provider value={{ db, api, user: ADMIN, toast: () => {}, act: async (p) => { await p; return true }, demo: null }}><Relationship /></StaffCtx.Provider>)
  fireEvent.click(screen.getAllByRole('button', { name: /QR invite/ })[0])
  return screen.getByTestId('send-qr').textContent?.trim()
}

describe("the QR invitation's Send button", () => {
  it('live: says Send', () => expect(openPreview(true)).toBe('Send'))
  it('demo: says Send (simulated)', () => expect(openPreview(false)).toBe('Send (simulated)'))
})
