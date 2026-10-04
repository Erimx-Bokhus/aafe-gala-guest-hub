import { useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { sponsorOf } from '@shared/data'
import { Pill, ago, downloadCsv } from '@shared/ui'
import type { Guest } from '@shared/types'
import { PageHead } from '../App'
import { SeatPill } from '../components'
import { setSeatStatus, updateGuest, useStaff } from '../store'
import { curOrders } from './Dashboard'

// Spreadsheet-style grid: edit any cell, changes save on blur and are written to the activity log.
const EDITABLE: { k: keyof Guest; label: string; w: string }[] = [
  { k: 'first_name', label: 'First', w: 'w-28' }, { k: 'last_name', label: 'Last', w: 'w-28' }, { k: 'title', label: 'Title', w: 'w-48' },
  { k: 'organization', label: 'Organization', w: 'w-52' }, { k: 'email', label: 'Email', w: 'w-56' },
  { k: 'dietary_needs', label: 'Dietary', w: 'w-32' }, { k: 'accessibility_needs', label: 'Accessibility', w: 'w-36' },
]
const BADGE_TONE = { needs_review: 'amber', ready: 'green', printed: 'gray', reprint_needed: 'red' } as const

function Cell({ g, k, w }: { g: Guest; k: keyof Guest; w: string }) {
  const { update, user } = useStaff()
  const [v, setV] = useState(String(g[k] ?? ''))
  const [prev, setPrev] = useState(g[k])
  if (prev !== g[k]) { setPrev(g[k]); setV(String(g[k] ?? '')) }
  return <input aria-label={`${k} for ${g.first_name} ${g.last_name}`} className={`${w} rounded border border-transparent bg-transparent px-1.5 py-1 text-sm text-navy-900 hover:border-navy-100 focus:border-brand-500 focus:bg-surface focus:outline-none`}
    value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    onBlur={() => { if (v !== String(g[k] ?? '')) update((d) => updateGuest(d, user.name, g.id, { [k]: v || (k.endsWith('needs') ? null : '') })) }} />
}

export default function GuestList() {
  const { db, update, user, toast } = useStaff()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const orderIds = new Set(curOrders(db).map((o) => o.id))
  const rows = useMemo(() => db.guests.filter((g) => orderIds.has(g.order_id)).map((g) => {
    const o = db.orders.find((x) => x.id === g.order_id)!
    return { g, o, sponsor: sponsorOf(db, o.sponsor_id).organization_name, seat: db.seats.find((s) => s.guest_id === g.id)!, table: db.event_tables.find((t) => t.id === g.table_id) }
  }).filter((r) => (status === 'all' || r.seat.status === status) && `${r.g.first_name} ${r.g.last_name} ${r.g.organization} ${r.sponsor}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.sponsor.localeCompare(b.sponsor) || a.seat.slot_number - b.seat.slot_number), [db, q, status]) // eslint-disable-line

  const exportCsv = () => downloadCsv('aafe-gala-guest-list-SYNTHETIC.csv', [
    ['Capstone prototype — synthetic demonstration data only'],
    ['First', 'Last', 'Title', 'Organization', 'Email', 'Sponsor', 'Guest type', 'Dietary', 'Accessibility', 'Table', 'Seat', 'Seat status', 'Badge', 'Last updated by', 'Updated at'],
    ...rows.map(({ g, sponsor, seat, table }) => [g.first_name, g.last_name, g.title, g.organization, g.email, sponsor, g.guest_type, g.dietary_needs, g.accessibility_needs, table?.number, g.seat_number, seat.status, g.badge_status, g.last_updated_by, g.updated_at]),
  ])

  return (
    <div>
      <PageHead title="Guest list" sub="Everything guests enter in the portal lands here. Click any cell to edit — like a spreadsheet, but every change is timestamped." actions={<button className="btn-ghost" onClick={exportCsv}><Download size={15} /> Export CSV</button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative w-full max-w-xs"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" /><input className="input pl-9" placeholder="Search guests or sponsors" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search guests" /></div>
        <select className="input w-48" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option><option value="submitted">Needs review</option><option value="reviewed">Reviewed</option><option value="badge_ready">Badge ready</option><option value="checked_in">Checked in</option>
        </select>
        <span className="self-center text-sm text-navy-500">{rows.length} guests</span>
      </div>
      <div className="card overflow-auto" style={{ maxHeight: '70vh' }}>
        <table className="w-max min-w-full border-separate border-spacing-0" data-testid="guest-grid">
          <thead className="sticky top-0 z-10 bg-cream-100"><tr>
            <th className="th sticky left-0 z-20 border-b border-navy-100 bg-cream-100">Sponsor</th>
            {EDITABLE.map((c) => <th key={c.k} className="th border-b border-navy-100">{c.label}</th>)}
            <th className="th border-b border-navy-100">Table · seat</th><th className="th border-b border-navy-100">Status</th><th className="th border-b border-navy-100">Badge</th><th className="th border-b border-navy-100">Last change</th><th className="th border-b border-navy-100"></th>
          </tr></thead>
          <tbody>
            {rows.map(({ g, sponsor, seat, table }) => (
              <tr key={g.id} className="hover:bg-navy-50">
                <td className="sticky left-0 border-b border-navy-100 bg-surface px-3 py-1.5 text-sm"><div className="w-44 truncate font-medium text-navy-800" title={sponsor}>{sponsor}</div>{g.guest_type === 'comp_relationship' && <Pill tone="brand">Comp</Pill>}</td>
                {EDITABLE.map((c) => <td key={c.k} className="border-b border-navy-100 px-1 py-1"><Cell g={g} k={c.k} w={c.w} /></td>)}
                <td className="whitespace-nowrap border-b border-navy-100 px-3 text-sm tabular-nums">{table ? `T${table.number} · S${g.seat_number}` : <span className="text-amber-700">—</span>}</td>
                <td className="border-b border-navy-100 px-3"><SeatPill s={seat.status} /></td>
                <td className="border-b border-navy-100 px-3"><Pill tone={BADGE_TONE[g.badge_status]}>{g.badge_status.replace('_', ' ')}</Pill></td>
                <td className="whitespace-nowrap border-b border-navy-100 px-3 text-xs text-navy-500">{g.last_updated_by === 'guest_portal' ? 'Guest portal' : 'Staff'} · {ago(g.updated_at)}</td>
                <td className="border-b border-navy-100 px-3">{seat.status === 'submitted' && <button className="btn-ghost btn-sm" onClick={() => { update((d) => setSeatStatus(d, user.name, g.id, 'reviewed')); toast('Reviewed') }}>Review</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
