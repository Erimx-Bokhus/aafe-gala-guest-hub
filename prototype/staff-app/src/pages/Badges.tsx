import { useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { GUEST_TYPE_LABEL, hasSponsor, sponsorOf, tableLabel, tierOf } from '@shared/data'
import { downloadCsv } from '@shared/ui'
import type { EventTable, Guest } from '@shared/types'
import { PageHead } from '../App'
import { QR } from '../qr'
import { useStaff } from '../store'
import { curOrders } from './Dashboard'
import { badgeCsv, csvName, isDemo } from '../exports'

// Badge template. Never prints: payment info, relationship owner/notes, email, dietary/accessibility.
interface Tpl { title: boolean; org: boolean; sponsor: boolean; table: boolean; qr: boolean }

// AAFE's Oct 20 walk-through: the gala's own name heads the badge, as typed in Gala information ("AAFE's 53rd Annual
// Gala", item 27), and a sponsor's guest shows the sponsorship level in larger type over the sponsor's name (item 25).
// The level's name is edited on Sponsorship levels.
function Badge({ g, sponsor, level, table, tpl, gala }: { g: Guest; sponsor: string; level: string | null; table?: EventTable; tpl: Tpl; gala: string }) {
  return (
    <div className="badge-card flex aspect-[4/3] flex-col overflow-hidden rounded-lg border border-[#EBEBEB] bg-white text-[#000000] shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b-4 border-[#C64C28] px-4 py-1.5">
        <span className="flex shrink-0 items-center gap-1.5"><img src="./brand/aafe-mark-orange.png" alt="" className="h-6 w-6" /><span className="font-sans text-sm font-bold text-[#000000]">AAFE</span></span>
        <span className="truncate text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-[#C64C28]" title={gala}>{gala}</span>
      </div>
      <div className="flex flex-1 items-center gap-3 px-4">
        <div className="min-w-0 flex-1">
          <div className="font-sans text-xl font-bold leading-tight">{g.first_name} {g.last_name}</div>
          {tpl.title && g.title && <div className="mt-0.5 text-xs text-[#4D4C4C]">{g.title}</div>}
          {tpl.org && g.organization && <div className="text-xs font-semibold text-[#4D4C4C]">{g.organization}</div>}
        </div>
        {tpl.qr && g.qr_token && <QR value={g.qr_token} size={52} />}
      </div>
      <div className="border-t border-[#EBEBEB] px-4 py-1.5">
        {/* A guest admitted without a table (most of them) gets no table line (Oct 25). No seat number: AAFE doesn't seat
            guests at numbered places (36:39), only at tables, which can have a name beside the number (32:58). */}
        {tpl.table && table && <div className="text-sm font-bold" data-testid="badge-table">{tableLabel(table)}</div>}
        {tpl.sponsor && (level
          ? <><div className="text-sm font-bold leading-tight text-[#C64C28]" data-testid="badge-level">{level}</div><div className="truncate text-[0.6875rem] text-[#4D4C4C]">{sponsor}</div></>
          : <div className="truncate text-[0.6875rem] text-[#4D4C4C]">{hasSponsor(g.guest_type) ? `Sponsored by ${sponsor}` : GUEST_TYPE_LABEL[g.guest_type]}</div>)}
      </div>
    </div>
  )
}

export default function Badges() {
  const { db, api, act } = useStaff()
  const [tpl, setTpl] = useState<Tpl>({ title: true, org: true, sponsor: true, table: true, qr: false })
  const [filter, setFilter] = useState<Guest['badge_status'] | 'all'>('ready')
  const ids = new Set(curOrders(db).map((o) => o.id))
  const gala = db.gala_events.find((e) => e.id === db.meta.current_event_id)
  if (!gala) throw new Error(`No gala event ${db.meta.current_event_id}`)
  const all = db.guests.filter((g) => ids.has(g.order_id))
  const list = all.filter((g) => filter === 'all' || g.badge_status === filter)
  const orderOf = (g: Guest) => { const o = db.orders.find((x) => x.id === g.order_id); if (!o) throw new Error(`Guest ${g.id} has no order`); return o }
  const sp = (g: Guest) => sponsorOf(db, orderOf(g).sponsor_id).organization_name
  const level = (g: Guest) => { const t = tierOf(db, orderOf(g).tier_id); return g.guest_type === 'sponsor_guest' && t.tier_category === 'sponsorship' ? t.name : null }
  const tn = (g: Guest) => db.event_tables.find((t) => t.id === g.table_id)
  const labelOf = new Map(db.event_tables.filter((t) => t.event_id === gala.id).map((t) => [t.number, t.label]))
  const count = (s: Guest['badge_status']) => all.filter((g) => g.badge_status === s).length
  // Item 13 (D3): the Badge status is the one to change, and in bulk. Marking a badge ready also confirms the name when
  // nobody has yet (the server takes submitted -> reviewed -> badge ready, one step at a time). A guest already checked
  // in, or whose seat was released, is left as is.
  const seatOf = (g: Guest) => db.seats.find((s) => s.guest_id === g.id)
  const readyable = filter === 'needs_review' ? list.filter((g) => ['submitted', 'reviewed'].includes(seatOf(g)?.status ?? '')) : []
  const markReady = () => void act((async () => {
    for (const g of readyable) {
      if (seatOf(g)?.status === 'submitted') await api.setSeatStatus(g.id, 'reviewed')
      await api.setSeatStatus(g.id, 'badge_ready')
    }
  })(), `${readyable.length} badge${readyable.length === 1 ? '' : 's'} marked ready`)
  const toggle = (k: keyof Tpl, l: string) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tpl[k]} onChange={(e) => setTpl({ ...tpl, [k]: e.target.checked })} className="h-4 w-4 accent-[#C64C28]" /> {l}</label>
  return (
    <div>
      <PageHead title="Badges" sub="Badges fill in from the guest list, table number included. Each badge goes Needs review → Ready → Printed; changing a printed badge’s name, title, organization or table flags it for reprint."
        actions={<>
          <button className="btn-ghost" data-testid="export-badges" disabled={filter === 'needs_review'} title={filter === 'needs_review' ? 'Badges that need review aren’t ready to print' : undefined} onClick={() => void act(api.exportBadges(filter === 'all' || filter === 'printed').then((rows) => downloadCsv(csvName(db, 'aafe-badges'), badgeCsv((filter === 'all' ? rows : rows.filter((r) => r.badge_status === filter)).map((r) => ({ ...r, table_name: r.table_number == null ? null : labelOf.get(r.table_number) ?? null })), isDemo(db)))), 'Badge file downloaded')}><Download size={15} /> CSV for printer</button>
          <button className="btn-ghost" onClick={() => window.print()}><Printer size={15} /> Print sheet</button>
          {filter === 'needs_review'
            ? <button className="btn-primary" data-testid="mark-ready" disabled={!readyable.length} onClick={markReady}>Mark {readyable.length} ready</button>
            : <button className="btn-primary" disabled={!list.length || filter === 'all' || filter === 'printed'} onClick={() => void act(api.markPrinted(list.map((g) => g.id)), `${list.length} badges marked printed`)}>Mark {list.length} printed</button>}
        </>} />
      <div className="no-print mb-5 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
          <span className="label mb-0">Template</span>
          {toggle('title', 'Title')}{toggle('org', 'Organization')}{toggle('table', 'Table')}{toggle('sponsor', 'Sponsorship level')}{toggle('qr', 'QR (relationship guests)')}
        </div>
        <div className="card flex flex-wrap items-center gap-1 p-1.5" role="tablist" aria-label="Badge filter">
          {([['needs_review', `Needs review (${count('needs_review')})`], ['ready', `Ready (${count('ready')})`], ['reprint_needed', `Reprint (${count('reprint_needed')})`], ['printed', `Printed (${count('printed')})`], ['all', `All (${all.length})`]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`min-h-[44px] rounded-full border-2 px-6 text-sm font-semibold ${filter === k ? 'border-brand-500 bg-brand-500 text-white' : 'border-transparent text-navy-600 hover:bg-navy-50'}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="badge-sheet grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="badge-sheet">
        {list.map((g) => <Badge key={g.id} g={g} sponsor={sp(g)} level={level(g)} table={tn(g)} tpl={tpl} gala={gala.name} />)}
      </div>
      {!list.length && <p className="card p-6 text-center text-sm text-navy-500">No badges in this view.</p>}
      <p className="no-print mt-6 text-xs text-navy-500">Capstone prototype — synthetic demonstration data only. Never printed: payment details, relationship notes, email, dietary or accessibility needs.</p>
    </div>
  )
}
