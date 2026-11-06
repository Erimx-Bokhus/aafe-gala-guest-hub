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
