// AAFE STAFF APP (the "client app": AAFE's gala team)
// Reads everything the guest portal writes (same database), plus Give Lively + Salesforce data.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Activity, Armchair, BadgeCheck, CalendarDays, ClipboardList, CreditCard, Heart, LayoutDashboard, LogOut, Menu, Plug, ScanLine, Table2, X } from 'lucide-react'
import { loadDB } from '@shared/data'
import { AafeLogo } from '@shared/Logo'
import { DisplayControls, go, Link, PrototypeBanner, Toast, useDisplayPrefs, useRoute } from '@shared/ui'
import type { DB, Role, StaffUser } from '@shared/types'
import { StaffCtx } from './store'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import GalaInfo from './pages/GalaInfo'
import Sponsors, { SponsorDetail } from './pages/Sponsors'
import GuestList from './pages/GuestList'
import Payments from './pages/Payments'
import Seating from './pages/Seating'
import Relationship from './pages/Relationship'
import Badges from './pages/Badges'
import CheckIn from './pages/CheckIn'
import Integrations from './pages/Integrations'
import AuditLog from './pages/AuditLog'

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; roles: Role[] }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['gala_admin', 'relationship_manager'] },
  { to: '/gala', label: 'Gala information', icon: CalendarDays, roles: ['gala_admin', 'relationship_manager'] },
  { to: '/sponsors', label: 'Sponsors & orders', icon: ClipboardList, roles: ['gala_admin', 'relationship_manager'] },
  { to: '/guests', label: 'Guest list', icon: Table2, roles: ['gala_admin', 'relationship_manager'] },
  { to: '/payments', label: 'Payments & fees', icon: CreditCard, roles: ['gala_admin', 'relationship_manager'] },
  { to: '/seating', label: 'Seating chart', icon: Armchair, roles: ['gala_admin', 'relationship_manager'] },
  { to: '/relationship', label: 'Relationship guests', icon: Heart, roles: ['gala_admin', 'relationship_manager'] },
  { to: '/badges', label: 'Badges', icon: BadgeCheck, roles: ['gala_admin', 'relationship_manager'] },
  { to: '/checkin', label: 'iPad check-in', icon: ScanLine, roles: ['gala_admin', 'relationship_manager', 'check_in_volunteer'] },
  { to: '/integrations', label: 'Integrations & email', icon: Plug, roles: ['gala_admin'] },
  { to: '/activity', label: 'Activity log', icon: Activity, roles: ['gala_admin', 'relationship_manager'] },
]
const ROLE_LABEL: Record<Role, string> = { gala_admin: 'Gala admin', relationship_manager: 'Relationship manager', check_in_volunteer: 'Check-in volunteer' }

export default function App() {
  const path = useRoute()
  const [db, setDb] = useState<DB>(loadDB)
  const [user, setUser] = useState<StaffUser | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const prefs = useDisplayPrefs()
  const update = useCallback((fn: (d: DB) => DB) => setDb((d) => fn(d)), [])
  const toast = useCallback((m: string) => setMsg(m), [])
  useEffect(() => setMenu(false), [path]) // close the phone menu after navigating
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [])

  if (!user) return <><PrototypeBanner /><Login db={db} prefs={prefs} onLogin={(u) => { setUser(u); go(u.role === 'check_in_volunteer' ? '/checkin' : '/') }} /></>

  const nav = NAV.filter((n) => n.roles.includes(user.role))
  const allowed = (p: string) => nav.some((n) => (n.to === '/' ? p === '/' : p.startsWith(n.to)))
  const p = allowed(path) ? path : nav[0].to
  let page: ReactNode
  if (p === '/') page = <Dashboard />
  else if (p === '/gala') page = <GalaInfo />
  else if (p.startsWith('/sponsors/')) page = <SponsorDetail key={p.split('/')[2]} id={p.split('/')[2]} />
  else if (p === '/sponsors') page = <Sponsors />
  else if (p === '/guests') page = <GuestList />
  else if (p === '/payments') page = <Payments />
  else if (p === '/seating') page = <Seating />
  else if (p === '/relationship') page = <Relationship />
  else if (p === '/badges') page = <Badges />
  else if (p === '/checkin') page = <CheckIn />
  else if (p === '/integrations') page = <Integrations />
  else if (p === '/activity') page = <AuditLog />
  else page = <Dashboard />

  const Side = (
    <nav aria-label="Staff navigation" className="flex h-full flex-col bg-brand-500 text-white">
      <div className="flex items-center gap-3 border-b border-brand-600 bg-white px-5 py-5 dark:bg-surface">
        <AafeLogo size="sm" />
      </div>
      <div className="px-5 pb-3 pt-5 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-white">Gala operations</div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {nav.map((n) => {
          const active = n.to === '/' ? p === '/' : p.startsWith(n.to)
          return (
            <li key={n.to}>
              <Link to={n.to} aria-current={active ? 'page' : undefined} className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${active ? 'bg-white text-brand-700' : 'text-white hover:bg-brand-600'}`}>
                <n.icon size={17} className={active ? 'text-brand-500' : 'text-white'} /> {n.label}
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="border-t border-brand-600 p-4">
        <div className="text-sm font-semibold text-white">{user.name}</div>
        <div className="text-xs text-white">{ROLE_LABEL[user.role]}</div>
        <button className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-white underline-offset-2 hover:underline" onClick={() => { setUser(null); go('/') }}><LogOut size={14} /> Sign out</button>
      </div>
    </nav>
  )

  return (
    <StaffCtx.Provider value={{ db, update, user, toast }}>
      <PrototypeBanner />
      <div className="flex min-h-[calc(100vh-28px)]">
        <aside className="no-print sticky top-0 hidden h-[calc(100vh-28px)] w-60 shrink-0 lg:block">{Side}</aside>
        {menu && <div className="no-print fixed inset-0 z-40 lg:hidden" onClick={() => setMenu(false)}><div className="h-full w-64" onClick={(e) => e.stopPropagation()}>{Side}</div><div className="absolute inset-0 -z-10 bg-black/50" /></div>}
        <div className="min-w-0 flex-1">
          <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-navy-100 bg-surface/95 px-4 py-2.5 backdrop-blur sm:px-6">
            <div className="flex items-center gap-2">
              <button className="icon-btn lg:hidden" aria-label={menu ? 'Close menu' : 'Open menu'} onClick={() => setMenu((m) => !m)}>{menu ? <X size={18} /> : <Menu size={18} />}</button>
              <div className="text-sm font-semibold text-navy-900">{db.gala_events.find((e) => e.id === db.meta.current_event_id)!.name}</div>
            </div>
            <DisplayControls prefs={prefs} />
          </header>
          <main className="px-4 py-6 sm:px-6 lg:px-8" onClick={() => menu && setMenu(false)}>{page}</main>
        </div>
      </div>
      <Toast msg={msg} onDone={() => setMsg(null)} />
    </StaffCtx.Provider>
  )
}

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold text-navy-900">{title}</h1>{sub && <p className="mt-1 max-w-3xl text-sm text-navy-600">{sub}</p>}</div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'brand' | 'green' | 'amber' }) {
  const c = tone === 'brand' ? 'text-brand-600' : tone === 'green' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : 'text-navy-900'
  return <div className="card p-4"><div className="text-xs font-semibold uppercase tracking-wide text-navy-500">{label}</div><div className={`mt-1 text-2xl font-semibold tabular-nums ${c}`}>{value}</div>{sub && <div className="mt-0.5 text-xs text-navy-500">{sub}</div>}</div>
}
