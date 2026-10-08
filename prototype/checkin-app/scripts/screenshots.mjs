// Retakes the iPad check-in screenshots in docs/screenshots/ipad-checkin/ that show guest rows or the scanner:
// 02 guest list, 05 checked in, 06 QR scan, 09 portrait, 10 repeat-scan warning, 11 exceptions list,
// 12 dark mode and 13 keyboard search (both searching "Park").
// Same steps, times and counts every run: Kenji Abe signs in, check-ins at 9:37 PM on the seed's evening,
// Eddie Chan's code is scanned twice, Jordan Rivera is a walk-in. Run it after changing the door list.
//
// Setup (Playwright is not a project dependency):
//   cd prototype && npm install --no-save playwright && npx playwright install chromium
// Run, from prototype/checkin-app, in three terminals:
//   DATA_FILE=/tmp/checkin-shots.json npm run sync-server   # a fresh sync file, so the seed state is used
//   npm run dev
//   node scripts/screenshots.mjs ../../docs/screenshots/ipad-checkin
// Delete /tmp/checkin-shots.json before each run. CHROME_PATH picks a browser other than Playwright's own.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const door = JSON.parse(readFileSync(new URL('../src/doorlist.json', import.meta.url), 'utf8'))

const OUT = process.argv[2]
if (!OUT) throw new Error('Usage: node scripts/screenshots.mjs <output folder>')
const launch = { executablePath: process.env.CHROME_PATH || undefined }
// Behind a proxy (a cloud container), the Inter font from Google Fonts only loads through it.
if (process.env.HTTPS_PROXY) launch.proxy = { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }
const b = await chromium.launch(launch)
// iPad landscape at 2x, New York time.
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, timezoneId: 'America/New_York', locale: 'en-US', ignoreHTTPSErrors: !!process.env.HTTPS_PROXY })
// Camera state as on an iPad that refused the camera: scanning is supported, permission was not given.
await ctx.addInitScript(() => {
  window.BarcodeDetector = class { async detect() { return [] } }
  if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error('denied'))
})
const p = await ctx.newPage()
await p.clock.install({ time: new Date('2026-10-01T01:37:05Z') }) // 9:37 PM in New York, the evening of the seed check-ins
await p.goto('http://localhost:5175/', { waitUntil: 'networkidle' })
await p.evaluate(() => document.fonts.ready)
if (!(await p.evaluate(() => document.fonts.check('16px Inter')))) console.warn('Inter did not load: the shots will use a fallback font')
await p.getByTestId('vol-st-kenji').click()
await p.getByTestId('start').click()
await p.getByText('Synced · live').waitFor()

const settle = async () => { await p.waitForTimeout(400); await p.getByText('Synced · live').waitFor() }
const shot = async (name) => { await p.mouse.move(0, 0); await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/${name}` }); console.log('wrote', name) }
const toastGone = () => p.waitForTimeout(11000) // the undo toast lasts 10 seconds
const checkIn = async (id, name) => {
  await p.getByTestId('search').fill(name); await p.getByTestId(`row-${id}`).click()
  await p.getByTestId('checked-in').click(); await settle()
  await p.getByTestId('search').blur(); await p.waitForTimeout(500)
}

await shot('02-guest-list.png')

// Two sponsor guests (the search and multi-select screenshots), then three at once.
await checkIn('g-001', 'Evelyn Park')
await checkIn('g-002', 'Marcus Bell')
await toastGone()
for (const id of ['g-218', 'g-060', 'g-395']) await p.getByTestId(`row-${id}`).click()
await p.getByTestId('checked-in').click(); await settle()
await shot('05-checked-in.png')
await toastGone()

// Eddie Chan's code, typed because the camera is refused; then the same code again.
const CODE = door.guests.find((g) => g.first_name === 'Eddie' && g.last_name === 'Chan').qr_token
await p.getByTestId('open-scan').click()
await p.getByText('Camera permission was not given.').waitFor()
await p.getByTestId('qr-input').fill(CODE)
await shot('06-qr.png')
const at = (mm) => p.clock.setSystemTime(new Date(`2026-10-01T01:${mm}:05Z`)) // 9:<mm> PM in New York, however long the waits took
await at('38')
await p.getByTestId('qr-submit').click(); await settle()
await toastGone()
await p.getByTestId('open-scan').click()
await p.getByTestId('qr-input').fill(CODE)
await p.getByTestId('qr-submit').click()
await p.getByRole('alert').waitFor()
await p.getByTestId('qr-input').blur()
await shot('10-repeat-scan-warning.png')
await p.keyboard.press('Escape'); await p.waitForTimeout(300)
if (await p.getByTestId('qr-input').count()) await p.getByText('Back to guest list').click()

// A walk-in, then the exceptions list.
await p.getByTestId('open-exception').click()
await p.getByTestId('exc-name').fill('Jordan Rivera')
await p.getByTestId('exc-type-Walk-in').click()
await at('38')
await p.getByTestId('exc-save').click(); await settle()
await toastGone()
await p.getByTestId('exc-count').click()
await p.getByTestId('exc-list').waitFor()
await shot('11-exceptions-list.png')
await p.keyboard.press('Escape'); await p.waitForTimeout(300)

// Five more arrivals, then iPad portrait.
for (const [id, name] of [['g-003', 'Sofia Reyes'], ['g-004', 'Hao Zhang'], ['g-005', 'Amara Okoye'], ['g-006', 'Liam Nguyen'], ['g-451', 'Bridget Khan']]) await checkIn(id, name)
await toastGone()
await p.setViewportSize({ width: 820, height: 1180 }); await p.waitForTimeout(500)
await shot('09-portrait.png')

// A search for "Park" in dark mode, then in light mode with the on-screen keyboard taking the lower half.
await p.setViewportSize({ width: 1180, height: 820 }); await p.waitForTimeout(500)
await p.getByTestId('search').fill('Park'); await p.getByTestId('search').blur()
await p.getByRole('button', { name: 'Switch to dark mode' }).click(); await p.waitForTimeout(500)
await shot('12-dark-mode.png')
await p.getByRole('button', { name: 'Switch to light mode' }).click()
await p.setViewportSize({ width: 1180, height: 420 }); await p.getByTestId('search').focus(); await p.waitForTimeout(500)
await shot('13-keyboard-search.png')
await b.close()
