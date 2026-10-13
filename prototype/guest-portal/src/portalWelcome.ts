const DISMISSED_IN_MEMORY = new Set<string>()

// The key holds a short fingerprint of the sponsor's link, never the link itself: the link is a secret (CLAUDE.md
// rule 6) and browser storage outlives the page. FNV-1a, 32 bits: enough to tell one sponsor's links apart on one
// device, and it can't be turned back into the link.
function fingerprint(token: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < token.length; i++) { h ^= token.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(16).padStart(8, '0')
}

export const portalWelcomeStorageKey = (token: string) => `aafe-portal-welcome:${fingerprint(token)}`

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
