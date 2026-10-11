import { useEffect, useRef } from 'react'
import type { Lang } from './i18n'

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

type Props = {
  lang: Lang
  invitationText: string
  title: string
  description: string
  date: string
  doors?: string
  venue: string
  city?: string
  action: string
  onClose: () => void
}

export default function WelcomeScreen({ lang, invitationText, title, description, date, doors, venue, city, action, onClose }: Props) {
  const dialogRef = useRef<HTMLElement>(null)
  const actionRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    actionRef.current?.focus({ preventScroll: true })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      } else if (!dialog.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.getElementById('seats-h')?.focus({ preventScroll: true })
    }
  }, [onClose])

  return (
    <div className="welcome-overlay">
      <section ref={dialogRef} className="welcome-dialog" role="dialog" aria-modal="true" aria-labelledby="welcome-title" aria-describedby="welcome-description" lang={lang} tabIndex={-1}>
        <div className="welcome-artwork hero-glass-hero force-light">
          <div className="hero-glass-blobs" aria-hidden="true">
            <span className="hero-glass-blob hero-glass-blob-1" />
            <span className="hero-glass-blob hero-glass-blob-2" />
            <span className="hero-glass-blob hero-glass-blob-3" />
            <span className="hero-glass-blob hero-glass-blob-4" />
            <span className="hero-glass-blob hero-glass-blob-5" />
          </div>
          <div className="hero-glass-layer" aria-hidden="true" />
          <div className="hero-glass-texture" aria-hidden="true">
            <span className="hero-glass-noise-fine" />
            <span className="hero-glass-noise-frost" />
          </div>
          <div className="hero-glass-highlight" aria-hidden="true" />
          <img src="./brand/gala-flower-top-right.png" alt="" aria-hidden="true" className="welcome-flower welcome-flower-top" />
          <img src="./brand/gala-flower-bottom-left.png" alt="" aria-hidden="true" className="welcome-flower welcome-flower-bottom" />
          <p className="welcome-artwork-title">{invitationText}</p>
        </div>
        <div className="welcome-copy-block">
          <h1 id="welcome-title" className="welcome-title">{title}</h1>
          <p id="welcome-description" className="welcome-description">{description}</p>
          <div className="welcome-event" aria-label={date}>
            <div>
              <p className="welcome-event-main">{date}</p>
              {doors && <p className="welcome-event-secondary">{doors}</p>}
            </div>
            <div>
              <p className="welcome-event-main">{venue}</p>
              {city && <p className="welcome-event-secondary">{city}</p>}
            </div>
          </div>
          <button ref={actionRef} type="button" className="welcome-primary" onClick={onClose}>{action}</button>
        </div>
      </section>
    </div>
  )
}
