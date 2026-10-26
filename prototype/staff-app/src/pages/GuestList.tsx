import { useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { GUEST_TYPE_LABEL, sponsorOf } from '@shared/data'
import { Link, Pill, ago, downloadCsv } from '@shared/ui'
import type { EventTable, Guest, GuestType } from '@shared/types'
import { PageHead } from '../App'
import { canDo } from '../api'
import { SeatPill } from '../components'
import { useStaff } from '../store'
import { curOrders } from './Dashboard'
import { NOTICE, csvName, isDemo } from '../exports'

// Spreadsheet-style grid: edit any cell, changes save on blur and are written to the activity log.
const EDITABLE: { k: keyof Guest; label: string; w: string }[] = [
  { k: 'first_name', label: 'First', w: 'w-28' }, { k: 'last_name', label: 'Last', w: 'w-28' }, { k: 'title', label: 'Title', w: 'w-48' },
  { k: 'organization', label: 'Organization', w: 'w-52' }, { k: 'email', label: 'Email', w: 'w-56' },
  { k: 'dietary_needs', label: 'Dietary', w: 'w-32' }, { k: 'accessibility_needs', label: 'Accessibility', w: 'w-36' },
]
const BADGE_TONE = { needs_review: 'amber', ready: 'green', printed: 'gray', reprint_needed: 'red' } as const

function Cell({ g, k, w }: { g: Guest; k: keyof Guest; w: string }) {
  const { api, act } = useStaff()
  const [v, setV] = useState(String(g[k] ?? ''))
  const [prev, setPrev] = useState(g[k])
  if (prev !== g[k]) { setPrev(g[k]); setV(String(g[k] ?? '')) }
  // A textarea, so long text wraps onto more lines instead of being cut off (Oct 20 walk-through); .grow-wrap makes it as
  // tall as its text. Enter still saves, and a pasted line break becomes a space, so a cell never holds one.
  return <div className={`grow-wrap ${w}`} data-value={v}><textarea rows={1} aria-label={`${k} for ${g.first_name} ${g.last_name}`} className="rounded border border-transparent bg-transparent px-1.5 py-1 text-sm text-navy-900 hover:border-navy-100 focus:border-brand-500 focus:bg-surface focus:outline-none"
    value={v} onChange={(e) => setV(e.target.value.replace(/\s*\n\s*/g, ' '))} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
    // A refused save (a bad email, a blank name) puts the saved value back, so the cell never shows what wasn't saved
    // (#242); the toast says why.
    onBlur={() => { if (v !== String(g[k] ?? '')) void act(api.updateGuest(g.id, { [k]: v || (k.endsWith('needs') ? null : '') })).then((ok) => { if (!ok) setV(String(g[k] ?? '')) }) }} /></div>
}

/** The guest's table, for the badge (decided Oct 17: replaces the seating chart). Picking a table takes its first open seat. */
function TablePicker({ g, tables }: { g: Guest; tables: EventTable[] }) {
  const { db, api, act, user } = useStaff()
  const name = `${g.first_name} ${g.last_name}`
  const taken = (t: EventTable) => new Set(db.guests.filter((x) => x.table_id === t.id && x.id !== g.id).map((x) => x.seat_number))
  const freeSeat = (t: EventTable) => Array.from({ length: t.capacity }, (_, i) => i + 1).find((n) => !taken(t).has(n)) ?? null
  const pick = (id: string) => {
    if (!id) { void act(api.assignSeat(g.id, null, null), `${name}: no table`); return }
    const t = tables.find((x) => x.id === id)
    const seat = t ? freeSeat(t) : null
    if (!t || seat === null) throw new Error(`Table ${id} has no open seat; full tables can't be picked`)
    void act(api.assignSeat(g.id, t.id, seat), `${name} → Table ${t.number}`)
  }
  return (
    <select aria-label={`Table for ${name}`} className="input w-36 py-1 text-sm" value={g.table_id ?? ''} disabled={!canDo(user.role, 'assignSeat')} onChange={(e) => pick(e.target.value)}>
      <option value="">No table</option>
      {tables.map((t) => {
        const open = t.capacity - taken(t).size
        return <option key={t.id} value={t.id} disabled={open < 1 && t.id !== g.table_id}>Table {t.number}{t.id === g.table_id ? '' : open < 1 ? ' (full)' : ` (${open} open)`}</option>
      })}
    </select>
  )
}

export default function GuestList() {
  const { db, api, act } = useStaff()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  // AAFE's Oct 20 walk-through: a comp just added sat at row 163 of 554, under its comp order's sponsor, with no way to
  // pick out comps or see the newest. A guest-type filter and a newest-first order find it.
  const [type, setType] = useState<GuestType | 'all'>('all')
  // Item 11: one table's guests (or those with no table yet), or everyone ordered by table, for the seating check and its CSV.
  const [table, setTable] = useState('all')
  const [order, setOrder] = useState<'sponsor' | 'newest' | 'table'>('sponsor')
  const orderIds = new Set(curOrders(db).map((o) => o.id))
  const tables = db.event_tables.filter((t) => t.event_id === db.meta.current_event_id).sort((a, b) => a.number - b.number)
  const rows = useMemo(() => db.guests.filter((g) => orderIds.has(g.order_id)).map((g) => {
    const o = db.orders.find((x) => x.id === g.order_id)!
    return { g, o, sponsor: sponsorOf(db, o.sponsor_id).organization_name, seat: db.seats.find((s) => s.guest_id === g.id)!, table: db.event_tables.find((t) => t.id === g.table_id) }
  }).filter((r) => (status === 'all' || r.seat.status === status) && (type === 'all' || r.g.guest_type === type)
      && (table === 'all' || (table === 'none' ? !r.g.table_id : r.g.table_id === table))
      && `${r.g.first_name} ${r.g.last_name} ${r.g.organization} ${r.sponsor}`.toLowerCase().includes(q.toLowerCase()))
    // by table: no table last (Infinity - Infinity is NaN, which falls through to the sponsor)
    .sort((a, b) => (order === 'newest' ? b.g.created_at.localeCompare(a.g.created_at) : order === 'table' ? (a.table?.number ?? Infinity) - (b.table?.number ?? Infinity) : 0)
      || a.sponsor.localeCompare(b.sponsor) || a.seat.slot_number - b.seat.slot_number), [db, q, status, type, table, order]) // eslint-disable-line

  const exportCsv = () => downloadCsv(csvName(db, 'aafe-gala-guest-list'), [
    ...(isDemo(db) ? [NOTICE] : []),
    ['First', 'Last', 'Title', 'Organization', 'Email', 'Sponsor', 'Guest type', 'Dietary', 'Accessibility', 'Table', 'Seat', 'Seat status', 'Badge', 'Last updated by', 'Updated at'],
    ...rows.map(({ g, sponsor, seat, table }) => [g.first_name, g.last_name, g.title, g.organization, g.email, sponsor, g.guest_type, g.dietary_needs, g.accessibility_needs, table?.number, g.seat_number, seat.status, g.badge_status, g.last_updated_by, g.updated_at]),
  ])

  return (
    <div>
      <PageHead title="Guest list" sub="Everything guests enter in the portal lands here. Click any cell to edit — like a spreadsheet, but every change is timestamped. Pick each guest’s table here; it prints on the badge." actions={<button className="btn-ghost" onClick={exportCsv}><Download size={15} /> Export CSV</button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative w-full max-w-[16rem]"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" /><input className="input pl-9" placeholder="Search guests or sponsors" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search guests" /></div>
        <select className="input w-48" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="all">All statuses</option><option value="submitted">Needs review</option><option value="reviewed">Reviewed</option><option value="badge_ready">Badge ready</option><option value="checked_in">Checked in</option>
        </select>
        <select className="input w-56" value={type} onChange={(e) => setType(e.target.value as GuestType | 'all')} aria-label="Filter by guest type">
          <option value="all">All guest types</option>
          {(Object.keys(GUEST_TYPE_LABEL) as GuestType[]).map((t) => <option key={t} value={t}>{t === 'comp_relationship' ? 'Relationship guests (comps)' : GUEST_TYPE_LABEL[t]}</option>)}
        </select>
        <select className="input w-40" value={table} onChange={(e) => setTable(e.target.value)} aria-label="Filter by table">
          <option value="all">All tables</option><option value="none">No table yet</option>
          {tables.map((t) => <option key={t.id} value={t.id}>Table {t.number}</option>)}
        </select>
        <select className="input w-44" value={order} onChange={(e) => setOrder(e.target.value as 'sponsor' | 'newest' | 'table')} aria-label="Order">
          <option value="sponsor">Sponsor, A to Z</option><option value="newest">Newest first</option><option value="table">By table</option>
        </select>
        <span className="self-center text-sm text-navy-500" data-testid="guest-count">{rows.length} guest{rows.length === 1 ? '' : 's'}</span>
      </div>
      <div className="card overflow-auto" style={{ maxHeight: '70vh' }}>
        <table className="w-max min-w-full border-separate border-spacing-0" data-testid="guest-grid">
          <thead className="sticky top-0 z-10 bg-cream-100"><tr>
            <th className="th sticky left-0 z-20 border-b border-navy-100 bg-cream-100">Sponsor</th>
            {EDITABLE.map((c) => <th key={c.k} className="th border-b border-navy-100">{c.label}</th>)}
            <th className="th border-b border-navy-100">Table</th><th className="th border-b border-navy-100">Status</th><th className="th border-b border-navy-100">Badge</th><th className="th border-b border-navy-100">Last change</th><th className="th border-b border-navy-100"></th>
          </tr></thead>
          <tbody>
            {rows.map(({ g, o, sponsor, seat }) => (
              <tr key={g.id} className="hover:bg-navy-50">
                {/* Item 29: the sponsor's name opens its order page, and wraps rather than being cut off. */}
                <td className="sticky left-0 border-b border-navy-100 bg-surface px-3 py-1.5 text-sm"><Link to={`/sponsors/${o.id}`} className="block w-44 break-words font-medium text-navy-800 hover:text-brand-600 hover:underline">{sponsor}</Link>{g.guest_type === 'comp_relationship' && <Pill tone="brand">Comp</Pill>}</td>
                {EDITABLE.map((c) => <td key={c.k} className="border-b border-navy-100 px-1 py-1"><Cell g={g} k={c.k} w={c.w} /></td>)}
                <td className="border-b border-navy-100 px-1 py-1"><TablePicker g={g} tables={tables} /></td>
                <td className="border-b border-navy-100 px-3"><SeatPill s={seat.status} /></td>
                <td className="border-b border-navy-100 px-3"><Pill tone={BADGE_TONE[g.badge_status]}>{g.badge_status.replace('_', ' ')}</Pill></td>
                <td className="whitespace-nowrap border-b border-navy-100 px-3 text-xs text-navy-500">{g.last_updated_by === 'guest_portal' ? 'Guest portal' : 'Staff'} · {ago(g.updated_at)}</td>
                <td className="border-b border-navy-100 px-3">{seat.status === 'submitted' && <button className="btn-ghost btn-sm" onClick={() => void act(api.setSeatStatus(g.id, 'reviewed'), 'Reviewed')}>Review</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
