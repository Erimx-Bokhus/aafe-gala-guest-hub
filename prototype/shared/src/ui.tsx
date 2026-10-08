import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { AArrowDown, AArrowUp, Globe, Moon, Sun, X } from 'lucide-react'
import { chooseDemoSet, DEMO_SET_LABEL, demoSet, type DemoSet } from './data'

// ---------- hash router (works on any static host) ----------
// Hash router that also works inside sandboxed preview iframes (where the host page
// can rewrite or block plain <a href="#/..."> navigation). Internal links are
// intercepted and routed in memory; the URL hash is updated when allowed.
const readHash = () => { try { return (window.location.hash.replace(/^#/, '') || '/').split('?')[0] } catch { return '/' } }
let currentPath = readHash()
const routeListeners = new Set<(p: string) => void>()
const emitRoute = (p: string) => { currentPath = p; routeListeners.forEach((fn) => fn(p)); try { window.scrollTo(0, 0) } catch { /* ignore */ } }
export const go = (to: string) => {
  const p = to.replace(/^#/, '') || '/'
  emitRoute(p)
  try { if (readHash() !== p) history.pushState(null, '', '#' + p) } catch { try { window.location.hash = p } catch { /* in-memory only */ } }
}
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as HTMLElement | null)?.closest?.('a[href^="#/"]') as HTMLAnchorElement | null
    if (!a || a.target === '_blank') return
    e.preventDefault()
    go(a.getAttribute('href')!.slice(1))
  }, true)
  window.addEventListener('hashchange', () => { const p = readHash(); if (p !== currentPath) emitRoute(p) })
  window.addEventListener('popstate', () => { const p = readHash(); if (p !== currentPath) emitRoute(p) })
}
export function useRoute() {
  const [path, setPath] = useState(currentPath)
  useEffect(() => { routeListeners.add(setPath); setPath(currentPath); return () => { routeListeners.delete(setPath) } }, [])
  return path
}
export function Link({ to, className, children, ...rest }: { to: string; className?: string; children: ReactNode; 'aria-current'?: 'page' | undefined; title?: string }) {
  return <a href={`#${to}`} className={className} {...rest}>{children}</a>
}

// ---------- display preferences: theme + text size (in memory; no storage in sandboxed previews) ----------
const SIZES = [87.5, 100, 112.5, 125, 137.5]
export function useDisplayPrefs() {
  const [dark, setDark] = useState(false) // always open in light mode; the Sun/Moon toggle switches
  const [size, setSize] = useState(1)
  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])
  useEffect(() => { document.documentElement.style.fontSize = `${SIZES[size]}%` }, [size])
  return { dark, toggleDark: () => setDark((d) => !d), size, smaller: () => setSize((s) => Math.max(0, s - 1)), larger: () => setSize((s) => Math.min(SIZES.length - 1, s + 1)), canSmaller: size > 0, canLarger: size < SIZES.length - 1 }
}
export type Prefs = ReturnType<typeof useDisplayPrefs>

export function DisplayControls({ prefs, labels, onDark }: { prefs: Prefs; labels?: { smaller: string; larger: string; theme: string }; onDark?: boolean }) {
  const l = labels ?? { smaller: 'Smaller text', larger: 'Larger text', theme: prefs.dark ? 'Switch to light mode' : 'Switch to dark mode' }
  const cls = onDark ? 'inline-flex h-9 w-9 items-center justify-center rounded-md text-navy-100 hover:bg-white/10 disabled:opacity-40' : 'icon-btn'
  return (
    <div className="flex items-center gap-1">
      <button className={cls} onClick={prefs.smaller} disabled={!prefs.canSmaller} aria-label={l.smaller} title={l.smaller}><AArrowDown size={18} /></button>
      <button className={cls} onClick={prefs.larger} disabled={!prefs.canLarger} aria-label={l.larger} title={l.larger}><AArrowUp size={18} /></button>
      <button className={cls} onClick={prefs.toggleDark} aria-label={l.theme} title={l.theme}>{prefs.dark ? <Sun size={18} /> : <Moon size={18} />}</button>
    </div>
  )
}

