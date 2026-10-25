// @vitest-environment jsdom
// The prototype banner's demo data menu: only in demo mode. Connected to Supabase, the data is whatever set the database
// holds, and the menu sent testers to Small-demo links that the live set doesn't have (Oct 17).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: {} }) }))

async function banner(live: boolean) {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', live ? 'https://abcdefghijklmnop.supabase.co' : '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', live ? 'test-anon-key' : '')
  const { PrototypeBanner } = await import('./ui')
  render(<PrototypeBanner dataSwitch />)
}
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

describe('the demo data menu', () => {
  it('is offered in demo mode', async () => {
    await banner(false)
    expect(screen.getByRole('combobox')).toBeTruthy()
  })
  it('is hidden in a build connected to Supabase, where it would change nothing', async () => {
    await banner(true)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.getByRole('note').textContent).toContain('synthetic demonstration data only')
  })
})

// Which copy this is (Oct 25): Cornell couldn't tell he was on nightly, and the iPad's Home Screen app has no address bar.
describe('the nightly label', () => {
  async function line(value: string | null) {
    vi.resetModules()
    if (value !== null) vi.stubEnv('VITE_APP_LINE', value)
    document.title = 'AAFE Gala — Staff Operations'
    const { PrototypeBanner } = await import('./ui')
    render(<PrototypeBanner />)
  }
  it('shows "Nightly · test copy" on every screen and in the tab title', async () => {
    await line('nightly')
    expect(screen.getByTestId('app-line').textContent).toBe('Nightly · test copy — not the copy AAFE sees')
    expect(document.title).toBe('Nightly · AAFE Gala — Staff Operations')
  })
  it('shows nothing on stable, or when the setting is left out', async () => {
    for (const value of ['stable', null]) {
      await line(value)
      expect(screen.queryByTestId('app-line')).toBeNull()
      expect(document.title).toBe('AAFE Gala — Staff Operations')
      cleanup(); vi.unstubAllEnvs()
    }
  })
})
