import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Copy, Mail, Plus, Search } from 'lucide-react'
import { METHOD_LABEL, orderMoney, seatStats, sponsorOf, staffName, tierOf } from '@shared/data'
import { Link, Pill, fmtDate, money } from '@shared/ui'
import type { AuditEntry, Material } from '@shared/types'
import { PageHead } from '../App'
import { AddPledgeModal, GUEST_PORTAL_URL, RecordPaymentModal, SeatPill } from '../components'
import { useStaff } from '../store'
import { curOrders } from './Dashboard'

const SRC: Record<string, string> = { givelively: 'Give Lively', check: 'Check', ach_direct: 'ACH (direct)', wire: 'Wire', comp: 'Complimentary', staff_entry: 'Staff entry' }
const STATUS_TONE = { paid: 'green', partially_paid: 'amber', pledged: 'amber', comp: 'blue', invoice_sent: 'gray', cancelled: 'gray' } as const

export default function Sponsors() {
  const { db } = useStaff()
  const [q, setQ] = useState('')
  const [add, setAdd] = useState(false)
  const rows = curOrders(db).filter((o) => sponsorOf(db, o.sponsor_id).organization_name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.commitment_amount - a.commitment_amount)
  return (
    <div>
      <PageHead title="Sponsors & orders" sub="Every commitment for this gala — Give Lively purchases arrive automatically; checks, ACH and wires are entered by staff." actions={<button className="btn-primary" onClick={() => setAdd(true)}><Plus size={16} /> New pledge</button>} />
      <div className="relative mb-4 max-w-sm"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" /><input className="input pl-9" placeholder="Search sponsors" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sponsors" /></div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead className="border-b border-navy-100 bg-cream-100"><tr><th className="th">Sponsor</th><th className="th">Package</th><th className="th">Source</th><th className="th text-right">Commitment</th><th className="th text-right">Received</th><th className="th">Status</th><th className="th">Seats named</th><th className="th">Owner</th></tr></thead>
          <tbody className="divide-y divide-navy-100">
            {rows.map((o) => {
              const m = orderMoney(db, o.id), st = seatStats(db, o.id)
              return (
                <tr key={o.id} className="hover:bg-navy-50">
                  <td className="td"><Link to={`/sponsors/${o.id}`} className="font-semibold text-navy-900 hover:text-brand-600">{sponsorOf(db, o.sponsor_id).organization_name}</Link></td>
                  <td className="td text-navy-600">{tierOf(db, o.tier_id).name}</td>
                  <td className="td">{SRC[o.source]}</td>
                  <td className="td text-right tabular-nums">{money(o.commitment_amount)}</td>
                  <td className="td text-right tabular-nums">{money(m.paid, m.paid % 1 !== 0)}</td>
                  <td className="td"><Pill tone={STATUS_TONE[o.status]}>{o.status.replace('_', ' ')}</Pill></td>
                  <td className="td tabular-nums">{st.total ? `${st.named} / ${st.total}` : '—'}</td>
                  <td className="td text-navy-600">{staffName(db, sponsorOf(db, o.sponsor_id).relationship_owner_id)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <AddPledgeModal open={add} onClose={() => setAdd(false)} />
    </div>
  )
}

const MAT: Material[] = ['pending', 'received', 'approved']
export function SponsorDetail({ id }: { id: string }) {
  const { db, api, toast, act } = useStaff()
  const [pay, setPay] = useState(false)
  // Live, the app holds only the newest 1,000 change-log entries, so this order's whole history comes from the server
  // (again after each change, when `db` reloads). Demo data holds everything.
  const [ownLog, setOwnLog] = useState<AuditEntry[] | null>(null)
  useEffect(() => {
    if (!api.live) return
    let current = true
    api.history(id).then((l) => { if (current) setOwnLog(l) }, () => {})
    return () => { current = false }
  }, [api, id, db])
  const o = db.orders.find((x) => x.id === id)
  if (!o) return <p>Order not found. <Link to="/sponsors" className="text-brand-600 underline">Back</Link></p>
  const sp = sponsorOf(db, o.sponsor_id), tier = tierOf(db, o.tier_id), m = orderMoney(db, o.id), st = seatStats(db, o.id)
  const seats = db.seats.filter((s) => s.order_id === o.id).sort((a, b) => a.slot_number - b.slot_number)
  const history = db.orders.filter((x) => x.sponsor_id === sp.id).sort((a, b) => b.event_id.localeCompare(a.event_id))
  const emails = db.email_log.filter((e) => e.order_id === o.id)
  const log = (api.live && ownLog ? ownLog : db.audit_log.filter((a) => a.order_id === o.id)).slice().reverse()
  const link = o.portal_token ? `${GUEST_PORTAL_URL}#/s/${o.portal_token}` : null
  const setMat = (k: 'logo_status' | 'program_ad_status', v: Material) => void act(api.setMaterialStatus(o.id, k === 'logo_status' ? 'logo' : 'program_ad', v))

  return (
    <div>
      <Link to="/sponsors" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600"><ArrowLeft size={15} /> Sponsors</Link>
      <PageHead title={sp.organization_name} sub={`${tier.name} · ${sp.primary_contact_name} · ${sp.primary_contact_email} · Owner: ${staffName(db, sp.relationship_owner_id)}`}
        actions={<>
          {m.balance > 0 && o.source !== 'givelively' && <button className="btn-primary" onClick={() => setPay(true)}>Record payment</button>}
          {link && <button className="btn-ghost" onClick={() => void act(api.resendPortalLink(o.id), 'Guest-list link re-sent')}><Mail size={15} /> Resend portal link</button>}
          {link && !api.live && <button className="btn-ghost" onClick={() => { navigator.clipboard?.writeText(link).catch(() => {}); toast('Portal link copied') }}><Copy size={15} /> Copy link</button>}
        </>} />
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr] [&>*]:min-w-0">
        <div className="space-y-6">
          <section className="card overflow-x-auto">
            <div className="border-b border-navy-100 px-4 py-3"><h2 className="font-semibold text-navy-900">Seats ({st.named}/{st.total} named · {st.needsReview} to review)</h2></div>
            {seats.length ? (
              <table className="w-full min-w-[640px]"><thead className="bg-cream-100"><tr><th className="th">#</th><th className="th">Guest</th><th className="th">Table / seat</th><th className="th">Dietary · access</th><th className="th">Status</th><th className="th"></th></tr></thead>
                <tbody className="divide-y divide-navy-100">
                  {seats.map((s) => {
                    const g = db.guests.find((x) => x.id === s.guest_id)
                    const t = g?.table_id ? db.event_tables.find((x) => x.id === g.table_id) : null
                    return (
                      <tr key={s.id}>
                        <td className="td tabular-nums text-navy-500">{s.slot_number}</td>
                        <td className="td">{g ? <><div className="font-semibold text-navy-900">{g.first_name} {g.last_name}</div><div className="text-xs text-navy-500">{g.title} · {g.organization}</div></> : <span className="text-navy-300">—</span>}</td>
                        <td className="td tabular-nums">{t ? `T${t.number} · S${g!.seat_number}` : g ? <span className="text-amber-700">Unseated</span> : ''}</td>
                        <td className="td text-xs">{[g?.dietary_needs, g?.accessibility_needs].filter(Boolean).join(' · ')}</td>
                        <td className="td"><SeatPill s={s.status} /></td>
                        <td className="td text-right">
                          {g && s.status === 'submitted' && <button className="btn-ghost btn-sm" onClick={() => void act(api.setSeatStatus(g.id, 'reviewed'), 'Marked reviewed — guest sees “Confirmed by AAFE”')}><Check size={14} /> Review</button>}
                          {g && s.status === 'reviewed' && <button className="btn-ghost btn-sm" disabled={!g.table_id} title={g.table_id ? '' : 'Assign a table and seat first'} onClick={() => void act(api.setSeatStatus(g.id, 'badge_ready'), 'Badge ready')}>Badge ready</button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : <p className="p-4 text-sm text-navy-500">Advertising-only order — no attendee seats.</p>}
          </section>
          <section className="card p-4">
            <h2 className="font-semibold text-navy-900">Activity for this order</h2>
            <ol className="mt-3 max-h-72 space-y-2 overflow-y-auto text-sm">
              {log.map((a) => <li key={a.id} className="flex gap-3"><time className="w-36 shrink-0 text-xs text-navy-500">{fmtDate(a.at, 'en-US', true)}</time><span className="text-navy-800">{a.summary} <span className="text-xs text-navy-500">— {a.actor}</span></span></li>)}
            </ol>
          </section>
        </div>
        <div className="space-y-6">
          <section className="card p-4">
            <h2 className="font-semibold text-navy-900">Payments</h2>
            <div className="mt-2 grid grid-cols-3 gap-2 text-sm"><div><div className="text-navy-500">Commitment</div><div className="font-semibold">{money(o.commitment_amount)}</div></div><div><div className="text-navy-500">Received</div><div className="font-semibold">{money(m.paid, true)}</div></div><div><div className="text-navy-500">Balance</div><div className={`font-semibold ${m.balance ? 'text-rose-700' : ''}`}>{money(m.balance)}</div></div></div>
            <ul className="mt-3 divide-y divide-navy-100 border-t border-navy-100 text-sm">
              {m.pays.map((p) => <li key={p.id} className="py-2"><div className="flex justify-between"><span className="font-semibold">{money(p.gross_amount, true)}</span><span className="text-navy-500">{fmtDate(p.received_at)}</span></div><div className="text-xs text-navy-500">{METHOD_LABEL[p.method]}{p.check_number ? ` #${p.check_number}` : ''}{p.givelively_transaction_id ? ` · ${p.givelively_transaction_id}` : ''} · fee {money(p.transaction_fee_amount, true)} · net {money(p.net_amount, true)}</div></li>)}
              {!m.pays.length && <li className="py-2 text-navy-500">No payments yet.</li>}
            </ul>
          </section>
          <section className="card p-4">
            <h2 className="font-semibold text-navy-900">Sponsor materials</h2>
            {(['logo_status', 'program_ad_status'] as const).map((k) => o[k] !== 'not_required' && (
              <div key={k} className="mt-3 flex items-center justify-between gap-2 text-sm"><span>{k === 'logo_status' ? 'Logo' : 'Program ad'}</span>
                <select className="input w-36 py-1" value={o[k]} onChange={(e) => setMat(k, e.target.value as Material)} aria-label={k}>{MAT.map((v) => <option key={v}>{v}</option>)}</select></div>
            ))}
          </section>
          <section className="card p-4">
            <h2 className="font-semibold text-navy-900">Giving history</h2>
            <ul className="mt-2 divide-y divide-navy-100 text-sm">
              {history.map((h) => <li key={h.id} className="flex justify-between py-2"><span>{db.gala_events.find((e) => e.id === h.event_id)!.year} · {tierOf(db, h.tier_id).name.split(' — ')[0]}</span><span className="font-semibold tabular-nums">{money(orderMoney(db, h.id).paid)}</span></li>)}
            </ul>
            <p className="mt-2 text-xs text-navy-500">Salesforce account: {sp.salesforce_account_id ?? 'not synced yet'}</p>
          </section>
          <section className="card p-4">
            <h2 className="font-semibold text-navy-900">Emails</h2>
            <ul className="mt-2 space-y-1.5 text-sm">{emails.map((e) => <li key={e.id} className="flex justify-between gap-2"><span>{e.template.replace(/_/g, ' ')} <span className="text-xs text-navy-500">({e.trigger.replace(/_/g, ' ')})</span></span>{e.status === 'queued' ? <button className="btn-primary btn-sm" onClick={() => void act(api.approveEmail(e.id), api.live ? `Approved: sending to ${e.to_name}` : `Approved and sent to ${e.to_name} (simulated)`)}>Approve and send</button> : <Pill tone={e.status === 'cancelled' ? 'gray' : 'green'}>{e.status}</Pill>}</li>)}{!emails.length && <li className="text-navy-500">None.</li>}</ul>
            {link && <p className="mt-3 break-all rounded bg-cream-100 p-2 font-mono text-xs text-navy-600">{link}</p>}
          </section>
          {o.internal_notes && <section className="card p-4"><h2 className="font-semibold text-navy-900">Internal notes</h2><p className="mt-1 text-sm text-navy-700">{o.internal_notes}</p></section>}
        </div>
      </div>
      <RecordPaymentModal open={pay} onClose={() => setPay(false)} orderId={o.id} />
    </div>
  )
}