export function LanguageSelect<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[]; label: string }) {
  return (
    <label className="relative inline-flex h-9 items-center rounded-md border border-navy-100 bg-surface pl-2.5 pr-1 text-sm text-navy-800 hover:bg-navy-50 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand-500">
      <Globe size={16} className="text-navy-500" aria-hidden />
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="cursor-pointer appearance-none bg-transparent py-1 pl-2 pr-6 text-sm font-medium focus:outline-none">
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <svg className="pointer-events-none absolute right-2 text-navy-500" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 4.5l3 3 3-3" /></svg>
    </label>
  )
}

// ---------- banners / pills ----------
/** dataSwitch: the staff app and portal let you pick a demo data set; the iPad app has its own door list. */
export function PrototypeBanner({ dataSwitch = false }: { dataSwitch?: boolean }) {
  return <div role="note" className="proto-banner no-print px-4 py-1.5 text-center text-xs font-medium tracking-wide">
    Capstone prototype — synthetic demonstration data only. Not a production AAFE system.
    {dataSwitch && <label className="ml-2 inline-flex items-center gap-1">Demo data:
      <select value={demoSet()} onChange={(e) => chooseDemoSet(e.target.value as DemoSet)} className="rounded bg-transparent font-semibold underline decoration-dotted">
        {(Object.keys(DEMO_SET_LABEL) as DemoSet[]).map((k) => <option key={k} value={k}>{DEMO_SET_LABEL[k]}</option>)}
      </select></label>}
  </div>
}
const PILL: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-200', amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-rose-50 text-rose-800 ring-rose-200', blue: 'bg-brand-50 text-brand-700 ring-brand-200',
  gray: 'bg-navy-50 text-navy-700 ring-navy-100', brand: 'bg-brand-50 text-brand-600 ring-brand-200',
}
export type Tone = keyof typeof PILL
export function Pill({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${PILL[tone]}`}>{children}</span>
}

// ---------- modal / toast / field ----------
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
export function Modal({ open, onClose, title, children, wide, closeLabel = 'Close' }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; closeLabel?: string }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // Remember what had focus when the dialog opened, so focus can go back there on close.
  // Captured during render because autoFocus inside the dialog moves focus before effects run.
  const openerRef = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  if (open && !wasOpen.current && typeof document !== 'undefined') openerRef.current = document.activeElement as HTMLElement | null
  wasOpen.current = open
  useEffect(() => {
    if (!open) return
    const box = boxRef.current
    if (box && !box.contains(document.activeElement)) box.focus()
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeRef.current(); return }
      if (e.key !== 'Tab' || !box) return
      // Keep Tab / Shift+Tab inside the dialog
      const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (!items.length) return
      const first = items[0], last = items[items.length - 1], active = document.activeElement
      if (e.shiftKey && (active === first || active === box)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
      else if (!box.contains(active)) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', k)
    return () => {
      window.removeEventListener('keydown', k)
      const opener = openerRef.current
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-6" onMouseDown={onClose}>
      <div ref={boxRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(e) => e.stopPropagation()} className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-surface shadow-2xl outline-none sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
        <div className="flex items-center justify-between border-b border-navy-100 px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold text-navy-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-navy-500 hover:bg-navy-50" aria-label={closeLabel} title={closeLabel}><X size={20} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
export function Toast({ msg, onDone }: { msg: string | null; onDone: () => void }) {
  useEffect(() => { if (msg) { const t = setTimeout(onDone, 3200); return () => clearTimeout(t) } }, [msg, onDone])
  if (!msg) return null
  return <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-xl">{msg}</div>
}
export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string; children: ReactNode; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-navy-800">{label}</label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-navy-500">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-xs font-medium text-rose-700">{error}</p>}
    </div>
  )
}

// ---------- formatting / export ----------
export const money = (n: number, cents = false) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
export function fmtDate(iso: string, loc = 'en-US', withTime = false) {
  const d = iso.length === 10 ? new Date(iso + 'T12:00:00') : new Date(iso)
  return d.toLocaleString(loc, withTime ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' } : { month: 'long', day: 'numeric', year: 'numeric' })
}
export const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.round(m / 60)}h ago`
  return fmtDate(iso, 'en-US', true)
}
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  // Quote every cell; prefix text that Excel would treat as a formula (=, +, -, @, tab, return) with ' (CSV injection guard).
  const esc = (v: string | number | null | undefined) => {
    let s = String(v ?? '')
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return `"${s.replace(/"/g, '""')}"`
  }
  const blob = new Blob(['\ufeff' + rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }) // BOM so Excel reads Chinese/Korean names
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
