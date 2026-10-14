// AAFE GALA — iPAD CHECK-IN APP (prototype, synthetic data only)
// One gala only: the current (53rd) gala. Past galas have already happened, so there is no gala picker.
// The door list is every guest on AAFE's list (553, in AAFE's seven categories), sorted A–Z by LAST name,
// with an A–Z bar to jump to a letter. Tick one or more names, tap "Checked in", and each row shows the time.
// Live (Supabase keys set): staff sign in with their AAFE account and the list and check-ins go through Supabase
// (liveDoor.ts). Demo (no keys): the invented door list and the demo sync server on one computer (demoDoor.ts).
// Shows ONLY: name, title, organization, category, seat type, table, and an "access needs" flag. Never payments,
// emails, notes, dietary details or the accessibility details themselves.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, CloudOff, Lock, LogOut, Mail, QrCode, RefreshCw, Search, Undo2, UserPlus, Wifi, X } from 'lucide-react'
import { AafeLogo } from '@shared/Logo'
import { DisplayControls, Modal, PrototypeBanner, Toast, useDisplayPrefs } from '@shared/ui'
import { EXCEPTION_TYPES } from '@shared/checkinSync'
import { currentStaff, sendSignInLink, signInFromLink, signOut, supabase, verifySignInCode } from '@shared/supabase'
import type { StaffUser } from '@shared/types'
import { LIVE, type Arrival, type Door, type DoorGuest, type DoorStatus, type Gala } from './door'
import { frameReader, onceEvery } from './qrScan'
import { waitingMessage } from './signOut'
import type * as DemoModule from './demoDoor'

