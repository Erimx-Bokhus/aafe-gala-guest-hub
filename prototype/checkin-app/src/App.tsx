// AAFE GALA — iPAD CHECK-IN APP (prototype, synthetic data only)
// One gala only: the current (53rd) gala. Past galas have already happened, so there is no gala picker.
// The door list is every guest on AAFE's list (553, in AAFE's seven categories), sorted A–Z by LAST name,
// with an A–Z bar to jump to a letter. Tick one or more names, tap "Checked in", and each row shows the time.
// Every check-in goes to the sync server (server/, port 8787), which the staff app polls — so staff see live attendance.
// Shows ONLY: name, title, organization, category, seat type, table. Never payments, emails, notes, dietary or accessibility data.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Camera, CheckCircle2, CloudOff, LogOut, QrCode, RefreshCw, Search, Undo2, UserPlus, Wifi, X } from 'lucide-react'
import { AafeLogo } from '@shared/Logo'
import { DisplayControls, Modal, PrototypeBanner, Toast, useDisplayPrefs } from '@shared/ui'
import { EXCEPTION_TYPES, SyncClient, newCheckinId, useSync, type SyncStatus } from '@shared/checkinSync'
import type { CheckIn } from '@shared/types'
import door from './doorlist.json'

type DoorGuest = (typeof door.guests)[number]
type Volunteer = (typeof door.volunteers)[number]
type Gala = (typeof door.events)[number]

const GALA: Gala = door.events.find((e) => e.id === door.current_event_id) ?? door.events[0]
const CATS = ['Sponsor guest', 'Ticket holder', 'Comped', 'AAFE staff', 'Event volunteer', 'Event staff', 'Government or VIP']
const CAT_TONE: Record<string, string> = {
  'Sponsor guest': 'bg-brand-50 text-brand-700 ring-brand-200', 'Ticket holder': 'bg-cream-100 text-navy-800 ring-navy-100',
  Comped: 'bg-amber-50 text-amber-800 ring-amber-200', 'AAFE staff': 'bg-white text-brand-700 ring-brand-300',
  'Event volunteer': 'bg-white text-navy-700 ring-navy-200', 'Event staff': 'bg-white text-navy-700 ring-navy-200',
  'Government or VIP': 'bg-brand-600 text-white ring-brand-600',
}
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const ROLE: Record<string, string> = { check_in_volunteer: 'Check-in volunteer', gala_admin: 'Gala admin', relationship_manager: 'Relationship manager' }
const deviceId = `iPad-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
const sync = new SyncClient('aafe-checkin', { check_ins: door.check_ins as CheckIn[], closures: {} }, deviceId, 'ipad')
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const sortKey = (g: DoorGuest) => norm(`${g.last_name} ${g.first_name}`).replace(/[^a-z ]/g, '')
const letterOf = (g: DoorGuest) => { const c = sortKey(g)[0]?.toUpperCase() ?? '#'; return LETTERS.includes(c) ? c : '#' }
const ALL = [...door.guests].filter((g) => g.event_id === GALA.id).sort((a, b) => sortKey(a).localeCompare(sortKey(b)))

export default function App() {
  const prefs = useDisplayPrefs()
  const [vol, setVol] = useState<Volunteer | null>(null)
  useEffect(() => { document.documentElement.classList.add('brand-warm') }, [])
  if (!vol) return <SignIn prefs={prefs} onStart={setVol} />
  return <Door vol={vol} prefs={prefs} onExit={() => setVol(null)} />
}

// ---------------------------------------------------------------- sign in (volunteer only; the gala is fixed)
function SignIn({ prefs, onStart }: { prefs: ReturnType<typeof useDisplayPrefs>; onStart: (v: Volunteer) => void }) {
  const vols = [...door.volunteers].sort((a, b) => (a.role === 'check_in_volunteer' ? -1 : b.role === 'check_in_volunteer' ? 1 : 0))
  const [v, setV] = useState<Volunteer | null>(null)
  const date = new Date(GALA.event_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  return (
    <div className="min-h-screen bg-cream-50">
      <PrototypeBanner />
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex items-center justify-between gap-4"><AafeLogo /><DisplayControls prefs={prefs} /></div>
        <div className="mt-10 rounded-2xl border-2 border-brand-500 bg-surface p-6">
          <div className="text-sm font-semibold uppercase tracking-wide text-brand-700">Tonight’s gala</div>
          <h1 className="mt-1 text-[2rem] font-semibold leading-tight text-navy-900" data-testid="gala-name">{GALA.name.replace(' (demo)', '')}</h1>
          <p className="mt-1 text-lg text-navy-700">{date} · Doors {GALA.doors_time} · {GALA.venue_name}</p>
          <p className="mt-3 text-base text-navy-700"><strong className="text-navy-900">{ALL.length}</strong> guests on the list</p>
        </div>
        <section className="mt-8" aria-labelledby="who">
          <h2 id="who" className="text-sm font-semibold uppercase tracking-wide text-navy-500">Who is checking guests in?</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {vols.map((x) => (
              <button key={x.id} onClick={() => setV(x)} aria-pressed={v?.id === x.id} data-testid={`vol-${x.id}`}
                className={`tap flex min-h-[72px] items-center gap-4 rounded-2xl border-2 bg-surface px-5 py-3 text-left ${v?.id === x.id ? 'border-brand-500 bg-brand-50' : 'border-navy-100'}`}>
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${v?.id === x.id ? 'bg-brand-500 text-white' : 'bg-cream-100 text-navy-700'}`}>{x.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
                <span className="min-w-0"><span className="block text-lg font-semibold text-navy-900">{x.name.replace(' (volunteer)', '')}</span><span className="block text-sm text-navy-600">{ROLE[x.role] ?? x.role}</span></span>
              </button>
            ))}
          </div>
        </section>
        <button className="btn-primary tap mt-8 h-16 w-full rounded-2xl text-lg" disabled={!v} onClick={() => v && onStart(v)} data-testid="start">Open guest list</button>
        <p className="mt-4 text-center text-sm text-navy-500">Prototype: no password. In production volunteers sign in with their AAFE staff account.</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- door list
