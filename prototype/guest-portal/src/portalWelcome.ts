const DISMISSED_IN_MEMORY = new Set<string>()

export const portalWelcomeStorageKey = (token: string) => `aafe-portal-welcome:${token}`

function welcomeIsForced() {
  if (typeof window === 'undefined') return false
  const hashQuery = window.location.hash.split('?').slice(1).join('?')
  try {
    return new URLSearchParams(window.location.search).get('welcome') === '1'
      || new URLSearchParams(hashQuery).get('welcome') === '1'
  } catch {
    return false
  }
}

export function shouldShowPortalWelcome(token: string) {
  if (welcomeIsForced()) return true
  if (DISMISSED_IN_MEMORY.has(token)) return false
  try {
    return window.localStorage.getItem(portalWelcomeStorageKey(token)) !== '1'
  } catch {
    // Storage may be blocked in a private or sandboxed preview; show once this page load.
    return true
  }
}

export function dismissPortalWelcome(token: string) {
  DISMISSED_IN_MEMORY.add(token)
  try {
    window.localStorage.setItem(portalWelcomeStorageKey(token), '1')
  } catch {
    // The in-memory set still prevents another display during this page load.
  }
}

export function resetPortalWelcomeMemoryForTests() {
  DISMISSED_IN_MEMORY.clear()
}
