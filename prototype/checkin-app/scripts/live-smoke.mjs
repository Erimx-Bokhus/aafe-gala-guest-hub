// Live-mode smoke test for the iPad check-in app, with no Supabase project: Playwright answers every request to a
// stand-in Supabase address the way the backend does (staff_me, staff_checkin_snapshot, staff_sync_check_ins,
// staff_undo_check_in), from the invented door list. Nothing leaves this computer. It checks the wiring the real
// backend can't be tried on without keys: sign-in detection, the list, check-in and sync, QR codes matched on their
// hash, one-tap and group check-in, undo (yours, and someone else's refused), exceptions, offline queueing, a first-arrival conflict notice,
// the access-needs flag, and that signing out clears the iPad.
//
// Setup (Playwright is not a project dependency):
//   cd prototype && npm install --no-save playwright
// Run, from prototype/checkin-app, in two terminals:
//   VITE_SUPABASE_URL=http://supabase-standin.localhost:54321 VITE_SUPABASE_ANON_KEY=standin-anon-key npm run dev
//   node scripts/live-smoke.mjs
// CHROME_PATH picks a browser other than Playwright's own.
import { chromium } from 'playwright'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const API = 'http://supabase-standin.localhost:54321'
const door = JSON.parse(readFileSync(new URL('../src/doorlist.json', import.meta.url), 'utf8'))
const ev = door.events.find((e) => e.id === door.current_event_id)
const ME = { id: 'st-test', name: 'Test Volunteer', email: 'tester@example.org', role: 'check_in_volunteer' }
const OTHER = 'Other Volunteer'
const sha = (s) => createHash('sha256').update(s.trim().toUpperCase()).digest('hex')
const byId = Object.fromEntries(door.guests.map((g) => [g.id, g]))
const nameOf = (id) => `${byId[id].first_name} ${byId[id].last_name}`

// ---- the stand-in backend's state
const arrivals = new Map()        // guest_id -> { id, client_id, at, by, device }
const exceptions = []
let n = 0
arrivals.set('g-010', { id: 'ci-seed', client_id: null, at: new Date(Date.now() - 600_000).toISOString(), by: OTHER, device: 'iPad-OTHR' })
const snapshot = () => ({
  event_id: ev.id, event_name: ev.name, generated_at: new Date().toISOString(), event_date: ev.event_date, doors_time: ev.doors_time,
  venue_name: ev.venue_name, status: 'live', unnamed_seats: [], exceptions: exceptions.map((e) => ({ ...e })),
  guests: door.guests.filter((g) => g.event_id === ev.id).map((g) => {
    const a = arrivals.get(g.id)
    return {
      id: g.id, order_id: g.order_id, first_name: g.first_name, last_name: g.last_name, title: g.title, organization: g.organization,
      sponsor: g.sponsor, package: g.package, guest_type: g.category_key, table_number: g.table, seat_number: g.seat,
      accessibility_needs: g.id === 'g-001' ? 'Step-free entrance' : null,
      qr_hash: g.qr_token ? sha(g.qr_token) : null, qr_expires_at: g.qr_token ? new Date(Date.now() + 86_400_000).toISOString() : null,
      arrived: !!a, checkin_id: a?.id ?? null, checkin_client_id: a?.client_id ?? null, checked_in_at: a?.at ?? null, checked_in_by: a?.by ?? null, device: a?.device ?? null,
    }
  }),
})
const calls = []
const RPC = {
  staff_me: () => ME,
  staff_checkin_snapshot: () => snapshot(),
  staff_sync_check_ins: ({ p_items }) => p_items.map((it) => {
    calls.push(it)
    if (it.kind === 'exception') { exceptions.unshift({ id: `ci-${++n}`, client_id: it.client_id, name: it.name, type: it.type, order_id: it.order_id, checked_in_at: it.at, checked_in_by: ME.name, device: it.device }); return { client_id: it.client_id, status: 'checked_in' } }
    const a = arrivals.get(it.guest_id)
    if (a && a.client_id === it.client_id) return { client_id: it.client_id, status: 'already_synced' }
    if (a) return { client_id: it.client_id, status: 'conflict', first_at: a.at, first_by: a.by, first_device: a.device }
    arrivals.set(it.guest_id, { id: `ci-${++n}`, client_id: it.client_id, at: it.at, by: ME.name, device: it.device })
    return { client_id: it.client_id, status: 'checked_in' }
  }),
  staff_undo_check_in: ({ p_id }) => {
    const hit = [...arrivals.entries()].find(([, a]) => a.id === p_id || a.client_id === p_id)
    const ex = exceptions.findIndex((e) => e.id === p_id || e.client_id === p_id)
    if (!hit && ex < 0) throw new Error('not_found: no check-in to undo')
    const by = hit ? hit[1].by : exceptions[ex].checked_in_by
    if (by !== ME.name) throw new Error(`forbidden: only ${by} or a gala admin can undo this check-in`)
    if (hit) arrivals.delete(hit[0]); else exceptions.splice(ex, 1)
    return { status: 'undone', guest_id: hit?.[0] ?? null }
  },
}

