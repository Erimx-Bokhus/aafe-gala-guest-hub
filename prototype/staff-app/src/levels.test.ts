// Sponsorship levels, one list per gala (decided Oct 14), in demo mode: the same rules as staff_save_level,
// staff_copy_levels and staff_retire_level (scripts/test-levels.mjs checks the database).
import { describe, expect, it } from 'vitest'
import { levelsOf, loadDB } from '@shared/data'
import type { DB, StaffUser } from '@shared/types'
import { demoApi } from './api'

const staff = (role: StaffUser['role']): StaffUser => ({ id: `st-${role}`, name: `Test ${role}`, email: `${role}@aafe-demo.example.org`, role })
const ADMIN = staff('gala_admin'), RM = staff('relationship_manager')
function demo(user: StaffUser, change: (d: DB) => DB = (d) => d) {
  let data = change(loadDB())
  const api = demoApi(user, (fn) => { data = fn(data) }, () => data)
  return { api, db: () => data }
}
const level = { name: 'Diamond — Presenting Sponsor', contribution_amount: 100000, included_seat_count: 20, tier_category: 'sponsorship' as const, guaranteed_seating: true, required_materials: ['logo'] }

describe('sponsorship levels in the staff app', () => {
  it("each gala has its own levels; the pickers show this gala's", () => {
    const db = loadDB()
    const cur = levelsOf(db)
    expect(cur.length).toBeGreaterThan(0)
    expect(cur.every((t) => t.event_id === db.meta.current_event_id)).toBe(true)
    expect(levelsOf(db, 'ev-2026').every((t) => t.id.endsWith('-2026'))).toBe(true)
  })

  it('a gala admin adds and edits a level; a relationship manager cannot', async () => {
    const { api, db } = demo(ADMIN)
    await api.saveLevel(db().meta.current_event_id, level)
    const added = levelsOf(db()).find((t) => t.name === level.name)!
    expect(added.included_seat_count).toBe(20)
    await api.saveLevel(db().meta.current_event_id, { ...level, id: added.id, included_seat_count: 24 })
    expect(levelsOf(db()).find((t) => t.id === added.id)!.included_seat_count).toBe(24)
    expect(db().audit_log.filter((a) => a.entity_id === added.id).map((a) => a.action)).toEqual(['level.created', 'level.updated'])
    await expect(demo(RM).api.saveLevel(db().meta.current_event_id, level)).rejects.toThrow('forbidden')
  })

  it('refuses a second level with the same name, and a closed gala', async () => {
    const { api, db } = demo(ADMIN)
    const name = levelsOf(db())[0].name
    await expect(api.saveLevel(db().meta.current_event_id, { ...level, name: name.toUpperCase() })).rejects.toThrow('already has a level')
    await expect(api.saveLevel('ev-2026', level)).rejects.toThrow('not_found')
  })

  it("starts next year's levels from this year's, once; retired levels aren't copied", async () => {
    const next = (d: DB): DB => ({ ...d, gala_events: [...d.gala_events, { ...d.gala_events.find((e) => e.id === d.meta.current_event_id)!, id: 'ev-2028', year: 2028, name: 'AAFE 54th Annual Gala (demo)', status: 'planning' }] })
    const { api, db } = demo(ADMIN, next)
    const cur = db().meta.current_event_id
    const retired = levelsOf(db()).find((t) => t.tier_category === 'ticket')!
    await api.retireLevel(retired.id, true)
    await api.copyLevels(cur, 'ev-2028')
    const copied = levelsOf(db(), 'ev-2028')
    expect(copied.length).toBe(levelsOf(db(), cur).filter((t) => t.tier_category !== 'complimentary').length)
    expect(copied.some((t) => t.name === retired.name)).toBe(false)
    await expect(api.copyLevels(cur, 'ev-2028')).rejects.toThrow('already has levels')
  })
})