type Prefs = ReturnType<typeof useDisplayPrefs>
type Volunteer = (typeof DemoModule.VOLUNTEERS)[number]
const CATS = ['Sponsor guest', 'Ticket holder', 'Comped', 'AAFE staff', 'Event volunteer', 'Event staff', 'Government or VIP']
const CAT_TONE: Record<string, string> = {
  'Sponsor guest': 'bg-brand-50 text-brand-700 ring-navy-100', 'Ticket holder': 'bg-cream-100 text-navy-800 ring-navy-100',
  Comped: 'bg-amber-50 text-amber-800 ring-amber-200', 'AAFE staff': 'bg-surface text-brand-700 ring-brand-500',
  'Event volunteer': 'bg-surface text-navy-700 ring-navy-300', 'Event staff': 'bg-surface text-navy-700 ring-navy-300',
  'Government or VIP': 'bg-brand-600 text-white ring-brand-600',
}
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const ROLE: Record<string, string> = { check_in_volunteer: 'Check-in volunteer', gala_admin: 'Gala admin', relationship_manager: 'Relationship manager' }
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const sortKey = (g: DoorGuest) => norm(`${g.last_name} ${g.first_name}`).replace(/[^a-z ]/g, '')
const letterOf = (g: DoorGuest) => { const c = sortKey(g)[0]?.toUpperCase() ?? '#'; return LETTERS.includes(c) ? c : '#' }
const galaDate = (g: Gala) => g.event_date ? new Date(g.event_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : ''

export default function App() {
  const prefs = useDisplayPrefs()
  useEffect(() => { document.documentElement.classList.add('brand-warm') }, [])
  return LIVE ? <LiveApp prefs={prefs} /> : <DemoApp prefs={prefs} />
}

function Shell({ prefs, children }: { prefs: Prefs; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream-50">
      <PrototypeBanner />
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-center justify-between gap-4"><AafeLogo /><DisplayControls prefs={prefs} /></div>
        {children}
      </div>
    </div>
  )
}
const Waiting = ({ prefs, text }: { prefs: Prefs; text: string }) => (
  <Shell prefs={prefs}><p className="mt-16 flex items-center justify-center gap-3 text-lg text-navy-700"><RefreshCw size={20} className="animate-spin" /> {text}</p></Shell>
)

// ---------------------------------------------------------------- demo: pick a volunteer (no keys, invented data)
function DemoApp({ prefs }: { prefs: Prefs }) {
  const [mod, setMod] = useState<typeof DemoModule | null>(null)
  const [door, setDoor] = useState<{ api: Door; vol: Volunteer } | null>(null)
  useEffect(() => { void import('./demoDoor').then(setMod) }, [])
  if (!mod) return <Waiting prefs={prefs} text="Loading the guest list…" />
  if (!door) return <SignIn prefs={prefs} gala={mod.GALA} guests={mod.demoGuestCount} vols={mod.VOLUNTEERS} onStart={(v) => setDoor({ api: mod.demoDoor(v.name), vol: v })} />
  return <DoorScreen api={door.api} who={door.vol.name.replace(' (volunteer)', '')} prefs={prefs} exitLabel="Switch" onExit={() => { door.api.stop(); setDoor(null) }} />
}

function SignIn({ prefs, gala, guests, vols, onStart }: { prefs: Prefs; gala: Gala; guests: number; vols: Volunteer[]; onStart: (v: Volunteer) => void }) {
  const sorted = [...vols].sort((a, b) => (a.role === 'check_in_volunteer' ? -1 : b.role === 'check_in_volunteer' ? 1 : 0))
  const [v, setV] = useState<Volunteer | null>(null)
  return (
    <Shell prefs={prefs}>
      <div className="mt-10 rounded-2xl border-2 border-brand-500 bg-surface p-6">
        <div className="text-sm font-semibold uppercase tracking-wide text-brand-700">Tonight’s gala</div>
        <h1 className="mt-1 text-[2rem] font-semibold leading-tight text-navy-900" data-testid="gala-name">{gala.name.replace(' (demo)', '')}</h1>
        <p className="mt-1 text-lg text-navy-700">{galaDate(gala)} · Doors {gala.doors_time} · {gala.venue_name}</p>
        <p className="mt-3 text-base text-navy-700"><strong className="text-navy-900">{guests}</strong> guests on the list</p>
      </div>
      <section className="mt-8" aria-labelledby="who">
        <h2 id="who" className="text-sm font-semibold uppercase tracking-wide text-navy-500">Who is checking guests in?</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {sorted.map((x) => (
            <button key={x.id} onClick={() => setV(x)} aria-pressed={v?.id === x.id} data-testid={`vol-${x.id}`}
              className={`tap flex min-h-[72px] items-center gap-4 rounded-[50px] border-2 bg-surface px-5 py-3 text-left ${v?.id === x.id ? 'border-brand-500 bg-brand-50' : 'border-navy-100'}`}>
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${v?.id === x.id ? 'bg-brand-500 text-white' : 'bg-cream-100 text-navy-700'}`}>{x.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
              <span className="min-w-0"><span className="block text-lg font-semibold text-navy-900">{x.name.replace(' (volunteer)', '')}</span><span className="block text-sm text-navy-600">{ROLE[x.role] ?? x.role}</span></span>
            </button>
          ))}
        </div>
      </section>
      <button className="btn-primary tap mt-8 h-16 w-full text-lg" disabled={!v} onClick={() => v && onStart(v)} data-testid="start">Open guest list</button>
      <p className="mt-4 text-center text-sm text-navy-500">Prototype: no password. In production volunteers sign in with their AAFE staff account.</p>
    </Shell>
  )
}

// ---------------------------------------------------------------- live: staff account, list from Supabase
const STAFF_KEY = 'aafe-checkin-staff'   // the last signed-in staff row, so the door opens offline with a saved session
const remember = (s: StaffUser | null) => { try { s ? localStorage.setItem(STAFF_KEY, JSON.stringify(s)) : localStorage.removeItem(STAFF_KEY) } catch { /* memory only */ } }
const remembered = (): StaffUser | null => { try { return JSON.parse(localStorage.getItem(STAFF_KEY) ?? 'null') } catch { return null } }

function LiveApp({ prefs }: { prefs: Prefs }) {
  const [staff, setStaff] = useState<StaffUser | 'checking' | 'out' | 'not-staff'>('checking')
  const [door, setDoor] = useState<Door | 'loading' | 'closed' | 'error'>('loading')
  const check = async () => {
    try {
      const s = await currentStaff()
      if (s) { remember(s); setStaff(s); return }
      const { data: { session } } = await supabase!.auth.getSession()
      if (session) { await signOut(); setStaff('not-staff') } else setStaff('out')
    } catch {
      // Offline with a saved session: open the door for the same person, from the list saved on this iPad.
      const { data: { session } } = await supabase!.auth.getSession()
      const s = remembered()
      setStaff(session && s && s.email.toLowerCase() === session.user.email?.toLowerCase() ? s : 'out')
    }
  }
  const [linkFailed, setLinkFailed] = useState(false)
  useEffect(() => {
    void signInFromLink().catch(() => setLinkFailed(true)).finally(() => void check())
    const { data } = supabase!.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN') void check() })
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (typeof staff !== 'object') return
    setDoor('loading')
    import('./liveDoor').then((m) => m.loadDoor(staff)).then((d) => setDoor(d ?? 'closed'), () => setDoor('error'))
  }, [staff])
  // Sign-out sends waiting check-ins first; if some can't be sent, it stops and says so (signOut.ts).
  const [blocked, setBlocked] = useState<{ waiting: number; canForce: boolean } | null>(null)
  const [leaving, setLeaving] = useState(false)
  const leave = async (force = false) => {
    const m = typeof staff === 'object' ? await import('./liveDoor') : null
    if (m && typeof staff === 'object' && !force) {
      setLeaving(true)
      const r = await m.checkLiveSignOut(staff).finally(() => setLeaving(false))
      if (!r.ok) { setBlocked({ waiting: r.waiting, canForce: r.canForce }); return }
    }
    setBlocked(null)
    // Close the guest-list screen before its saved list goes, so nothing redraws from a list that's gone.
    if (typeof door === 'object') door.stop()
    setDoor('loading')
    if (m && typeof staff === 'object') m.deskFor(staff).clear()   // the saved list and queue leave the iPad
    remember(null); await signOut(); setStaff('out')
  }
  const blockedModal = blocked && (
    <Modal open onClose={() => setBlocked(null)} title="Check-ins not sent yet">
      <p className="text-lg text-navy-900" data-testid="signout-blocked">{waitingMessage(blocked.waiting, blocked.canForce)}</p>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        {blocked.canForce && <button className="btn-ghost tap h-14 px-6 text-base" onClick={() => void leave(true)} data-testid="signout-anyway"><LogOut size={18} /> Sign out anyway</button>}
        <button className="btn-primary tap h-14 px-8 text-base" onClick={() => { setBlocked(null); void leave() }} data-testid="signout-retry"><RefreshCw size={18} /> Try again</button>
      </div>
    </Modal>
  )

  if (staff === 'checking') return <Waiting prefs={prefs} text="Checking your sign-in…" />
  if (staff === 'out' || staff === 'not-staff') return <LiveSignIn prefs={prefs} notice={staff === 'not-staff' ? 'That account isn’t on the AAFE staff list. Ask the gala admin to add you.'
    : linkFailed ? 'That sign-in link didn’t work. It works once and expires after about an hour: ask for a new one.' : ''} />
  if (door === 'loading') return <Waiting prefs={prefs} text="Loading tonight’s guest list…" />
  if (door === 'closed' || door === 'error') return (
    <Shell prefs={prefs}>
      <div className="mt-10 rounded-2xl border-2 border-navy-100 bg-surface p-6" role="alert">
        <h1 className="text-2xl font-semibold text-navy-900">{door === 'closed' ? 'Tonight’s gala is closed' : 'The guest list didn’t load'}</h1>
        <p className="mt-2 text-lg text-navy-700">{door === 'closed' ? 'The guest list has been cleared from this iPad.' : 'Check the internet connection, then try again. Nothing was lost.'}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {door === 'error' && <button className="btn-primary tap h-14 px-6 text-base" onClick={() => setStaff({ ...staff })}><RefreshCw size={18} /> Try again</button>}
          <button className="btn-ghost tap h-14 px-6 text-base" disabled={leaving} onClick={() => void leave()}><LogOut size={18} /> {leaving ? 'Sending check-ins…' : 'Sign out'}</button>
        </div>
      </div>
      {blockedModal}
    </Shell>
  )
  return <>
    <DoorScreen api={door} who={staff.name} prefs={prefs} exitLabel={leaving ? 'Sending check-ins…' : 'Sign out'} onExit={() => { if (!leaving) void leave() }} />
    {blockedModal}
  </>
}

function LiveSignIn({ prefs, notice }: { prefs: Prefs; notice: string }) {
  const [email, setEmail] = useState('')
  const [err, setErr] = useState(notice)
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setErr('')
    if (!email.trim()) return setErr('Enter your work email.')
    setBusy(true)
    if (sent) {
      // The 6-digit code from the same email: signs this iPad in, even from the Home Screen app.
      try { await verifySignInCode(email, code) }
      catch { setErr('That code didn’t work. Codes work once and expire after an hour: send a new one.') }
      finally { setBusy(false) }
      return
    }
    try { await sendSignInLink(email); setSent(true) }
    // Same message whether or not the email is invited, so the form doesn't reveal who is on the staff list.
    catch { setErr('We couldn’t send a sign-in email. Check the email, or ask the gala admin to invite you.') }
    finally { setBusy(false) }
  }
  return (
    <Shell prefs={prefs}>
      <form className="mx-auto mt-12 max-w-md" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <div className="text-sm font-semibold uppercase tracking-wide text-brand-700">Guest check-in</div>
        <h1 className="mt-1 text-[2rem] font-semibold leading-tight text-navy-900">Sign in to check guests in</h1>
        <p className="mt-2 text-lg text-navy-700">Use your AAFE staff account. Check-in volunteers see the door list only.</p>
        <label className="mt-8 block text-base font-medium text-navy-800" htmlFor="em">Work email</label>
        <input id="em" type="email" className="input mt-1 h-14 text-lg" value={email} onChange={(e) => { setEmail(e.target.value); setSent(false); setCode('') }} autoComplete="username" data-testid="email" />
        {err && <p className="mt-3 text-base font-medium text-rose-700" role="alert">{err}</p>}
        {sent ? <>
          <p className="mt-6 rounded-xl bg-surface p-4 text-base text-navy-800" role="status" data-testid="link-sent">Check your email for a message from AAFE Gala. Type its 6-digit code here, or open its link on this iPad. Both work once and expire in an hour.</p>
          <label className="mt-5 block text-base font-medium text-navy-800" htmlFor="code">6-digit code</label>
          <input id="code" className="input mt-1 h-14 text-center text-2xl tracking-[0.3em] tabular-nums" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
            inputMode="numeric" autoComplete="one-time-code" data-testid="code" />
          <button className="btn-primary tap mt-4 h-16 w-full text-lg" type="submit" disabled={busy || code.length < 6} data-testid="verify-code"><Lock size={20} /> {busy ? 'Signing in…' : 'Sign in'}</button>
          <button type="button" className="btn-ghost tap mt-3 h-14 w-full text-base" onClick={() => { setSent(false); setCode(''); setErr('') }} data-testid="new-code">Send a new email</button>
        </> : <button className="btn-primary tap mt-6 h-16 w-full text-lg" type="submit" disabled={busy} data-testid="send-link"><Mail size={20} /> {busy ? 'Sending…' : 'Email me a sign-in code'}</button>}
      </form>
    </Shell>
  )
}

// ---------------------------------------------------------------- door list
/** Re-renders when the door's list or check-ins change; runs its sync while the screen is open. */
function useDoor(api: Door) {
  const [, setN] = useState(0)
  useEffect(() => { const off = api.subscribe(() => setN((n) => n + 1)); api.start(); return () => { off(); api.stop() } }, [api])
}

function DoorScreen({ api, who, prefs, exitLabel, onExit }: { api: Door; who: string; prefs: Prefs; exitLabel: string; onExit: () => void }) {
  useDoor(api)
  // api.guests is a new list only when a refresh brought added or changed guests (liveDoor.ts), so this re-sorts then.
  const guests = api.guests
  const ALL = useMemo(() => [...guests].sort((a, b) => sortKey(a).localeCompare(sortKey(b))), [guests])
  const GALA = api.gala
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>('all')
  const [show, setShow] = useState<'all' | 'waiting' | 'in'>('all')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ handles: string[]; guestIds: string[]; label: string; until: number } | null>(null)
  const [confirmUndo, setConfirmUndo] = useState<{ g: DoorGuest; a: Arrival } | null>(null)
  const [scan, setScan] = useState(false)
  const [exc, setExc] = useState(false)
  const [excList, setExcList] = useState(false)
  const [focused, setFocused] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const byGuest = api.arrivals()
  const inKey = [...byGuest.keys()].join()   // which guests are in, so the filtered list refreshes when it changes
  const arrived = ALL.filter((g) => byGuest.has(g.id)).length
  const excRows = api.exceptions()
  const exceptions = excRows.length
  const notices = api.notices()
  // While searching (keyboard up), hide the progress bar, category chips and A–Z bar so the list has room.
  const compact = focused || q.trim().length > 0
  const pct = ALL.length ? Math.round((arrived / ALL.length) * 100) : 0

  const rows = useMemo(() => {
    const words = norm(q.trim()).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
    return ALL.filter((g) => (cat === 'all' || g.category === cat)
      && (show === 'all' || (show === 'in' ? byGuest.has(g.id) : !byGuest.has(g.id)))
      && (!words.length || words.every((w) => (' ' + norm(`${g.first_name} ${g.last_name} ${g.organization ?? ''} ${g.sponsor}`).replace(/[^a-z0-9 ]/g, ' ')).includes(' ' + w))))
  }, [q, cat, show, inKey, ALL]) // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => { const m = new Map<string, DoorGuest[]>(); for (const g of rows) { const l = letterOf(g); if (!m.has(l)) m.set(l, []); m.get(l)!.push(g) } return m }, [rows])

  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now())); return () => clearTimeout(t) }, [undo])

  const jump = (l: string) => { const el = listRef.current?.querySelector<HTMLElement>(`[data-letter="${l}"]`); if (el && listRef.current) listRef.current.scrollTo({ top: el.offsetTop, behavior: 'auto' }) }
  const toggle = (id: string) => { setUndo(null); setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  // keepSearch: a one-tap check-in leaves the search as it is, so the list doesn't jump under the volunteer's finger
  // and a quick second tap can't land on another guest's Check in button. Group and QR check-ins clear it as before.
  const checkIn = (ids: string[], method: 'search' | 'qr' = 'search', keepSearch = false) => {
    const fresh = ids.filter((id) => !byGuest.has(id))
    const made = api.checkIn(fresh, method)
    setSel(new Set()); if (!keepSearch) setQ('')
    if (made.length) {
      const first = ALL.find((x) => x.id === fresh[0]), now = new Date().toISOString()
      setUndo({ handles: made, guestIds: fresh, label: made.length === 1 && first ? `${first.first_name} ${first.last_name} · ${first.table ? `Table ${first.table}` : 'no assigned table'} · ${time(now)}` : `${made.length} guests · ${time(now)}`, until: Date.now() + 10000 })
    }
  }
  const doUndo = async () => {
    if (!undo) return
    const u = undo; setUndo(null)
    const now = api.arrivals()
    const others = u.guestIds.map((gid) => now.get(gid)).filter((a): a is Arrival => !!a && !u.handles.includes(a.handle))   // another door was first
    const mine = u.guestIds.length ? u.guestIds.flatMap((gid) => { const a = now.get(gid); return a && u.handles.includes(a.handle) ? [a.handle] : [] }) : u.handles
    const err = mine.length ? await api.undo(mine) : null
    setMsg(err ?? (others.length ? `Not undone: already checked in by ${others[0].by} at ${time(others[0].at)}` : 'Undone — back to not checked in'))
  }
  const byCode = async (code: string): Promise<string | null> => {
    const m = await api.scan(code)
    if (!m) setScan(false)
    return m
  }
  const catCount = (c: string) => ALL.filter((g) => g.category === c)
  // All / Not checked in / Checked in. Landscape: in the toolbar row after search. Portrait: its own full row under
  // Scan and Exception. Rendered in both places with only one shown, so Tab follows what's on screen in both.
  const showFilter = (layout: string) => (
    <div className={`${layout} overflow-hidden rounded-xl border-2 border-navy-100`} role="group" aria-label="Show">
      {([['all', 'All'], ['waiting', 'Not checked in'], ['in', 'Checked in']] as const).map(([k, l]) => (
        <button key={k} onClick={() => setShow(k)} aria-pressed={show === k} data-testid={`show-${k}`} className={`tap h-[52px] px-4 text-base font-medium ${show === k ? 'bg-brand-500 text-white' : 'bg-surface text-navy-800'}`}>{l}</button>
      ))}
    </div>
  )
  const selCount = sel.size

  return (
    <div className="checkin flex h-screen flex-col overflow-hidden bg-cream-50 supports-[height:100dvh]:h-dvh">
      <PrototypeBanner />
      <header className="shrink-0 border-b border-navy-100 bg-surface">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5">
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <img src="./brand/aafe-mark-orange.png" alt="AAFE" className={`${compact ? 'h-10 w-10' : 'h-16 w-16'} shrink-0 object-contain`} />
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-navy-900" data-testid="gala-title">{GALA.name.replace(' (demo)', '')}</div>
              <div className="text-sm text-navy-600">Guest check-in · {who}</div>
            </div>
          </div>
          <div className={`order-last min-w-0 basis-full lg:order-none lg:basis-0 lg:flex-1 ${compact ? 'hidden' : ''}`}>
            <div className="flex items-baseline justify-between gap-2 text-navy-900" data-testid="counter"><span><strong className="text-2xl tabular-nums text-brand-600">{arrived}</strong> of <strong className="tabular-nums">{ALL.length}</strong> checked in</span><span className="whitespace-nowrap text-sm text-navy-600"><span className="tabular-nums">{pct}%</span>{exceptions > 0 && <> · <button className="tap inline-flex min-h-[44px] items-center px-1 underline underline-offset-2" onClick={() => setExcList(true)} data-testid="exc-count">+{exceptions} exception{exceptions === 1 ? '' : 's'}</button></>}</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-cream-100" aria-hidden><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} /></div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <SyncPill s={api.status} />
            <DisplayControls prefs={prefs} />
            <button className="btn-ghost tap h-11" onClick={onExit} data-testid="sign-out"><LogOut size={18} /> {exitLabel}</button>
          </div>
        </div>
        <div className={`flex gap-2 overflow-x-auto border-t border-navy-100 px-5 py-2 ${compact ? 'hidden' : ''}`} role="tablist" aria-label="Guest category">
          <CatChip label="All guests" n={ALL.length} inN={arrived} on={cat === 'all'} onClick={() => setCat('all')} testid="cat-all" />
          {CATS.map((c) => { const gs = catCount(c); return <CatChip key={c} label={c} n={gs.length} inN={gs.filter((g) => byGuest.has(g.id)).length} on={cat === c} onClick={() => setCat(c)} testid={`cat-${c.toLowerCase().replace(/[^a-z]+/g, '-')}`} /> })}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-navy-100 px-5 py-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search size={22} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-navy-500" aria-hidden />
            <input value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value) setUndo(null) }} onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 400)} autoComplete="off" autoCorrect="off" spellCheck={false} placeholder="Name, organization, sponsor" aria-label="Search guests" data-testid="search"
              className="h-14 w-full rounded-xl border-2 border-navy-100 bg-surface pl-12 pr-12 text-lg text-navy-900 placeholder:text-navy-500 focus:border-brand-500 focus:outline-none" />
            {q && <button className="tap absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full text-navy-600" onClick={() => setQ('')} aria-label="Clear search"><X size={22} /></button>}
          </div>
          {showFilter('hidden lg:flex')}
          <button className="btn-ghost tap h-14 px-4 text-base" onClick={() => setScan(true)} data-testid="open-scan" aria-label="Scan QR code"><QrCode size={20} /><span className="hidden sm:inline">Scan</span></button>
          <button className="btn-ghost tap h-14 px-4 text-base" onClick={() => setExc(true)} data-testid="open-exception" aria-label="Add approved exception"><UserPlus size={20} /><span className="hidden sm:inline">Exception</span></button>
          {showFilter('flex basis-full lg:hidden [&>button]:flex-1')}
        </div>
        {notices.length > 0 && (
          <ul className="border-t border-amber-200 bg-amber-50 px-5 py-2" aria-label="Check-ins not counted" data-testid="notices">
            {notices.map((n) => (
              <li key={n.client_id} className="flex items-center gap-3 py-1 text-base text-amber-900">
                <AlertTriangle size={18} className="shrink-0" aria-hidden /><span className="min-w-0 flex-1">{n.message}</span>
                <button className="btn-ghost tap h-11 px-4 text-sm" onClick={() => api.dismiss(n.client_id)}>OK</button>
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div ref={listRef} className={`relative min-h-0 flex-1 overflow-y-auto pb-32 ${q.trim() ? '' : 'pr-12'}`} data-testid="guest-list" aria-label="Guest list, by last name">
          {!rows.length && (
            <div className="m-6 rounded-2xl border-2 border-dashed border-navy-100 p-8 text-center text-navy-700">
              <p className="text-lg font-semibold text-navy-900">No guests match.</p>
              <p className="mt-1">Check the spelling or the filters, or add an approved exception.</p>
              <button className="btn-primary tap mt-5 h-14 px-6 text-base" onClick={() => setExc(true)}><UserPlus size={20} /> Add approved exception</button>
            </div>
          )}
          {[...groups.entries()].map(([l, gs]) => (
            <section key={l} data-letter={l} aria-label={`Last names starting with ${l}`}>
              <h2 className="sticky top-0 z-10 border-y border-navy-100 bg-cream-100 px-5 py-1.5 text-lg font-bold text-brand-700">{l}</h2>
              <ul className="divide-y divide-navy-100 bg-surface">
                {gs.map((g) => {
                  const a = byGuest.get(g.id); const on = sel.has(g.id)
                  return (
                    // One tap checks a guest in: the "Check in" button on the row (Undo appears for 10 seconds). Tapping the
                    // rest of the row selects the guest, for a group arriving together (then "Check in N" at the bottom).
                    <li key={g.id} className={`flex items-stretch ${a ? 'bg-emerald-50' : on ? 'bg-brand-50' : ''}`}>
                      <button type="button" data-testid={`row-${g.id}`} aria-pressed={a ? undefined : on}
                        aria-label={a ? undefined : `${on ? 'Unselect' : 'Select'} ${g.first_name} ${g.last_name} for a group check-in`}
                        onClick={() => (a ? setConfirmUndo({ g, a }) : toggle(g.id))}
                        className={`grid min-w-0 flex-1 grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-4 py-3 pl-5 text-left ${a ? 'pr-5' : 'pr-2'}`}>
                        <span aria-hidden className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 ${a ? 'border-emerald-600 bg-emerald-600 text-white' : on ? 'border-brand-500 bg-brand-500 text-white' : 'border-navy-300 bg-surface'}`}>{(a || on) && <CheckCircle2 size={22} />}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-xl font-semibold text-navy-900"><span>{g.last_name}</span>, <span className="font-medium">{g.first_name}</span></span>
                          <span className="block truncate text-base text-navy-700">{[g.title, g.organization].filter(Boolean).join(' · ')}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-navy-700">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${CAT_TONE[g.category] ?? CAT_TONE['Ticket holder']}`}>{g.category}</span>
                            {g.access && <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200" data-testid={`access-${g.id}`}>Access needs · ask a staff lead</span>}
                            <span className="truncate">{g.seat_label}</span>
                            <span className="text-navy-500">·</span>
                            <span className="font-medium text-navy-900">{g.table ? `Table ${g.table}` : 'No assigned table'}</span>
                          </span>
                        </span>
                        <span className="text-right">
                          {a ? <span className="block text-base font-semibold text-emerald-800" data-testid={`in-${g.id}`}>Checked in<span className="block text-lg tabular-nums">{time(a.at)}</span>{a.queued && <span className="block text-xs font-medium text-amber-700">waiting to sync</span>}</span>
                            : on ? <span className="block text-sm font-medium text-brand-700">Selected</span> : null}
                        </span>
                      </button>
                      {!a && !on && (
                        <span className="flex shrink-0 items-center pr-5">
                          <button type="button" className="btn-primary tap h-14 px-6 text-base" onClick={() => checkIn([g.id], 'search', true)} data-testid={`checkin-${g.id}`}
                            aria-label={`Check in ${g.first_name} ${g.last_name}`}><CheckCircle2 size={20} /> Check in</button>
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        <nav aria-label="Jump to last name letter" className={`absolute inset-y-0 right-0 z-20 w-12 flex-col items-stretch justify-between border-l border-navy-100 bg-surface py-1 ${q.trim() ? 'hidden' : 'flex'}`} data-testid="az-bar">
          {LETTERS.map((l) => {
            const has = groups.has(l)
            return <button key={l} onClick={() => has && jump(l)} disabled={!has} aria-label={`Jump to ${l}`} data-testid={`az-${l}`}
              className={`flex min-h-0 flex-1 items-center justify-center text-[0.9375rem] font-bold leading-none ${has ? 'text-brand-700 active:bg-brand-100' : 'text-navy-300'}`}>{l}</button>
          })}
        </nav>
      </div>

      {selCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-navy-100 bg-surface px-5 py-3 shadow-2xl" data-testid="action-bar">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="flex-1 text-lg text-navy-900"><strong className="tabular-nums">{selCount}</strong> selected</div>
            <button className="btn-ghost tap h-14 px-5 text-base" onClick={() => setSel(new Set())}>Clear</button>
            <button className="btn-primary tap h-14 min-w-[200px] px-8 text-lg" onClick={() => checkIn([...sel])} data-testid="checked-in"><CheckCircle2 size={22} /> Check in {selCount}</button>
          </div>
        </div>
      )}

      {undo && (
        <div role="status" className="pop-in fixed inset-x-0 bottom-0 z-40 px-4 pb-4" data-testid="undo-toast">
          <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-navy-100">
            <div className="flex items-center gap-4 p-4">
              <CheckCircle2 size={34} className="shrink-0 text-emerald-700" aria-hidden />
              <div className="min-w-0 flex-1"><div className="text-lg font-semibold text-navy-900">Checked in</div><div className="truncate text-navy-700">{undo.label}</div></div>
              <button className="btn-ghost tap h-14 px-5 text-base" onClick={() => void doUndo()} data-testid="undo"><Undo2 size={20} /> Undo</button>
            </div>
            <div className="h-1.5 bg-cream-100"><div key={undo.handles[0]} className="undo-bar h-full bg-brand-500" /></div>
          </div>
        </div>
      )}

      {confirmUndo && (
        <Modal open onClose={() => setConfirmUndo(null)} title="Already checked in">
          <p className="text-lg text-navy-900"><strong>{confirmUndo.g.first_name} {confirmUndo.g.last_name}</strong> was checked in at <strong>{time(confirmUndo.a.at)}</strong> by {confirmUndo.a.by}.</p>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button className="btn-ghost tap h-14 px-6 text-base" onClick={() => { const a = confirmUndo.a; setConfirmUndo(null); void api.undo([a.handle]).then((e) => setMsg(e ?? 'Check-in removed')) }} data-testid="remove-checkin"><Undo2 size={18} /> Undo check-in</button>
            <button className="btn-primary tap h-14 px-8 text-base" onClick={() => setConfirmUndo(null)}>Keep</button>
          </div>
        </Modal>
      )}

      {excList && (
        <Modal open onClose={() => setExcList(false)} title="Exceptions tonight" wide>
          <ul className="divide-y divide-navy-100" data-testid="exc-list">
            {excRows.map((c) => (
              <li key={c.handle} className="flex items-center gap-4 py-3">
                <div className="min-w-0 flex-1"><div className="text-lg font-semibold text-navy-900">{c.name}</div><div className="text-sm text-navy-700">{c.type} · {time(c.at)} · {c.by}{c.queued ? ' · waiting to sync' : ''}</div></div>
                <button className="btn-ghost tap h-12 px-4" onClick={() => void api.undo([c.handle]).then((e) => setMsg(e ?? `Removed ${c.name}`))}><Undo2 size={18} /> Undo</button>
              </li>
            ))}
            {!excRows.length && <li className="py-3 text-navy-600">No exceptions yet.</li>}
          </ul>
        </Modal>
      )}
      {scan && <ScanModal onClose={() => setScan(false)} onCode={byCode} />}
      {exc && <ExceptionModal sponsors={api.sponsors} prefill={q} onClose={() => setExc(false)} onSave={(p) => {
        const handle = api.addException(p); setExc(false); setQ('')
        setUndo({ handles: [handle], guestIds: [], label: `${p.name} · ${p.type}`, until: Date.now() + 10000 })
      }} />}
      <Toast msg={msg} onDone={() => setMsg(null)} />
    </div>
  )
}

function CatChip({ label, n, inN, on, onClick, testid }: { label: string; n: number; inN: number; on: boolean; onClick: () => void; testid: string }) {
  return (
    <button role="tab" aria-selected={on} onClick={onClick} data-testid={testid}
      className={`tap shrink-0 rounded-full border-2 px-4 py-1.5 text-left text-sm font-semibold ${on ? 'border-brand-500 bg-brand-500 text-white' : 'border-navy-100 bg-surface text-navy-800'}`}>
      {label} <span className={`tabular-nums ${on ? 'text-white' : 'text-navy-600'}`}>{inN}/{n}</span>
    </button>
  )
}

function SyncPill({ s }: { s: DoorStatus }) {
  const base = 'inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold'
  if (s.online === false) return <span className={`${base} bg-amber-50 text-amber-800 ring-1 ring-amber-200`} data-testid="sync-status"><CloudOff size={18} /> {s.pending ? `Offline – ${s.pending} waiting to sync` : 'Offline – check-ins save on this iPad'}</span>
  if (s.pending > 0) return <span className={`${base} bg-cream-100 text-navy-800`} data-testid="sync-status"><RefreshCw size={18} className="animate-spin" /> Syncing {s.pending}…</span>
  if (s.online === null) return <span className={`${base} bg-cream-100 text-navy-700`} data-testid="sync-status"><RefreshCw size={18} /> Connecting…</span>
  return <span className={`${base} bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200`} data-testid="sync-status"><Wifi size={18} /> Synced · live</span>
}

function ScanModal({ onClose, onCode }: { onClose: () => void; onCode: (c: string) => Promise<string | null> }) {
  const video = useRef<HTMLVideoElement>(null)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [camState, setCamState] = useState<'starting' | 'on' | 'unsupported' | 'denied'>('starting')
  const onCodeRef = useRef(onCode); onCodeRef.current = onCode
  // The camera reads codes on its own (qrScan.ts: jsQR on iPad Safari, the built-in reader where a browser has
  // one). The same ticket is read once every 3 seconds, so a refused code shows its message once, not on repeat.
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) { setCamState('unsupported'); return }
    let stream: MediaStream | null = null, timer = 0, stop = false
    const read = frameReader(), fresh = onceEvery(3000)
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then((s) => {
      stream = s; if (stop || !video.current) { s.getTracks().forEach((t) => t.stop()); return }
      video.current.srcObject = s; void video.current.play(); setCamState('on')
      const loop = async () => {
        if (stop || !video.current) return
        try {
          const c = await read(video.current)
          if (c && fresh(c)) { const e = await onCodeRef.current(c); if (!e) return; setErr(e) }
        } catch { /* keep scanning */ }
        timer = window.setTimeout(loop, 200)
      }
      void loop()
    }).catch(() => setCamState('denied'))
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()) }
  }, [])
  return (
    <Modal open onClose={onClose} title="Scan QR code" wide>
      {camState === 'on' || camState === 'starting'
        ? <div className="relative overflow-hidden rounded-xl bg-cream-100"><video ref={video} className="aspect-video w-full object-cover" muted playsInline /><div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-brand-500/80" />{camState === 'starting' && <div className="absolute inset-0 flex items-center justify-center text-navy-700"><Camera size={22} className="mr-2" /> Starting camera…</div>}</div>
        : <div className="rounded-xl bg-cream-100 p-5 text-navy-800"><Camera size={22} className="mb-1 text-brand-600" />{camState === 'unsupported' ? 'This browser can’t open the camera.' : 'Camera permission was not given. Allow the camera for this app in Settings.'} Or type the code printed under the guest’s QR.</div>}
      <form className="mt-4 flex flex-wrap gap-3" onSubmit={(ev) => { ev.preventDefault(); if (!code.trim()) return; void onCodeRef.current(code).then((m) => { if (m) setErr(m) }) }}>
        <label htmlFor="qr" className="sr-only">QR code</label>
        <input id="qr" value={code} onChange={(e) => { setCode(e.target.value); setErr('') }} placeholder="e.g. AAFE-3F9C…" autoCapitalize="characters" autoComplete="off" data-testid="qr-input"
          className="h-16 min-w-0 flex-1 rounded-xl border-2 border-navy-100 bg-surface px-4 text-xl uppercase tracking-wide text-navy-900 placeholder:normal-case placeholder:tracking-normal placeholder:text-navy-500 focus:border-brand-500 focus:outline-none" />
        <button className="btn-primary tap h-16 px-8 text-lg" data-testid="qr-submit"><QrCode size={22} /> Check in</button>
      </form>
      {err && <p className="mt-3 text-base font-medium text-rose-700" role="alert">{err}</p>}
      <button className="btn-ghost tap mt-4 h-12" onClick={onClose}><ArrowLeft size={18} /> Back to guest list</button>
    </Modal>
  )
}

