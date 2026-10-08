// @vitest-environment jsdom
// The demo data switch: the chosen set loads; an unknown or blocked choice falls back to the small set.
import { afterEach, expect, test, vi } from 'vitest'
import { demoSet, loadDB } from './data'

afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

test('loads the set saved in this browser', () => {
  localStorage.setItem('aafe-demo-data', 'full-fixed')
  expect(demoSet()).toBe('full-fixed')
  const db = loadDB()
  expect(db.guests).toHaveLength(553)
  expect(db.email_log.filter((e) => e.status !== 'queued').every((e) => e.approved_at)).toBe(true)
})

test('an unknown choice falls back to the small set', () => {
  localStorage.setItem('aafe-demo-data', 'nonsense')
  expect(demoSet()).toBe('small')
  expect(loadDB().guests).toHaveLength(48)
})

test('blocked storage falls back to the small set', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  expect(demoSet()).toBe('small')
})
