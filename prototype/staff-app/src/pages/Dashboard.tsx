import { ArrowRight, RefreshCw } from 'lucide-react'
import { orderMoney, seatStats, sponsorOf, tierOf } from '@shared/data'
import { Link, Pill, ago, fmtDate, money } from '@shared/ui'
import type { DB } from '@shared/types'
import { Kpi, PageHead } from '../App'
import { useStaff } from '../store'

export const curOrders = (db: DB) => db.orders.filter((o) => o.event_id === db.meta.current_event_id && o.status !== 'cancelled')
export const curPayments = (db: DB) => { const ids = new Set(curOrders(db).map((o) => o.id)); return db.payments.filter((p) => ids.has(p.order_id)) }

export default function Dashboard() {
  const { db } = useStaff()
  const orders = curOrders(db)
  const pays = curPayments(db)
  const gross = pays.reduce((s, p) => s + p.gross_amount, 0)
  // Fees AAFE's ticket export didn't carry are unknown (null), not $0: count the known ones, and net from those (Gate 1).
  const fees = pays.reduce((s, p) => s + (p.transaction_fee_amount ?? 0), 0)
  const net = pays.reduce((s, p) => s + (p.net_amount ?? 0), 0), feeUnknown = pays.filter((p) => p.transaction_fee_amount == null).length
  const committed = orders.reduce((s, o) => s + o.commitment_amount, 0)
  const outstanding = orders.reduce((s, o) => s + orderMoney(db, o.id).balance, 0)
  const ids = new Set(orders.map((o) => o.id))
  const seats = db.seats.filter((s) => ids.has(s.order_id) && s.status !== 'cancelled')
  const named = seats.filter((s) => s.status !== 'unnamed').length
  const review = seats.filter((s) => s.status === 'submitted').length
  const guests = db.guests.filter((g) => ids.has(g.order_id))
  const unseated = guests.filter((g) => !g.table_id).length
  const arrived = db.check_ins.filter((c) => c.event_id === db.meta.current_event_id).length
  const feed = db.audit_log.filter((a) => a.actor_type === 'guest_portal' || a.actor === 'Give Lively sync').slice(-8).reverse()
  const attention = orders.map((o) => ({ o, st: seatStats(db, o.id), m: orderMoney(db, o.id) }))
    .filter(({ o, st, m }) => st.unnamed > 0 || st.needsReview > 0 || m.balance > 0 || o.logo_status === 'pending' || o.program_ad_status === 'pending')
    .sort((a, b) => b.o.commitment_amount - a.o.commitment_amount).slice(0, 7)

  return (
    <div>
      <PageHead title="Gala dashboard" sub="Live overview of commitments, payments, seats and guest-portal updates for the current gala." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Committed" value={money(committed)} sub={`${orders.length} orders`} />
        <Kpi label="Received (gross)" value={money(gross)} sub={`${money(outstanding)} outstanding`} tone="green" />
        <Kpi label="Give Lively processor fees" value={money(fees, true)} sub={<Link to="/payments" className="text-brand-600 underline">See per-ticket fees</Link>} tone="brand" />
        <Kpi label="Net to AAFE" value={money(net, true)} sub={feeUnknown ? `${feeUnknown} payment${feeUnknown === 1 ? '' : 's'} without a fee yet` : undefined} />
        <Kpi label="Seats named" value={`${named} / ${seats.length}`} sub={`${seats.length - named} still unnamed`} />
        <Kpi label="Needs staff review" value={review} sub="Submitted from guest portal" tone="amber" />
        <Kpi label="No table yet" value={unseated} sub={<Link to="/guests" className="text-brand-600 underline">Pick tables in the guest list</Link>} />
        <Kpi label="Arrived" value={arrived} sub="Event-day check-ins" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3"><h2 className="font-semibold text-navy-900">Needs follow-up</h2><Link to="/sponsors" className="text-sm font-semibold text-brand-600">All sponsors</Link></div>
          <ul className="divide-y divide-navy-100">
            {attention.map(({ o, st, m }) => (
              <li key={o.id}><Link to={`/sponsors/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-navy-50">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-navy-900">{sponsorOf(db, o.sponsor_id).organization_name}</div>
                  <div className="text-xs text-navy-500">{tierOf(db, o.tier_id).name}</div>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {st.unnamed > 0 && <Pill tone="amber">{st.unnamed} unnamed</Pill>}
                  {st.needsReview > 0 && <Pill tone="blue">{st.needsReview} to review</Pill>}
                  {m.balance > 0 && <Pill tone="red">{money(m.balance)} due</Pill>}
                  {o.logo_status === 'pending' && <Pill>Logo</Pill>}
                  {o.program_ad_status === 'pending' && <Pill>Ad</Pill>}
                  <ArrowRight size={16} className="text-navy-300" />
                </div>
              </Link></li>
            ))}
          </ul>
        </section>
        <section className="card">
          <div className="flex items-center justify-between border-b border-navy-100 px-4 py-3">
            <h2 className="font-semibold text-navy-900">From the guest portal & Give Lively</h2>
            <span className="inline-flex items-center gap-1 text-xs text-navy-500"><RefreshCw size={12} /> live</span>
          </div>
          <ol className="divide-y divide-navy-100">
            {feed.map((a) => (
              <li key={a.id} className="px-4 py-2.5">
                <div className="text-sm text-navy-800">{a.summary}</div>
                <div className="text-xs text-navy-500">{a.actor} · {ago(a.at)}</div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <p className="mt-6 text-xs text-navy-500">Fee math uses Give Lively’s published third-party processor rates; Give Lively itself charges no platform fee. Next gala: {fmtDate(db.gala_events.find((e) => e.id === db.meta.current_event_id)!.event_date)}.</p>
    </div>
  )
}
