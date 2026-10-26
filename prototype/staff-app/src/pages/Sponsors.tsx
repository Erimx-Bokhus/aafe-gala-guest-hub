import { useEffect, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, Check, Copy, History, Mail, Plus, Search } from 'lucide-react'
import { methodLabel, orderMoney, seatStats, sponsorOf, staffName, tierOf } from '@shared/data'
import { Link, Modal, Pill, fmtDate, money } from '@shared/ui'
import type { AuditEntry, Material } from '@shared/types'
import { PageHead } from '../App'
import { logFor } from '../api'
import { AddPledgeModal, GUEST_PORTAL_URL, RecordPaymentModal, SeatPill } from '../components'
import { useStaff } from '../store'
import { curOrders } from './Dashboard'

const SRC: Record<string, string> = { givelively: 'Give Lively', check: 'Check', ach_direct: 'ACH (direct)', wire: 'Wire', comp: 'Complimentary', staff_entry: 'Staff entry' }
const STATUS_TONE = { paid: 'green', partially_paid: 'amber', pledged: 'amber', comp: 'blue', invoice_sent: 'gray', cancelled: 'gray' } as const

// Filter and sort (AAFE's Oct 20 walk-through, item 2): by package to see all the Silvers, by owner to see one person's
// sponsors, by status to see who has paid and who has only pledged. Any heading but Source and Seats sorts the list.
type SortKey = 'sponsor' | 'package' | 'commitment' | 'received' | 'status' | 'owner'