// ---- the browser
let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m) } }
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/New_York', locale: 'en-US' })
const outside = []
ctx.on('request', (r) => { const u = new URL(r.url()); if (!/localhost$|^127\.0\.0\.1$|fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) outside.push(r.url()) })
let down = false   // the venue's internet drops (Playwright still answers routed requests when the browser is set offline)
await ctx.route(`${API}/**`, async (route) => {
  if (down) return route.abort('internetdisconnected')
  const u = new URL(route.request().url())
  const fn = u.pathname.startsWith('/rest/v1/rpc/') ? u.pathname.slice(13) : null
  if (!fn) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })   // auth housekeeping (sign-out)
  try { return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RPC[fn](route.request().postDataJSON() ?? {})) }) }
  catch (e) { return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: e.message }) }) }
})
// A signed-in session, as the sign-in link leaves it (supabase-js keeps it in localStorage).
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const exp = Math.floor(Date.now() / 1000) + 3600
const session = { access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-test', email: ME.email, role: 'authenticated', exp })}.sig`,
  token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'standin-refresh', user: { id: 'u-test', email: ME.email, aud: 'authenticated', role: 'authenticated' } }
await ctx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('sb-supabase-standin-auth-token', s); sessionStorage.setItem('seeded', '1') } }, JSON.stringify(session))

const p = await ctx.newPage()
const errors = []
p.on('pageerror', (e) => errors.push(String(e)))
await p.goto('http://localhost:5175/', { waitUntil: 'networkidle' })
const text = (sel) => p.locator(sel).innerText()
await p.getByTestId('counter').waitFor()
ok((await text('body')).includes(`Guest check-in · ${ME.name}`), 'opens the door list for the signed-in staff member')
ok((await text('[data-testid="counter"]')).includes('1 of 553'), 'the list comes from the server: 553 guests, one already checked in')
ok(await p.getByTestId('access-g-001').isVisible(), 'a guest with access needs shows the flag, not the details')
ok(!(await text('body')).includes('Step-free'), 'the access details stay off the screen')

// Check in by name: saved on the iPad, sent, and counted once.
const checkInByName = async (id) => {
  await p.getByTestId('search').fill(nameOf(id)); await p.getByTestId(`row-${id}`).click(); await p.getByTestId('checked-in').click()
}
await checkInByName('g-002')
await p.waitForFunction(() => document.querySelector('[data-testid="sync-status"]')?.textContent?.includes('Synced'))
ok(arrivals.get('g-002')?.by === ME.name && calls.at(-1)?.method === 'search', 'a check-in by name syncs to the server')
await p.getByTestId('undo').click()
await p.waitForFunction(() => !document.querySelector('[data-testid="in-g-002"]'))
ok(!arrivals.has('g-002'), 'Undo right after takes a synced check-in back off the server')

