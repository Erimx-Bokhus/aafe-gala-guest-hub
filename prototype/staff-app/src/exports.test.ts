// The three export files: the demo builds the same rows as the staff_export_* functions, each export is role-checked and
// logged in both modes, and the CSV columns stay the ones staff already use.
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDB } from '@shared/data'
import type { StaffUser } from '@shared/types'
import { demoApi, liveApi } from './api'
import { badgeCsv, checkinCsv, demoBadgeRows, demoCheckinRows, demoSalesforceRows, salesforceCsv } from './exports'
// @ts-expect-error plain JavaScript helper shared with the backend tests
import { openTestDb } from '../../scripts/test-db.mjs'

const staff = (role: StaffUser['role']): StaffUser => ({ id: `st-${role}`, name: `Test ${role}`, email: `${role}@aafe-demo.example.org`, role })
const VOL = staff('check_in_volunteer'), RM = staff('relationship_manager'), ADMIN = staff('gala_admin')
function demo(user: StaffUser) {
  let data = loadDB()
  return { api: demoApi(user, (fn) => { data = fn(data) }, () => data), db: () => data }
}
// Postgres hands back timestamps as Dates and the demo keeps ISO strings; compare the instant. Rows are compared as a set:
// Postgres and the browser sort a few names differently (O’Connell with a curly apostrophe), which changes nothing in the file.
const plain = (rows: object[]) => rows.map((r) => JSON.stringify(Object.fromEntries(Object.entries(r).sort(([x], [y]) => x.localeCompare(y))
  .map(([k, v]) => [k, v instanceof Date || k === 'checked_in_at' ? new Date(v as string).toISOString() : v])))).sort()

describe('the demo builds the same rows as the database', () => {
  it('badges, the check-in list and the Salesforce file match staff_export_* on the same demo data', async () => {
    const { as } = await openTestDb()
    const admin = 'mei.ortiz@aafe-demo.example.org'
    const db = loadDB()
    expect(plain(await as('authenticated', admin, 'select * from staff_export_badges(true)'))).toEqual(plain(demoBadgeRows(db, true)))
    expect(plain(await as('authenticated', admin, 'select * from staff_export_checkin()'))).toEqual(plain(demoCheckinRows(db)))
    expect(plain(await as('authenticated', admin, 'select * from staff_export_salesforce()'))).toEqual(plain(demoSalesforceRows(db)))
  }, 60_000)
})

describe('who may export, and the change log', () => {
  it('relationship managers export badges, logged with the count; printed ones only when asked', async () => {
    const { api, db } = demo(RM)
    const rows = await api.exportBadges(false)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.badge_status === 'ready' || r.badge_status === 'reprint_needed')).toBe(true)
    expect(db().audit_log.at(-1)).toMatchObject({ action: 'export.badges', actor: RM.name, summary: `Badge file exported: ${rows.length} badge(s).` })
    expect((await api.exportBadges(true)).length).toBeGreaterThanOrEqual(rows.length)
  })

  it('a volunteer gets the check-in list, with no email, and nothing else', async () => {
    const { api, db } = demo(VOL)
    const before = db().audit_log.length
    await expect(api.exportBadges(false)).rejects.toThrow('forbidden')
    await expect(api.exportSalesforce()).rejects.toThrow('forbidden')
    const rows = await api.exportCheckin()
    const text = JSON.stringify(rows)
    for (const g of db().guests) if (g.email) expect(text).not.toContain(g.email)
    expect(rows.some((r) => r.guest_type === 'unnamed_seat')).toBe(true)
    expect(db().audit_log.length).toBe(before + 1)
    expect(db().audit_log.at(-1)?.action).toBe('export.checkin')
  })

  it('only a gala admin gets the Salesforce file (it carries email)', async () => {
    await expect(demo(RM).api.exportSalesforce()).rejects.toThrow('forbidden')
    const { api, db } = demo(ADMIN)
    const rows = await api.exportSalesforce()
    expect(rows.length).toBe(db().check_ins.filter((c) => c.event_id === db().meta.current_event_id).length)
    expect(db().audit_log.at(-1)?.action).toBe('export.salesforce')
  })

  it('live, each export is one staff_export_* call, and nothing reloads', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    const reload = vi.fn()
    const api = liveApi({ rpc } as unknown as SupabaseClient, reload)
    await api.exportBadges(true); await api.exportCheckin(); await api.exportSalesforce()
    expect(rpc.mock.calls).toEqual([['staff_export_badges', { p_include_printed: true }], ['staff_export_checkin', {}], ['staff_export_salesforce', {}]])
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('the CSV files', () => {
  it('say what the badge says: the table and its name, never a seat number (item 24)', () => {
    const csv = badgeCsv([
      { display_name: 'Dr. Ana Ruiz', first_name: 'Ana', last_name: 'Ruiz', title: 'Director', organization: 'Example Co', table_number: 3, seat_number: 2, sponsor: 'Example Sponsor', guest_type: 'sponsor_guest', badge_status: 'ready', table_name: 'Peony' },
      { display_name: 'Bo Han', first_name: 'Bo', last_name: 'Han', title: null, organization: null, table_number: null, seat_number: null, sponsor: null, guest_type: 'comp_relationship', badge_status: 'ready' },
    ])
    expect(csv[1]).toEqual(['Name on badge', 'First', 'Last', 'Title', 'Organization', 'Table', 'Table name', 'Affiliation'])
    expect(csv[2]).toEqual(['Dr. Ana Ruiz', 'Ana', 'Ruiz', 'Director', 'Example Co', 3, 'Peony', 'Example Sponsor'])   // the badge prints the name as written
    expect(csv[3][6]).toBeNull()   // no table, no name
    expect(csv[3][7]).toBe('Guest of AAFE')
  })

  it('label unnamed seats, arrivals and walk-ins in plain words', () => {
    const list = checkinCsv(demoCheckinRows(loadDB()))
    expect(list[1]).toContain('Access needs')
    expect(list.some((r) => r[7] === 'Unnamed sponsor seat')).toBe(true)
    expect(salesforceCsv([{ first_name: null, last_name: 'Riley Walkin', email: null, title: null, organization: null, sponsor: null, salesforce_account_id: null,
      salesforce_opportunity_id: null, guest_type: 'walk_in', checked_in_at: '2027-05-20T23:00:00Z', check_in_method: 'exception' }])[2][8]).toBe('Walk-in')
  })
})
