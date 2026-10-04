import { useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { sponsorOf } from '@shared/data'
import { downloadCsv } from '@shared/ui'
import type { Guest } from '@shared/types'
import { PageHead } from '../App'
import { QR } from '../qr'
import { markPrinted, useStaff } from '../store'
import { curOrders } from './Dashboard'

// Badge template. Never prints: payment info, relationship owner/notes, email, dietary/accessibility.
interface Tpl { title: boolean; org: boolean; sponsor: boolean; tableSeat: boolean; qr: boolean }

function Badge({ g, sponsor, table, tpl, year }: { g: Guest; sponsor: string; table?: number; tpl: Tpl; year: number }) {
  return (
    <div className="badge-card flex aspect-[4/3] flex-col overflow-hidden rounded-lg border border-[#DFE5EE] bg-white text-[#101A2C] shadow-sm">
      <div className="flex items-center justify-between border-b-4 border-[#C64C28] px-4 py-1.5">
        <span className="flex items-center gap-1.5"><img src="./brand/aafe-mark-orange.png" alt="" className="h-6 w-6" /><span className="font-sans text-sm font-bold text-[#313131]">AAFE</span></span>
        <span className="text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-[#C64C28]">Annual Gala {year}</span>
      </div>
      <div className="flex flex-1 items-center gap-3 px-4">
        <div className="min-w-0 flex-1">
          <div className="font-sans text-xl font-bold leading-tight">{g.first_name} {g.last_name}</div>
          {tpl.title && g.title && <div className="mt-0.5 text-xs text-[#3A4B66]">{g.title}</div>}
          {tpl.org && g.organization && <div className="text-xs font-semibold text-[#3A4B66]">{g.organization}</div>}
        </div>
        {tpl.qr && g.qr_token && <QR value={g.qr_token} size={52} />}
      </div>
      <div className="border-t border-[#EEE6D8] px-4 py-1.5">
        {tpl.tableSeat && <div className="text-sm font-bold">{table ? `Table ${table} · Seat ${g.seat_number}` : 'Table assignment pending'}</div>}
        {tpl.sponsor && <div className="truncate text-[0.6875rem] text-[#4B5E7C]">{g.guest_type === 'comp_relationship' ? 'Guest of AAFE' : `Sponsored by ${sponsor}`}</div>}
      </div>
    </div>
  )
}

export default function Badges() {
  const { db, update, user, toast } = useStaff()
  const [tpl, setTpl] = useState<Tpl>({ title: true, org: true, sponsor: true, tableSeat: true, qr: false })
  const [filter, setFilter] = useState<'ready' | 'reprint_needed' | 'all'>('ready')
  const ids = new Set(curOrders(db).map((o) => o.id))
  const year = db.gala_events.find((e) => e.id === db.meta.current_event_id)!.year
  const all = db.guests.filter((g) => ids.has(g.order_id))
  const list = all.filter((g) => filter === 'all' || g.badge_status === filter)
  const sp = (g: Guest) => sponsorOf(db, db.orders.find((o) => o.id === g.order_id)!.sponsor_id).organization_name
  const tn = (g: Guest) => db.event_tables.find((t) => t.id === g.table_id)?.number
  const count = (s: Guest['badge_status']) => all.filter((g) => g.badge_status === s).length
  const toggle = (k: keyof Tpl, l: string) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tpl[k]} onChange={(e) => setTpl({ ...tpl, [k]: e.target.checked })} className="h-4 w-4 accent-[#C64C28]" /> {l}</label>
  return (
    <div>
      <PageHead title="Badges" sub="Badges fill in from the guest list and seating chart. Editing a printed badge’s name, title, organization or seat flags it for reprint."
        actions={<>
          <button className="btn-ghost" onClick={() => downloadCsv('aafe-badges-SYNTHETIC.csv', [['Capstone prototype — synthetic demonstration data only'], ['First', 'Last', 'Title', 'Organization', 'Table', 'Seat', 'Affiliation'], ...list.map((g) => [g.first_name, g.last_name, g.title, g.organization, tn(g), g.seat_number, g.guest_type === 'comp_relationship' ? 'Guest of AAFE' : sp(g)])])}><Download size={15} /> CSV for printer</button>
          <button className="btn-ghost" onClick={() => window.print()}><Printer size={15} /> Print sheet</button>
          <button className="btn-primary" disabled={!list.length || filter === 'all'} onClick={() => { update((d) => markPrinted(d, user.name, list.map((g) => g.id))); toast(`${list.length} badges marked printed`) }}>Mark {list.length} printed</button>
        </>} />
      <div className="no-print mb-5 grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
          <span className="label mb-0">Template</span>
          {toggle('title', 'Title')}{toggle('org', 'Organization')}{toggle('tableSeat', 'Table & seat')}{toggle('sponsor', 'Sponsor line')}{toggle('qr', 'QR (relationship guests)')}
        </div>
        <div className="card flex items-center gap-1 p-1.5" role="tablist" aria-label="Badge filter">
          {([['ready', `Ready (${count('ready')})`], ['reprint_needed', `Reprint (${count('reprint_needed')})`], ['all', `All (${all.length})`]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${filter === k ? 'bg-ink text-white dark:bg-navy-100' : 'text-navy-600 hover:bg-navy-50'}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="badge-sheet grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="badge-sheet">
        {list.map((g) => <Badge key={g.id} g={g} sponsor={sp(g)} table={tn(g)} tpl={tpl} year={year} />)}
      </div>
      {!list.length && <p className="card p-6 text-center text-sm text-navy-500">No badges in this view.</p>}
      <p className="no-print mt-6 text-xs text-navy-500">Capstone prototype — synthetic demonstration data only. Never printed: payment details, relationship notes, email, dietary or accessibility needs.</p>
    </div>
  )
}
