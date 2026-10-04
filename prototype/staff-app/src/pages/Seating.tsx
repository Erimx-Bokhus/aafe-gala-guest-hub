import { useState } from 'react'
import { UserRound, X } from 'lucide-react'
import { sponsorOf } from '@shared/data'
import type { Guest } from '@shared/types'
import { PageHead } from '../App'
import { assignSeat, seatOrderAtTable, useStaff } from '../store'
import { curOrders } from './Dashboard'

const PALETTE = ['#C64C28', '#2F6FB0', '#2E8B6E', '#8A5CC2', '#C2902E', '#B8476E', '#4B8F9E', '#6B7A2E', '#9E5B3C', '#3C5A9E', '#7A4B8F', '#5E8F4B', '#A0522D', '#476F8A', '#8F4B6B']

export default function Seating() {
  const { db, update, user, toast } = useStaff()
  const [sel, setSel] = useState<string | null>(null)
  const [grpOrder, setGrpOrder] = useState('')
  const [grpTable, setGrpTable] = useState('')
  const orders = curOrders(db)
  const color = Object.fromEntries(orders.map((o, i) => [o.id, PALETTE[i % PALETTE.length]]))
  const ids = new Set(orders.map((o) => o.id))
  const guests = db.guests.filter((g) => ids.has(g.order_id))
  const unseated = guests.filter((g) => !g.table_id)
  const tables = db.event_tables.filter((t) => t.event_id === db.meta.current_event_id)
  const selected = guests.find((g) => g.id === sel) ?? null
  const label = (g: Guest) => `${g.first_name} ${g.last_name}`
  const byOrder = orders.map((o) => ({ o, list: unseated.filter((g) => g.order_id === o.id) })).filter((x) => x.list.length)

  const clickSeat = (tableId: string, n: number) => {
    const occupant = guests.find((g) => g.table_id === tableId && g.seat_number === n)
    if (occupant) { setSel(occupant.id === sel ? null : occupant.id); return }
    if (!selected) { toast('Pick a guest first, then tap an open seat'); return }
    update((d) => assignSeat(d, user.name, selected.id, tableId, n))
    toast(`${label(selected)} → Table ${tables.find((t) => t.id === tableId)!.number}, seat ${n}`)
    setSel(null)
  }

  return (
    <div>
      <PageHead title="Seating chart" sub="Tap a guest, then tap an open seat. Tap a seated guest to move or unseat them. Table and seat print on the badge." />
      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="font-semibold text-navy-900">Seat a whole group</h2>
            <div className="mt-2 space-y-2">
              <select className="input" value={grpOrder} onChange={(e) => setGrpOrder(e.target.value)} aria-label="Sponsor group"><option value="">Choose sponsor…</option>{byOrder.map(({ o, list }) => <option key={o.id} value={o.id}>{sponsorOf(db, o.sponsor_id).organization_name} ({list.length})</option>)}</select>
              <select className="input" value={grpTable} onChange={(e) => setGrpTable(e.target.value)} aria-label="Table"><option value="">Choose table…</option>{tables.map((t) => <option key={t.id} value={t.id}>Table {t.number} — {t.capacity - guests.filter((g) => g.table_id === t.id).length} open</option>)}</select>
              <button className="btn-navy w-full" disabled={!grpOrder || !grpTable} onClick={() => { update((d) => seatOrderAtTable(d, user.name, grpOrder, grpTable)); toast('Group seated'); setGrpOrder('') }}>Seat group</button>
            </div>
          </section>
          {selected && (
            <section className="card border-brand-400 p-4" data-testid="selected-guest">
              <div className="flex items-start justify-between"><div><div className="font-semibold text-navy-900">{label(selected)}</div><div className="text-xs text-navy-500">{selected.title} · {sponsorOf(db, db.orders.find((o) => o.id === selected.order_id)!.sponsor_id).organization_name}</div></div><button onClick={() => setSel(null)} aria-label="Clear selection" className="text-navy-500"><X size={16} /></button></div>
              <p className="mt-2 text-sm text-navy-600">{selected.table_id ? `Table ${tables.find((t) => t.id === selected.table_id)?.number}, seat ${selected.seat_number}. Tap an open seat to move.` : 'Tap an open seat on the floor plan.'}</p>
              {selected.table_id && <button className="btn-ghost btn-sm mt-2" onClick={() => { update((d) => assignSeat(d, user.name, selected.id, null, null)); setSel(null) }}>Remove from seat</button>}
            </section>
          )}
          <section className="card p-4">
            <h2 className="font-semibold text-navy-900">Not yet seated ({unseated.length})</h2>
            <div className="mt-2 max-h-[52vh] space-y-3 overflow-y-auto">
              {byOrder.map(({ o, list }) => (
                <div key={o.id}>
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-navy-500"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color[o.id] }} />{sponsorOf(db, o.sponsor_id).organization_name}</div>
                  <ul className="space-y-1">{list.map((g) => <li key={g.id}><button onClick={() => setSel(g.id === sel ? null : g.id)} aria-pressed={g.id === sel} data-testid={`unseated-${g.id}`} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${g.id === sel ? 'bg-brand-500 text-white' : 'hover:bg-navy-50'}`}><UserRound size={14} /> {label(g)}</button></li>)}</ul>
                </div>
              ))}
              {!unseated.length && <p className="text-sm text-navy-500">Everyone with a name is seated.</p>}
            </div>
          </section>
        </aside>
        <section className="card overflow-x-auto p-3">
          <div className="relative mx-auto aspect-[16/11] min-w-[760px]" data-testid="floor-plan">
            <div className="absolute left-1/2 top-[3%] w-[40%] -translate-x-1/2 rounded-md bg-ink py-2 text-center text-xs font-semibold uppercase tracking-[0.2em] text-white">Stage</div>
            {tables.map((t) => {
              const at = guests.filter((g) => g.table_id === t.id)
              return (
                <div key={t.id} className="absolute aspect-square w-[14%] -translate-x-1/2 -translate-y-1/2" style={{ left: `${t.pos_x}%`, top: `${t.pos_y}%` }}>
                  <div className="absolute inset-[18%] flex flex-col items-center justify-center rounded-full border-2 border-navy-100 bg-cream-100 text-center">
                    <div className="text-sm font-bold text-navy-900">{t.number}</div>
                    <div className="text-[0.625rem] leading-tight text-navy-500">{at.length}/{t.capacity}</div>
                  </div>
                  {Array.from({ length: t.capacity }, (_, i) => {
                    const n = i + 1, a = (i / t.capacity) * 2 * Math.PI - Math.PI / 2
                    const g = at.find((x) => x.seat_number === n)
                    return (
                      <button key={n} onClick={() => clickSeat(t.id, n)} data-testid={`seat-${t.number}-${n}`}
                        title={g ? `${label(g)} — Table ${t.number}, seat ${n}` : `Table ${t.number}, seat ${n} (open)`} aria-label={g ? `${label(g)}, table ${t.number} seat ${n}` : `Open seat ${n} at table ${t.number}`}
                        className={`absolute h-[22%] w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 text-[0.55rem] font-bold text-white transition-transform hover:scale-110 ${g?.id === sel ? 'ring-4 ring-brand-200' : ''} ${!g && selected ? 'border-brand-400 bg-brand-50' : g ? 'border-white' : 'border-navy-100 bg-surface'}`}
                        style={{ left: `${50 + 41 * Math.cos(a)}%`, top: `${50 + 41 * Math.sin(a)}%`, background: g ? color[g.order_id] : undefined }}>
                        {g ? (g.first_name[0] + g.last_name[0]) : ''}
                      </button>
                    )
                  })}
                  {t.label && <div className="absolute -bottom-[16%] left-1/2 w-[160%] -translate-x-1/2 truncate text-center text-[0.625rem] font-medium text-navy-500">{t.label}</div>}
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}