function ExceptionModal({ sponsors, prefill, onClose, onSave }: { sponsors: { order_id: string; name: string }[]; prefill: string; onClose: () => void; onSave: (p: { name: string; type: string; orderId: string; note: string }) => void }) {
  const [f, setF] = useState({ name: prefill.trim(), type: EXCEPTION_TYPES[0], orderId: '', note: '' })
  const sorted = [...sponsors].sort((a, b) => a.name.localeCompare(b.name))
  return (
    <Modal open onClose={onClose} title="Add approved exception" wide>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (f.name.trim()) onSave({ ...f, name: f.name.trim(), note: f.note.trim() }) }}>
        <div>
          <label htmlFor="xn" className="mb-1 block text-base font-medium text-navy-800">Arrival name</label>
          <input id="xn" className="input h-14 text-lg" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name as given at the door" data-testid="exc-name" autoFocus />
        </div>
        <fieldset>
          <legend className="mb-2 text-base font-medium text-navy-800">Exception type</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {EXCEPTION_TYPES.map((t) => (
              <button type="button" key={t} onClick={() => setF({ ...f, type: t })} aria-pressed={f.type === t} data-testid={`exc-type-${t.split(' ')[0]}`}
                className={`tap min-h-[56px] rounded-[50px] border-2 px-4 py-2 text-left text-base font-medium ${f.type === t ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-navy-100 bg-surface text-navy-800'}`}>{t}</button>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="xs" className="mb-1 block text-base font-medium text-navy-800">With sponsor <span className="font-normal text-navy-500">(optional)</span></label>
          <select id="xs" className="input h-14 text-base" value={f.orderId} onChange={(e) => setF({ ...f, orderId: e.target.value })}><option value="">No sponsor / not sure</option>{sorted.map((s) => <option key={s.order_id} value={s.order_id}>{s.name}</option>)}</select>
        </div>
        <div>
          <label htmlFor="xo" className="mb-1 block text-base font-medium text-navy-800">Note <span className="font-normal text-navy-500">(optional — who approved; no health or contact details)</span></label>
          <input id="xo" className="input h-14 text-base" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} data-testid="exc-note" />
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" className="btn-ghost tap h-14 px-6 text-base" onClick={onClose}>Cancel</button>
          <button className="btn-primary tap h-14 px-8 text-base" disabled={!f.name.trim()} data-testid="exc-save">Save check-in</button>
        </div>
      </form>
    </Modal>
  )
}
