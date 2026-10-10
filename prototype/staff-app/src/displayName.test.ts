// Display names: the demo applies the same rules as the database (name_parts, staff_update_guest), so both modes
// store and print the same name. Invented data only.
import { describe, expect, it } from 'vitest'
import { loadDB, nameParts } from '@shared/data'
import type { StaffUser } from '@shared/types'
import { demoApi } from './api'
// @ts-expect-error plain JavaScript helper shared with the backend tests
import { openTestDb } from '../../scripts/test-db.mjs'

const ADMIN_EMAIL = 'mei.ortiz@aafe-demo.example.org'

describe('display names match the database', () => {
  it('nameParts() fills in names exactly like name_parts()', async () => {
    const { db } = await openTestDb()
    const cases: [string | null, string | null, string | null][] = [
      ['', 'Jane', 'Doe'], ['Dr. Lena Ortiz', 'Lena', 'Ortiz'], ['Maria de la Cruz', null, null], ['Cher', '', ''], ['  Two   Spaces ', '', ''], [null, ' Ana ', '']]
    for (const [d, f, l] of cases) {
      const sql = (await db.query('select * from name_parts($1, $2, $3)', [d, f, l])).rows[0]
      expect(nameParts(d, f, l)).toEqual(sql)
    }
  }, 120_000)

  it('a staff edit stores the same display, first and last name in both modes', async () => {
    const { db, as } = await openTestDb()
    const g = (await db.query(`select id from guests order by id limit 1`)).rows[0].id as string
    let data = loadDB()
    const admin = data.staff_users.find((u) => u.email === ADMIN_EMAIL)! as StaffUser
    const api = demoApi(admin, (fn) => { data = fn(data) }, () => data)
    const edits = [{ display_name: 'Dr. Ana Ruiz', first_name: 'Ana', last_name: 'Ruiz' }, { first_name: 'Anna' }, { display_name: '' }, { last_name: 'Ruiz-Soto' }]
    for (const patch of edits) {
      await as('authenticated', ADMIN_EMAIL, 'select staff_update_guest($1, $2)', [g, patch])
      await api.updateGuest(g, patch)
      const sql = (await db.query('select display_name, first_name, last_name from guests where id = $1', [g])).rows[0]
      const demo = data.guests.find((x) => x.id === g)!
      expect({ display_name: demo.display_name, first_name: demo.first_name, last_name: demo.last_name }).toEqual(sql)
    }
    expect(data.guests.find((x) => x.id === g)!.display_name).toBe('Anna Ruiz-Soto')   // cleared, then follows first and last
  }, 120_000)
})
