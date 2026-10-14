import { useEffect, useRef } from 'react'

/**
 * Reads the data again while the app is open: when the tab comes back into view, and every `everyMs` while it's on
 * screen. Sponsors on the portal, the iPads at the door and other staff change the data too, and the app otherwise
 * read it only at sign-in and after this person's own changes (the Oct 12 audit's "frozen list" finding).
 * A reload keeps the data on screen until the new answer arrives, and a cell being edited keeps what's typed
 * unless that same value changed, so nothing open is cleared. Pass null to turn it off (demo mode, signed out).
 */
export function useRefreshWhileOpen(reload: (() => void) | null, everyMs = 30_000) {
  const last = useRef(Date.now())
  useEffect(() => {
    if (!reload) return
    const again = () => {
      // Hidden tabs wait; coming back into view fires both "visible" and "focus", so a second call within 5 s is skipped.
      if (document.visibilityState !== 'visible' || Date.now() - last.current < 5_000) return
      last.current = Date.now()
      reload()
    }
    const timer = setInterval(again, everyMs)
    document.addEventListener('visibilitychange', again)
    window.addEventListener('focus', again)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', again)
      window.removeEventListener('focus', again)
    }
  }, [reload, everyMs])
}
