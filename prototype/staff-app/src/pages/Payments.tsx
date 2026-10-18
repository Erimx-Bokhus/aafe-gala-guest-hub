import { useState } from 'react'
import { Download, Plus } from 'lucide-react'
import { METHOD_LABEL, methodLabel, sponsorOf, tierOf } from '@shared/data'
import { Pill, downloadCsv, fmtDate, money } from '@shared/ui'
import type { PayMethod } from '@shared/types'
import { Kpi, PageHead } from '../App'
import { RecordPaymentModal } from '../components'
import { useStaff } from '../store'
import { nyDate } from '../date'

// Per-ticket fee ledger. Columns mirror Give Lively's "Line Items (All)" report.
export default function Payments() {
  const { db } = useStaff()
  const [year, setYear] = useState(db.meta.current_event_id)
  const [rec, setRec] = useState(false)
  const ids = new Set(db.orders.filter((o) => o.event_id === year).map((o) => o.id))
  const pays = db.payments.filter((p) => ids.has(p.order_id)).sort((a, b) => b.received_at.localeCompare(a.received_at))
  // A fee AAFE's ticket export didn't carry is unknown (null), not $0 (Gate 1): totals count the known fees and say how many aren't.
  const sum = (k: 'original_amount' | 'covered_fee_amount' | 'gross_amount' | 'transaction_fee_amount' | 'net_amount', list = pays) => list.reduce((s, p) => s + (p[k] ?? 0), 0)
  const gl = pays.filter((p) => p.processor === 'stripe')
  const feeKnown = pays.filter((p) => p.transaction_fee_amount != null), unknown = gl.filter((p) => p.transaction_fee_amount == null).length
  const byMethod = (Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => ({ m, list: pays.filter((p) => p.method === m) })).filter((x) => x.list.length)
  const exportCsv = () => downloadCsv(`aafe-payments-fees-${year}-SYNTHETIC.csv`, [
    ['Capstone prototype — synthetic demonstration data only'],
    ['Date', 'Sponsor', 'Package', 'Method', 'Give Lively txn', 'Check #', 'Original', 'Donor-covered fee', 'Gross', 'Processor fee', 'Net', 'Reconciliation'],
    ...pays.map((p) => { const o = db.orders.find((x) => x.id === p.order_id)!; return [nyDate(p.received_at), sponsorOf(db, o.sponsor_id).organization_name, tierOf(db, o.tier_id).name, methodLabel(p), p.givelively_transaction_id, p.check_number, p.original_amount, p.covered_fee_amount, p.gross_amount, p.transaction_fee_amount, p.net_amount, p.reconciliation_status] }),
    ['TOTAL', '', '', '', '', '', sum('original_amount'), sum('covered_fee_amount'), sum('gross_amount'), sum('transaction_fee_amount'), sum('net_amount'), ''],
  ])
  const c = (n: number) => money(n, true)
  return (
    <div>
      <PageHead title="Payments & fees" sub="What Give Lively’s payment processor took from each ticket and sponsorship, totaled. Give Lively charges no platform fee — fees are Stripe’s card/ACH processing."
        actions={<><select className="input w-56" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Gala year">{db.gala_events.slice().sort((a, b) => b.year - a.year).map((e) => <option key={e.id} value={e.id}>{e.year} — {e.name}</option>)}</select>
          <button className="btn-ghost" onClick={exportCsv}><Download size={15} /> Export</button>
          <button className="btn-primary" onClick={() => setRec(true)}><Plus size={15} /> Record check / ACH</button></>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Gross received" value={c(sum('gross_amount'))} sub={`${pays.length} payments`} />
        <Kpi label="Total Give Lively fees" value={c(sum('transaction_fee_amount'))} sub={unknown ? `known for ${gl.length - unknown} of ${gl.length} Give Lively payments` : `across ${gl.length} Give Lively payments`} tone="brand" />
        <Kpi label="Donor-covered fees" value={c(sum('covered_fee_amount'))} sub="donors opted to cover" tone="green" />
        <Kpi label="Fees AAFE absorbed" value={c(Math.max(0, sum('transaction_fee_amount') - sum('covered_fee_amount', feeKnown)))} sub="fees minus donor-covered" tone="amber" />
        <Kpi label="Net to AAFE" value={c(sum('net_amount'))} sub={unknown ? `${unknown} payment${unknown === 1 ? '' : 's'} without a fee yet` : undefined} />
      </div>
      <div className="mt-6 grid gap-6 2xl:grid-cols-[1fr_320px]">
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1000px]" data-testid="fee-ledger">
            <thead className="border-b border-navy-100 bg-cream-100"><tr><th className="th">Date</th><th className="th">Sponsor / ticket</th><th className="th">Method</th><th className="th">Reference</th><th className="th text-right">Original</th><th className="th text-right">Donor-covered</th><th className="th text-right">Gross</th><th className="th text-right">Give Lively fee</th><th className="th text-right">Net</th><th className="th">Recon.</th></tr></thead>
            <tbody className="divide-y divide-navy-100">
              {pays.map((p) => {
                const o = db.orders.find((x) => x.id === p.order_id)!
                return (
                  <tr key={p.id}>
                    <td className="td whitespace-nowrap">{fmtDate(p.received_at)}</td>
                    <td className="td"><div className="font-semibold text-navy-900">{sponsorOf(db, o.sponsor_id).organization_name}</div><div className="text-xs text-navy-500">{tierOf(db, o.tier_id).name}</div></td>
                    <td className="td whitespace-nowrap">{methodLabel(p)}</td>
                    <td className="td whitespace-nowrap font-sans tabular-nums text-xs">{p.givelively_transaction_id ?? (p.check_number ? `Check #${p.check_number}` : '—')}</td>
                    <td className="td text-right tabular-nums">{c(p.original_amount)}</td>
                    <td className="td text-right tabular-nums text-emerald-700">{p.covered_fee_amount ? c(p.covered_fee_amount) : '—'}</td>
                    <td className="td text-right tabular-nums">{c(p.gross_amount)}</td>
                    <td className="td text-right font-semibold tabular-nums text-brand-600">{p.transaction_fee_amount == null ? <span className="font-normal text-navy-500" title="AAFE's ticket export has no fee column; the Give Lively sync fills it in">Not in file</span> : c(p.transaction_fee_amount)}</td>
                    <td className="td text-right font-semibold tabular-nums">{p.net_amount == null ? <span className="font-normal text-navy-500">—</span> : c(p.net_amount)}</td>
                    <td className="td"><Pill tone={p.reconciliation_status === 'matched' ? 'green' : p.reconciliation_status === 'needs_review' ? 'red' : 'amber'}>{p.reconciliation_status.replace('_', ' ')}</Pill></td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-navy-100 bg-cream-100 font-semibold"><tr><td className="td" colSpan={4}>Totals</td><td className="td text-right tabular-nums">{c(sum('original_amount'))}</td><td className="td text-right tabular-nums">{c(sum('covered_fee_amount'))}</td><td className="td text-right tabular-nums">{c(sum('gross_amount'))}</td><td className="td text-right tabular-nums text-brand-600" data-testid="fee-total">{c(sum('transaction_fee_amount'))}</td><td className="td text-right tabular-nums">{c(sum('net_amount'))}</td><td /></tr></tfoot>
          </table>
        </div>
        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="font-semibold text-navy-900">By payment method</h2>
            <ul className="mt-2 divide-y divide-navy-100 text-sm">{byMethod.map(({ m, list }) => <li key={m} className="flex justify-between py-2"><span>{METHOD_LABEL[m]} <span className="text-xs text-navy-500">×{list.length}</span></span><span className="text-right tabular-nums">{c(sum('gross_amount', list))}<br /><span className="text-xs text-brand-600">fees {c(sum('transaction_fee_amount', list))}</span></span></li>)}</ul>
          </section>
          <section className="card p-4 text-xs leading-relaxed text-navy-600">
            <h2 className="mb-1 text-sm font-semibold text-navy-900">Rates used (Give Lively, nonprofit)</h2>
            Card 2.2% + $0.30 · Amex 3.5% · Bank/ACH 0.8% (max $5) · Checks, direct ACH and wires: no processor fee. In production these numbers come straight from Give Lively’s “Transaction Fee Amount” field, not from our formula.
          </section>
        </aside>
      </div>
      <RecordPaymentModal open={rec} onClose={() => setRec(false)} />
    </div>
  )
}