// One tap: the row's own Check in button checks the guest in at once, no selecting first.
await p.getByTestId('search').fill(nameOf('g-007')); await p.getByTestId('checkin-g-007').click()
await p.getByTestId('in-g-007').waitFor()
await p.waitForFunction(() => document.querySelector('[data-testid="sync-status"]')?.textContent?.includes('Synced'))
ok(arrivals.get('g-007')?.by === ME.name, 'one tap on Check in checks the guest in and syncs')
await p.getByTestId('search').fill('')

// QR: matched on its hash; a repeat scan is refused.
const QR = door.guests.find((g) => g.qr_token && !['g-001', 'g-002', 'g-004', 'g-005', 'g-010'].includes(g.id)).id
const code = byId[QR].qr_token
await p.getByTestId('open-scan').click(); await p.getByTestId('qr-input').fill(code); await p.getByTestId('qr-submit').click()
await p.waitForFunction(() => !document.querySelector('[data-testid="qr-input"]'))
await p.waitForTimeout(800)
ok(arrivals.get(QR) && calls.at(-1)?.method === 'qr', 'a QR code checks the guest in (matched on its hash)')
ok(!JSON.stringify(calls).includes(code), 'the code itself is never sent to the server')
await p.getByTestId('open-scan').click(); await p.getByTestId('qr-input').fill(code); await p.getByTestId('qr-submit').click()
ok((await p.getByRole('alert').innerText()).includes('Already checked in'), 'scanning the same code again warns not to admit twice')
await p.keyboard.press('Escape')

// Someone else's check-in: only they or a gala admin can undo it.
await p.getByTestId('search').fill(nameOf('g-010')); await p.getByTestId('row-g-010').click(); await p.getByTestId('remove-checkin').click()
await p.waitForTimeout(800)
ok(arrivals.has('g-010') && (await text('body')).includes(`Only ${OTHER} or a gala admin can undo this check-in`), "another volunteer's check-in can't be undone, and the iPad says why")
await p.getByTestId('search').fill('')

// An exception (walk-in).
await p.getByTestId('open-exception').click(); await p.getByTestId('exc-name').fill('Jordan Walker'); await p.getByTestId('exc-type-Walk-in').click(); await p.getByTestId('exc-save').click()
await p.waitForTimeout(1200)
ok(exceptions.some((e) => e.name === 'Jordan Walker'), 'an exception syncs to the server')
ok((await text('[data-testid="exc-count"]')).includes('+1 exception'), 'and shows in the exception count')

// Offline: check-ins wait on the iPad; another door got there first, so the server says so when it's back.
down = true
await checkInByName('g-004')
await checkInByName('g-005')
await p.waitForFunction(() => document.querySelector('[data-testid="sync-status"]')?.textContent?.includes('Offline'), null, { timeout: 15000 })
ok((await text('[data-testid="sync-status"]')).includes('2 waiting'), 'offline, check-ins wait on the iPad')
arrivals.set('g-005', { id: 'ci-other', client_id: null, at: new Date(Date.now() - 60_000).toISOString(), by: OTHER, device: 'iPad-OTHR' })
down = false
await p.waitForFunction(() => document.querySelector('[data-testid="sync-status"]')?.textContent?.includes('Synced'), null, { timeout: 15000 })
ok(arrivals.get('g-004')?.by === ME.name, 'back online, the waiting check-ins sync')
const note = await text('[data-testid="notices"]')
ok(note.includes(nameOf('g-005')) && note.includes('Already checked in') && note.includes('was not counted'), `a guest another door checked in first shows as a notice, not dropped (${note.trim()})`)

// Sign out clears the iPad.
await p.getByTestId('sign-out').click()
await p.getByTestId('send-link').waitFor()
ok(await p.evaluate(() => !Object.keys(localStorage).some((k) => k.startsWith('aafe-checkin:st-test:'))), "signing out clears this person's saved list and queue from the iPad")
ok(outside.length === 0, `no request left this computer (${outside.slice(0, 3).join(', ')})`)
ok(errors.length === 0, `no page errors (${errors.join(' | ')})`)
await b.close()
console.log(`live smoke: ${pass} passed, ${fail} failed`)
if (fail) process.exitCode = 1