function Door({ vol, prefs, onExit }: { vol: Volunteer; prefs: ReturnType<typeof useDisplayPrefs>; onExit: () => void }) {
  const { view, status } = useSync(sync)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>('all')
  const [show, setShow] = useState<'all' | 'waiting' | 'in'>('all')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ ids: string[]; label: string; until: number } | null>(null)
  const [confirmUndo, setConfirmUndo] = useState<{ g: DoorGuest; ci: CheckIn } | null>(null)
  const [scan, setScan] = useState(false)
  const [exc, setExc] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  const cis = view.check_ins.filter((c) => c.event_id === GALA.id)
  const byGuest = new Map(cis.filter((c) => c.guest_id).map((c) => [c.guest_id as string, c]))
  const arrived = ALL.filter((g) => byGuest.has(g.id)).length
  const exceptions = cis.filter((c) => !c.guest_id).length
  const pct = ALL.length ? Math.round((arrived / ALL.length) * 100) : 0

  const rows = useMemo(() => {
    const words = norm(q.trim()).split(/\s+/).filter(Boolean)
    return ALL.filter((g) => (cat === 'all' || g.category === cat)
      && (show === 'all' || (show === 'in' ? byGuest.has(g.id) : !byGuest.has(g.id)))
      && (!words.length || words.every((w) => norm(`${g.first_name} ${g.last_name} ${g.organization} ${g.sponsor}`).includes(w))))
  }, [q, cat, show, view]) // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => { const m = new Map<string, DoorGuest[]>(); for (const g of rows) { const l = letterOf(g); if (!m.has(l)) m.set(l, []); m.get(l)!.push(g) } return m }, [rows])

  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now())); return () => clearTimeout(t) }, [undo])

  const jump = (l: string) => { const el = listRef.current?.querySelector<HTMLElement>(`[data-letter="${l}"]`); if (el && listRef.current) listRef.current.scrollTo({ top: el.offsetTop, behavior: 'auto' }) }
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const checkIn = (ids: string[], method: 'search' | 'qr' = 'search') => {
    const now = new Date().toISOString(); const made: string[] = []
    for (const id of ids) {
      const g = ALL.find((x) => x.id === id); if (!g || byGuest.has(id)) continue
      const ci: CheckIn = { id: newCheckinId(), event_id: GALA.id, guest_id: g.id, order_id: g.order_id, arrival_name: null, method, type: 'standard', checked_in_by: vol.name, note: '', checked_in_at: now }
      sync.add(ci); made.push(ci.id)
    }
    setSel(new Set())
    if (made.length) {
      const first = ALL.find((x) => x.id === ids[0])
      setUndo({ ids: made, label: made.length === 1 && first ? `${first.first_name} ${first.last_name} · ${first.table ? `Table ${first.table}` : 'no assigned table'} · ${time(now)}` : `${made.length} guests · ${time(now)}`, until: Date.now() + 10000 })
    }
  }
  const doUndo = () => { if (!undo) return; undo.ids.forEach((id) => sync.remove(id)); setMsg('Undone — back to not checked in'); setUndo(null) }
  const byCode = (code: string) => {
    const g = ALL.find((x) => x.qr_token && x.qr_token.toLowerCase() === code.trim().toLowerCase())
    if (!g) return false
    checkIn([g.id], 'qr'); setScan(false); return true
  }
  const catCount = (c: string) => ALL.filter((g) => g.category === c)
  const selCount = sel.size

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-cream-50">
      <PrototypeBanner />
      <header className="shrink-0 border-b border-navy-100 bg-surface">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-2.5">
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <img src="./brand/aafe-mark-orange.png" alt="AAFE" className="h-10 w-10 shrink-0" />
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-navy-900" data-testid="gala-title">{GALA.name.replace(' (demo)', '')}</div>
              <div className="text-sm text-navy-600">Guest check-in · {vol.name.replace(' (volunteer)', '')}</div>
            </div>
          </div>
          <div className="order-last min-w-0 basis-full lg:order-none lg:basis-0 lg:flex-1">
            <div className="flex items-baseline justify-between gap-2 text-navy-900" data-testid="counter"><span><strong className="text-2xl tabular-nums text-brand-600">{arrived}</strong> of <strong className="tabular-nums">{ALL.length}</strong> checked in</span><span className="whitespace-nowrap text-sm text-navy-600"><span className="tabular-nums">{pct}%</span>{exceptions > 0 && <> · <span data-testid="exc-count">+{exceptions} exception{exceptions === 1 ? '' : 's'}</span></>}</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-cream-100" aria-hidden><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} /></div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <SyncPill s={status} />
            <DisplayControls prefs={prefs} />
            <button className="btn-ghost tap h-11" onClick={onExit} data-testid="sign-out"><LogOut size={18} /> Switch</button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto border-t border-navy-100 px-5 py-2" role="tablist" aria-label="Guest category">
          <CatChip label="All guests" n={ALL.length} inN={arrived} on={cat === 'all'} onClick={() => setCat('all')} testid="cat-all" />
          {CATS.map((c) => { const gs = catCount(c); return <CatChip key={c} label={c} n={gs.length} inN={gs.filter((g) => byGuest.has(g.id)).length} on={cat === c} onClick={() => setCat(c)} testid={`cat-${c.split(' ')[0].toLowerCase()}`} /> })}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-navy-100 px-5 py-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search size={22} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-navy-500" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoCorrect="off" spellCheck={false} placeholder="Search name, organization or sponsor" aria-label="Search guests" data-testid="search"
              className="h-14 w-full rounded-xl border-2 border-navy-100 bg-surface pl-12 pr-12 text-lg text-navy-900 placeholder:text-navy-500 focus:border-brand-500 focus:outline-none" />
            {q && <button className="tap absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full text-navy-600" onClick={() => setQ('')} aria-label="Clear search"><X size={22} /></button>}
          </div>
          <div className="flex overflow-hidden rounded-xl border-2 border-navy-100" role="group" aria-label="Show">
            {([['all', 'All'], ['waiting', 'Not checked in'], ['in', 'Checked in']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setShow(k)} aria-pressed={show === k} data-testid={`show-${k}`} className={`tap h-[52px] px-4 text-base font-medium ${show === k ? 'bg-brand-500 text-white' : 'bg-surface text-navy-800'}`}>{l}</button>
            ))}
          </div>
          <button className="btn-ghost tap h-14 rounded-xl px-4 text-base" onClick={() => setScan(true)} data-testid="open-scan" aria-label="Scan QR code"><QrCode size={20} /><span className="hidden lg:inline">Scan</span></button>
          <button className="btn-ghost tap h-14 rounded-xl px-4 text-base" onClick={() => setExc(true)} data-testid="open-exception" aria-label="Add approved exception"><UserPlus size={20} /><span className="hidden lg:inline">Exception</span></button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto pb-32 pr-12" data-testid="guest-list" aria-label="Guest list, by last name">
          {!rows.length && (
            <div className="m-6 rounded-2xl border-2 border-dashed border-navy-100 p-8 text-center text-navy-700">
              <p className="text-lg font-semibold text-navy-900">No guests match.</p>
              <p className="mt-1">Check the spelling or the filters, or add an approved exception.</p>
              <button className="btn-primary tap mt-5 h-14 rounded-xl px-6 text-base" onClick={() => setExc(true)}><UserPlus size={20} /> Add approved exception</button>
            </div>
          )}
          {[...groups.entries()].map(([l, gs]) => (
            <section key={l} data-letter={l} aria-label={`Last names starting with ${l}`}>
              <h2 className="sticky top-0 z-10 border-y border-navy-100 bg-cream-100 px-5 py-1.5 text-lg font-bold text-brand-700">{l}</h2>
              <ul className="divide-y divide-navy-100 bg-surface">
                {gs.map((g) => {
                  const ci = byGuest.get(g.id); const on = sel.has(g.id)
                  return (
                    <li key={g.id}>
                      <button type="button" data-testid={`row-${g.id}`} aria-pressed={ci ? undefined : on}
                        onClick={() => (ci ? setConfirmUndo({ g, ci }) : toggle(g.id))}
                        className={`grid w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-4 px-5 py-3 text-left ${ci ? 'bg-emerald-50/60' : on ? 'bg-brand-50' : ''}`}>
                        <span aria-hidden className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 ${ci ? 'border-emerald-600 bg-emerald-600 text-white' : on ? 'border-brand-500 bg-brand-500 text-white' : 'border-navy-300 bg-surface'}`}>{(ci || on) && <CheckCircle2 size={22} />}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-xl font-semibold text-navy-900"><span>{g.last_name}</span>, <span className="font-medium">{g.first_name}</span></span>
                          <span className="block truncate text-base text-navy-700">{[g.title, g.organization].filter(Boolean).join(' · ')}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-navy-700">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${CAT_TONE[g.category] ?? CAT_TONE['Ticket holder']}`}>{g.category}</span>
                            <span className="truncate">{g.seat_label}</span>
                            <span className="text-navy-500">·</span>
                            <span className="font-medium text-navy-900">{g.table ? `Table ${g.table}` : 'No assigned table'}</span>
                          </span>
                        </span>
                        <span className="text-right">
                          {ci ? <span className="block text-base font-semibold text-emerald-800" data-testid={`in-${g.id}`}>Checked in<span className="block text-lg tabular-nums">{time(ci.checked_in_at)}</span>{sync.isQueued(ci.id) && <span className="block text-xs font-medium text-amber-700">waiting to sync</span>}</span>
                            : <span className="block text-sm text-navy-500">{on ? 'Selected' : 'Not checked in'}</span>}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        <nav aria-label="Jump to last name letter" className="absolute inset-y-0 right-0 z-20 flex w-12 flex-col items-stretch justify-between border-l border-navy-100 bg-surface py-1" data-testid="az-bar">
          {LETTERS.map((l) => {
            const has = groups.has(l)
            return <button key={l} onClick={() => has && jump(l)} disabled={!has} aria-label={`Jump to ${l}`} data-testid={`az-${l}`}
              className={`flex min-h-0 flex-1 items-center justify-center text-[0.9375rem] font-bold leading-none ${has ? 'text-brand-700 active:bg-brand-100' : 'text-navy-300'}`}>{l}</button>
          })}
        </nav>
      </div>

      {selCount > 0 && !undo && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-navy-100 bg-surface px-5 py-3 shadow-2xl" data-testid="action-bar">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="flex-1 text-lg text-navy-900"><strong className="tabular-nums">{selCount}</strong> selected</div>
            <button className="btn-ghost tap h-14 rounded-xl px-5 text-base" onClick={() => setSel(new Set())}>Clear</button>
            <button className="btn-primary tap h-14 min-w-[200px] rounded-xl px-8 text-lg" onClick={() => checkIn([...sel])} data-testid="checked-in"><CheckCircle2 size={22} /> Checked in</button>
          </div>
        </div>
      )}

      {undo && (
        <div role="status" className="pop-in fixed inset-x-0 bottom-0 z-40 px-4 pb-4" data-testid="undo-toast">
          <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-navy-100">
            <div className="flex items-center gap-4 p-4">
              <CheckCircle2 size={34} className="shrink-0 text-emerald-700" aria-hidden />
              <div className="min-w-0 flex-1"><div className="text-lg font-semibold text-navy-900">Checked in</div><div className="truncate text-navy-700">{undo.label}</div></div>
              <button className="btn-ghost tap h-14 rounded-xl px-5 text-base" onClick={doUndo} data-testid="undo"><Undo2 size={20} /> Undo</button>
            </div>
            <div className="h-1.5 bg-cream-100"><div key={undo.ids[0]} className="undo-bar h-full bg-brand-500" /></div>
          </div>
        </div>
      )}

      {confirmUndo && (
        <Modal open onClose={() => setConfirmUndo(null)} title="Already checked in">
          <p className="text-lg text-navy-900"><strong>{confirmUndo.g.first_name} {confirmUndo.g.last_name}</strong> was checked in at <strong>{time(confirmUndo.ci.checked_in_at)}</strong> by {confirmUndo.ci.checked_in_by.replace(' (volunteer)', '')}.</p>
          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button className="btn-ghost tap h-14 px-6 text-base" onClick={() => { sync.remove(confirmUndo.ci.id); setMsg('Check-in removed'); setConfirmUndo(null) }} data-testid="remove-checkin"><Undo2 size={18} /> Undo check-in</button>
            <button className="btn-primary tap h-14 px-8 text-base" onClick={() => setConfirmUndo(null)}>Keep</button>
          </div>
        </Modal>
      )}

      {scan && <ScanModal onClose={() => setScan(false)} onCode={byCode} />}
      {exc && <ExceptionModal gala={GALA} prefill={q} onClose={() => setExc(false)} onSave={(p) => {
        const ci: CheckIn = { id: newCheckinId(), event_id: GALA.id, guest_id: null, order_id: p.orderId || null, arrival_name: p.name, method: 'exception', type: p.type, checked_in_by: vol.name, note: p.note, checked_in_at: new Date().toISOString() }
        sync.add(ci); setExc(false); setQ('')
        setUndo({ ids: [ci.id], label: `${p.name} · ${p.type}`, until: Date.now() + 10000 })
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

function SyncPill({ s }: { s: SyncStatus }) {
  const base = 'inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold'
  if (s.online === false) return <span className={`${base} bg-amber-50 text-amber-800 ring-1 ring-amber-200`} data-testid="sync-status"><CloudOff size={18} /> Offline – {s.pending} waiting to sync</span>
  if (s.pending > 0) return <span className={`${base} bg-cream-100 text-navy-800`} data-testid="sync-status"><RefreshCw size={18} className="animate-spin" /> Syncing {s.pending}…</span>
  if (s.online === null) return <span className={`${base} bg-cream-100 text-navy-700`} data-testid="sync-status"><RefreshCw size={18} /> Connecting…</span>
  return <span className={`${base} bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200`} data-testid="sync-status"><Wifi size={18} /> Synced · live</span>
}

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }
function ScanModal({ onClose, onCode }: { onClose: () => void; onCode: (c: string) => boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [camState, setCamState] = useState<'starting' | 'on' | 'unsupported' | 'denied'>('starting')
  const onCodeRef = useRef(onCode); onCodeRef.current = onCode
  useEffect(() => {
    const BD = (window as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector
    if (!BD || !navigator.mediaDevices?.getUserMedia) { setCamState('unsupported'); return }
    let stream: MediaStream | null = null, raf = 0, stop = false
    const det = new BD({ formats: ['qr_code'] })
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then((s) => {
      stream = s; if (stop || !video.current) { s.getTracks().forEach((t) => t.stop()); return }
      video.current.srcObject = s; void video.current.play(); setCamState('on')
      const loop = async () => {
        if (stop || !video.current) return
        try { const r = await det.detect(video.current); if (r[0]) { if (onCodeRef.current(r[0].rawValue)) return; setErr(`No guest found for code “${r[0].rawValue}”.`) } } catch { /* keep scanning */ }
        raf = requestAnimationFrame(() => setTimeout(loop, 250) as unknown as void)
      }
      void loop()
    }).catch(() => setCamState('denied'))
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()) }
  }, [])
  return (
    <Modal open onClose={onClose} title="Scan QR code" wide>
      {camState === 'on' || camState === 'starting'
        ? <div className="relative overflow-hidden rounded-xl bg-cream-100"><video ref={video} className="aspect-video w-full object-cover" muted playsInline /><div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-brand-500/80" />{camState === 'starting' && <div className="absolute inset-0 flex items-center justify-center text-navy-700"><Camera size={22} className="mr-2" /> Starting camera…</div>}</div>
        : <div className="rounded-xl bg-cream-100 p-5 text-navy-800"><Camera size={22} className="mb-1 text-brand-600" />{camState === 'unsupported' ? 'Camera scanning isn’t available in this browser.' : 'Camera permission was not given.'} Type the code printed under the guest’s QR instead.</div>}
      <form className="mt-4 flex flex-wrap gap-3" onSubmit={(e) => { e.preventDefault(); if (!code.trim()) return; if (!onCodeRef.current(code)) setErr(`No guest found for code “${code.trim()}”.`) }}>
        <label htmlFor="qr" className="sr-only">QR code</label>
        <input id="qr" value={code} onChange={(e) => { setCode(e.target.value); setErr('') }} placeholder="e.g. AAFE-3F9C…" autoCapitalize="characters" autoComplete="off" data-testid="qr-input"
          className="h-16 min-w-0 flex-1 rounded-xl border-2 border-navy-100 bg-surface px-4 text-xl uppercase tracking-wide text-navy-900 placeholder:normal-case placeholder:tracking-normal placeholder:text-navy-500 focus:border-brand-500 focus:outline-none" />
        <button className="btn-primary tap h-16 rounded-xl px-8 text-lg" data-testid="qr-submit"><QrCode size={22} /> Check in</button>
      </form>
      {err && <p className="mt-3 text-base font-medium text-rose-700" role="alert">{err}</p>}
      <button className="btn-ghost tap mt-4 h-12" onClick={onClose}><ArrowLeft size={18} /> Back to guest list</button>
    </Modal>
  )
}

function ExceptionModal({ gala, prefill, onClose, onSave }: { gala: Gala; prefill: string; onClose: () => void; onSave: (p: { name: string; type: string; orderId: string; note: string }) => void }) {
  const [f, setF] = useState({ name: prefill.trim(), type: EXCEPTION_TYPES[0], orderId: '', note: '' })
  const sponsors = door.sponsors.filter((s) => s.event_id === gala.id).sort((a, b) => a.name.localeCompare(b.name))
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
                className={`tap min-h-[56px] rounded-xl border-2 px-4 py-2 text-left text-base font-medium ${f.type === t ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-navy-100 bg-surface text-navy-800'}`}>{t}</button>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="xs" className="mb-1 block text-base font-medium text-navy-800">With sponsor <span className="font-normal text-navy-500">(optional)</span></label>
          <select id="xs" className="input h-14 text-base" value={f.orderId} onChange={(e) => setF({ ...f, orderId: e.target.value })}><option value="">No sponsor / not sure</option>{sponsors.map((s) => <option key={s.order_id} value={s.order_id}>{s.name}</option>)}</select>
        </div>
        <div>
          <label htmlFor="xo" className="mb-1 block text-base font-medium text-navy-800">Note <span className="font-normal text-navy-500">(optional — e.g. who approved)</span></label>
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
