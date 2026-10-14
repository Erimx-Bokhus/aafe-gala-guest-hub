// @vitest-environment jsdom
// The staff app reads its data again while it's open (the Oct 12 audit's "frozen list" finding): every 30 seconds
// while on screen, and when the tab comes back into view; never while hidden, and once when both events fire.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { useRefreshWhileOpen } from './useRefreshWhileOpen'

function Probe({ reload }: { reload: (() => void) | null }) { useRefreshWhileOpen(reload); return null }
let hidden = false
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  hidden = false
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('useRefreshWhileOpen', () => {
  it('reloads every 30 seconds while the app is on screen', () => {
    const reload = vi.fn()
    render(<Probe reload={reload} />)
    vi.advanceTimersByTime(29_000); expect(reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1_000); expect(reload).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(30_000); expect(reload).toHaveBeenCalledTimes(2)
  })

  it('waits while the tab is hidden, and reloads once when it comes back', () => {
    const reload = vi.fn()
    render(<Probe reload={reload} />)
    hidden = true
    vi.advanceTimersByTime(90_000); expect(reload).not.toHaveBeenCalled()
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does nothing when turned off (demo mode, signed out)', () => {
    render(<Probe reload={null} />)
    vi.advanceTimersByTime(120_000)
    window.dispatchEvent(new Event('focus'))
  })
})
