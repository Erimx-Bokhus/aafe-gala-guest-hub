import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The iPad app as an installable app (PWA): install file, icons, and the offline helper.
const pub = new URL('../shared/public/', import.meta.url)
const manifest = JSON.parse(readFileSync(new URL('checkin/manifest.webmanifest', pub), 'utf8'))
const html = readFileSync(new URL('../checkin-app/index.html', import.meta.url), 'utf8')
const sw = readFileSync(new URL('checkin-sw.js', pub), 'utf8')

describe('iPad app installs as "AAFE Check-in"', () => {
  it('has an install file that opens full screen', () => {
    expect(manifest.short_name).toBe('AAFE Check-in')
    expect(manifest.display).toBe('standalone')
    expect(html).toContain('rel="manifest" href="./checkin/manifest.webmanifest"')
    expect(html).toContain('rel="apple-touch-icon" href="./checkin/icon-180.png"')
  })

  it('has every icon it lists', () => {
    for (const i of manifest.icons) expect(existsSync(new URL(`checkin/${i.src}`, pub)), i.src).toBe(true)
    expect(existsSync(new URL('checkin/icon-180.png', pub))).toBe(true)
  })

  it('keeps only the app itself offline, never the server or guest data', () => {
    expect(sw).toContain("url.origin !== self.location.origin")   // Supabase and fonts are other origins: not stored
    expect(sw).toContain("url.pathname.includes('/api/')")         // the demo sync server: not stored
    expect(sw).toContain("req.method !== 'GET'")                    // check-ins are never cached
  })
})