export default function Sponsors() {
  const { db } = useStaff()
  const [q, setQ] = useState('')
  const [pkg, setPkg] = useState(''), [owner, setOwner] = useState(''), [status, setStatus] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'commitment', dir: -1 })
  const [add, setAdd] = useState(false)
  const all = curOrders(db).map((o) => {
    const sp = sponsorOf(db, o.sponsor_id), tier = tierOf(db, o.tier_id)
    return { o, name: sp.organization_name, tier, paid: orderMoney(db, o.id).paid, ownerId: sp.relationship_owner_id, owner: staffName(db, sp.relationship_owner_id) }
  })
  const sortVal = (r: (typeof all)[number]): string | number =>
    ({ sponsor: r.name, package: r.tier.name, commitment: r.o.commitment_amount, received: r.paid, status: r.o.status, owner: r.owner })[sort.key]
  const rows = all
    .filter((r) => r.name.toLowerCase().includes(q.toLowerCase()) && (!pkg || r.o.tier_id === pkg) && (!owner || r.ownerId === owner) && (!status || r.o.status === status))
    .sort((a, b) => { const x = sortVal(a), y = sortVal(b); return sort.dir * (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) })
  const uniq = <T,>(list: [string, T][]) => [...new Map(list)]
  const levels = uniq(all.map((r) => [r.o.tier_id, r.tier] as [string, typeof r.tier])).sort((a, b) => b[1].contribution_amount - a[1].contribution_amount || a[1].name.localeCompare(b[1].name))
  const owners = uniq(all.map((r) => [r.ownerId, r.owner] as [string, string])).sort((a, b) => a[1].localeCompare(b[1]))
  const statuses = uniq(all.map((r) => [r.o.status, r.o.status.replace('_', ' ')] as [string, string]))
  const filtered = !!(q || pkg || owner || status)
  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th className={`th ${right ? 'text-right' : ''}`} aria-sort={sort.key === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="inline-flex items-center gap-1 uppercase hover:text-brand-600" data-testid={`sort-${k}`}
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : k === 'commitment' || k === 'received' ? -1 : 1 }))}>
        {label}{sort.key === k && (sort.dir === 1 ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
      </button>
    </th>
  )
  return (
    <div>
      <PageHead title="Sponsors & orders" sub="Every commitment for this gala — Give Lively purchases arrive automatically; checks, ACH and wires are entered by staff." actions={<button className="btn-primary" onClick={() => setAdd(true)}><Plus size={16} /> New pledge</button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" /><input className="input pl-9" placeholder="Search sponsors" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search sponsors" /></div>
        <select className="input w-auto max-w-56" value={pkg} onChange={(e) => setPkg(e.target.value)} aria-label="Package"><option value="">All packages</option>{levels.map(([id, t]) => <option key={id} value={id}>{t.name}</option>)}</select>
        <select className="input w-auto" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner"><option value="">All owners</option>{owners.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{statuses.map(([s, l]) => <option key={s} value={s}>{l}</option>)}</select>
        <span className="text-sm text-navy-500" data-testid="sponsor-count">{filtered ? `${rows.length} of ${all.length}` : `${all.length}`} order{all.length === 1 ? '' : 's'}</span>
        {filtered && <button type="button" className="btn-ghost btn-sm" onClick={() => { setQ(''); setPkg(''); setOwner(''); setStatus('') }}>Clear filters</button>}
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead className="border-b border-navy-100 bg-cream-100"><tr><Th k="sponsor" label="Sponsor" /><Th k="package" label="Package" /><th className="th">Source</th><Th k="commitment" label="Commitment" right /><Th k="received" label="Received" right /><Th k="status" label="Status" /><th className="th">Seats named</th><Th k="owner" label="Owner" /></tr></thead>
          <tbody className="divide-y divide-navy-100">
            {rows.map(({ o, name, tier, paid, owner: ownerName }) => {
              const st = seatStats(db, o.id)
              return (
                <tr key={o.id} className="hover:bg-navy-50">
                  <td className="td"><Link to={`/sponsors/${o.id}`} className="font-semibold text-navy-900 hover:text-brand-600">{name}</Link></td>
                  <td className="td text-navy-600">{tier.name}</td>
                  <td className="td">{SRC[o.source]}</td>
                  <td className="td text-right tabular-nums">{money(o.commitment_amount)}</td>
                  <td className="td text-right tabular-nums">{money(paid, paid % 1 !== 0)}</td>
                  <td className="td"><Pill tone={STATUS_TONE[o.status]}>{o.status.replace('_', ' ')}</Pill></td>
                  <td className="td tabular-nums">{st.total ? `${st.named} / ${st.total}` : '—'}</td>
                  <td className="td text-navy-600">{ownerName}</td>
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
  const { db, api, user, toast, act } = useStaff()
  const [pay, setPay] = useState(false)
  const [showLog, setShowLog] = useState(false)
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
  // Live, the server sends a relationship manager only the portal's and Give Lively's entries; logFor keeps the demo the same.
  const log = logFor(user.role, api.live && ownLog ? ownLog : db.audit_log.filter((a) => a.order_id === o.id)).slice().reverse()
  // Live, the order keeps only the link's fingerprint (hard rule 6), so a URL built from it never opens: the plain link is
  // shown in the demo only, where it is the real one. Live, staff send a fresh one with Resend portal link.
  const hasLink = Boolean(o.portal_token)
  const link = hasLink && !api.live ? `${GUEST_PORTAL_URL}#/s/${o.portal_token}` : null
  const setMat = (k: 'logo_status' | 'program_ad_status', v: Material) => void act(api.setMaterialStatus(o.id, k === 'logo_status' ? 'logo' : 'program_ad', v))

  return (
    <div>
      <Link to="/sponsors" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-600"><ArrowLeft size={15} /> Sponsors</Link>
      <PageHead title={sp.organization_name} sub={`${tier.name} · ${sp.primary_contact_name} · ${sp.primary_contact_email} · Owner: ${staffName(db, sp.relationship_owner_id)}`}
        actions={<>
          {m.balance > 0 && o.source !== 'givelively' && <button className="btn-primary" onClick={() => setPay(true)}>Record payment</button>}
          {hasLink && <button className="btn-ghost" onClick={() => void act(api.resendPortalLink(o.id), 'Guest-list link re-sent')}><Mail size={15} /> Resend portal link</button>}
          {link && <button className="btn-ghost" onClick={() => { navigator.clipboard?.writeText(link).catch(() => {}); toast('Portal link copied') }}><Copy size={15} /> Copy link</button>}
          <button className="btn-ghost" onClick={() => setShowLog(true)} aria-haspopup="dialog" data-testid="open-activity"><History size={15} /> Activity ({log.length})</button>
        </>} />
      {/* The order's activity opens over the page, in its own scrolling window, instead of a long list under the seats
          (Aisling's review of the story video, Oct 22). */}
      <Modal open={showLog} onClose={() => setShowLog(false)} title="Activity for this order" wide>
        {user.role !== 'gala_admin' && <p className="mb-3 text-sm text-navy-600" data-testid="activity-scope">Changes made in the sponsor portal and by Give Lively. Staff changes are in the change log, which gala admins see.</p>}
        {log.length ? (
          <ol className="max-h-[60vh] space-y-2 overflow-y-auto pr-1 text-sm" data-testid="activity-list">
            {log.map((a) => <li key={a.id} className="flex gap-3"><time className="w-36 shrink-0 text-xs text-navy-500">{fmtDate(a.at, 'en-US', true)}</time><span className="text-navy-800">{a.summary} <span className="text-xs text-navy-500">— {a.actor}</span></span></li>)}
          </ol>
        ) : <p className="text-sm text-navy-600">No activity yet.</p>}
      </Modal>
      <div className="grid gap-6 2xl:grid-cols-[1.5fr_1fr] [&>*]:min-w-0">
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
                        <td className="td">{g ? <><div className="font-semibold text-navy-900">{g.first_name} {g.last_name}</div><div className="text-xs text-navy-500">{g.title} · {g.organization}</div></> : <span className="text-navy-500">—</span>}</td>
                        <td className="td tabular-nums">{t ? `T${t.number} · S${g!.seat_number}` : g ? <span className="text-amber-700">Unseated</span> : ''}</td>
                        <td className="td text-xs">{[g?.dietary_needs, g?.accessibility_needs].filter(Boolean).join(' · ')}</td>
                        <td className="td"><SeatPill s={s.status} /></td>
                        <td className="td text-right">
                          {g && s.status === 'submitted' && <button className="btn-ghost btn-sm" onClick={() => void act(api.setSeatStatus(g.id, 'reviewed'), 'Marked reviewed — guest sees “Confirmed by AAFE”')}><Check size={14} /> Review</button>}
                          {g && s.status === 'reviewed' && <button className="btn-ghost btn-sm" onClick={() => void act(api.setSeatStatus(g.id, 'badge_ready'), 'Badge ready')}>Badge ready</button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : <p className="p-4 text-sm text-navy-500">Advertising-only order — no attendee seats.</p>}
          </section>
        </div>
        <div className="space-y-6">
          <section className="card p-4">
            <h2 className="font-semibold text-navy-900">Payments</h2>
            <div className="mt-2 grid grid-cols-3 gap-2 text-sm"><div><div className="text-navy-500">Commitment</div><div className="font-semibold">{money(o.commitment_amount)}</div></div><div><div className="text-navy-500">Received</div><div className="font-semibold">{money(m.paid, true)}</div></div><div><div className="text-navy-500">Balance</div><div className={`font-semibold ${m.balance ? 'text-rose-700' : ''}`}>{money(m.balance)}</div></div></div>
            <ul className="mt-3 divide-y divide-navy-100 border-t border-navy-100 text-sm">
              {m.pays.map((p) => <li key={p.id} className="py-2"><div className="flex justify-between"><span className="font-semibold">{money(p.gross_amount, true)}</span><span className="text-navy-500">{fmtDate(p.received_at)}</span></div><div className="text-xs text-navy-500">{methodLabel(p)}{p.check_number ? ` #${p.check_number}` : ''}{p.givelively_transaction_id ? ` · ${p.givelively_transaction_id}` : ''} · fee {p.transaction_fee_amount == null ? 'not in file' : money(p.transaction_fee_amount, true)}{p.net_amount == null ? '' : ` · net ${money(p.net_amount, true)}`}</div></li>)}
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
            {link && <p className="mt-3 break-all rounded bg-cream-100 p-2 font-sans tabular-nums text-xs text-navy-600">{link}</p>}
            {hasLink && !link && <p className="mt-3 text-xs text-navy-600" data-testid="private-link-note">The sponsor's link is private: only their email has it. Resend portal link sends a fresh one, and the old one stops working.</p>}
          </section>
          {o.internal_notes && <section className="card p-4"><h2 className="font-semibold text-navy-900">Internal notes</h2><p className="mt-1 text-sm text-navy-700">{o.internal_notes}</p></section>}
        </div>
      </div>
      <RecordPaymentModal open={pay} onClose={() => setPay(false)} orderId={o.id} />
    </div>
  )
}
