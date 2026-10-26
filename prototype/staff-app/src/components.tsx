import { useRef, useState } from 'react'
import { levelsOf, orderMoney, sponsorOf } from '@shared/data'
import { Field, Modal, Pill, fmtDate, money, type Tone } from '@shared/ui'
import type { SeatStatus } from '@shared/types'
import { useStaff } from './store'
import { curOrders } from './pages/Dashboard'
import { nyDate, paymentDateError } from './date'

/**
 * Saves a form once: the button disables until the server answers, so a double-click can't record a payment twice.
 * A ref, not only state: two clicks in the same moment both see `saving` still false.
 */
export function useSave() {
  const { act } = useStaff()
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const save = async (run: () => Promise<unknown>, done: string) => {
    if (busy.current) return false
    busy.current = true; setSaving(true)
    try { return await act(run(), done) } finally { busy.current = false; setSaving(false) }
  }
  return { saving, save }
}

export const GUEST_PORTAL_URL: string = import.meta.env.VITE_GUEST_PORTAL_URL ?? 'https://guest-portal.example.org/'

export const SEAT_PILL: Record<SeatStatus, [Tone, string]> = {
  unnamed: ['amber', 'Unnamed'], submitted: ['blue', 'Needs review'], reviewed: ['gray', 'Reviewed'],
  badge_ready: ['green', 'Badge ready'], checked_in: ['brand', 'Checked in'], cancelled: ['gray', 'Cancelled'],
}
export const SeatPill = ({ s }: { s: SeatStatus }) => <Pill tone={SEAT_PILL[s][0]}>{SEAT_PILL[s][1]}</Pill>

/** A check number as staff might type it again: "#555", "0555" and "555 " are the same check. */
const checkKey = (n?: string | null) => (n ?? '').toLowerCase().replace(/[^0-9a-z]/g, '').replace(/^0+(?=.)/, '')

/** Check in the mail, or ACH/wire seen on AAFE's bank statement — staff records it here. */
export function RecordPaymentModal({ open, onClose, orderId }: { open: boolean; onClose: () => void; orderId?: string }) {
  const { db, api } = useStaff()
  const { saving, save } = useSave()
  const candidates = curOrders(db).filter((o) => o.source !== 'givelively' && o.source !== 'comp' && orderMoney(db, o.id).balance > 0)
  // The order comes from the page when there is one (sponsor detail); otherwise from the picker, falling back if the picked order is now paid.
  const [picked, setOid] = useState(candidates[0]?.id ?? '')
  const oid = orderId ?? (candidates.some((o) => o.id === picked) ? picked : candidates[0]?.id ?? '')
  const bal = oid ? orderMoney(db, oid).balance : 0
  const [method, setMethod] = useState<'check' | 'ach_direct' | 'wire'>('check')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => nyDate(new Date()))
  const [checkNo, setCheckNo] = useState('')
  const amt = Number(amount || bal)
  const dateError = paymentDateError(date)
  const valid = oid && amt > 0 && (method !== 'check' || checkNo.trim()) && !dateError
  // Cornell's review (#222): the same check entered twice, or an extra zero, went through without a word and could mark
  // an order paid. Both are warnings, not refusals (a sponsor can pay more than the balance): the button says so.
  const sameCheck = method === 'check' && checkKey(checkNo)
    ? db.payments.find((p) => p.order_id === oid && p.method === 'check' && checkKey(p.check_number) === checkKey(checkNo)) : undefined
  const usd = (n: number) => money(n, !Number.isInteger(n))
  const warnings = [
    sameCheck && `Check #${sameCheck.check_number} is already recorded on this order: ${usd(sameCheck.original_amount)} on ${fmtDate(sameCheck.received_at)}.`,
    amt > 0 && amt > bal + 0.005 && `This is ${usd(amt - bal)} more than the balance due (${usd(bal)}).`,
  ].filter((w): w is string => !!w)
  return (
    <Modal open={open} onClose={onClose} title="Record check, ACH or wire">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!valid) return; void save(() => api.recordPayment(oid, { method, amount: amt, received: date, check_number: checkNo }), 'Payment recorded — guest portal updated').then((done) => { if (done) onClose() }) }}>
        {!orderId && (
          <Field id="ro" label="Sponsor / order">
            <select id="ro" className="input" value={oid} onChange={(e) => setOid(e.target.value)}>
              {candidates.map((o) => <option key={o.id} value={o.id}>{sponsorOf(db, o.sponsor_id).organization_name} — {money(orderMoney(db, o.id).balance)} due</option>)}
            </select>
          </Field>
        )}
        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-navy-800">How it arrived</legend>
          <div className="grid grid-cols-3 gap-2">
            {([['check', 'Check (mail)'], ['ach_direct', 'ACH to bank'], ['wire', 'Wire']] as const).map(([v, l]) => (
              <button type="button" key={v} onClick={() => setMethod(v)} aria-pressed={method === v} className={`min-h-[44px] rounded-full border-2 px-3 text-sm font-semibold ${method === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-navy-500 text-navy-700'}`}>{l}</button>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field id="ra" label="Amount" hint={`Balance due ${money(bal)}`}><input id="ra" className="input" inputMode="decimal" placeholder={String(bal)} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} /></Field>
          <Field id="rd" label={method === 'check' ? 'Deposit date' : 'Date on statement'} error={dateError ?? undefined}><input id="rd" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        {method === 'check' && <Field id="rc" label="Check number" error={!checkNo.trim() && amount ? 'Required for checks' : undefined}><input id="rc" className="input" value={checkNo} onChange={(e) => setCheckNo(e.target.value)} /></Field>}
        {warnings.length > 0 && (
          <div role="status" data-testid="payment-warning" className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {warnings.map((w) => <p key={w}>{w}</p>)}
            <p className="font-semibold">If that’s right, choose Record anyway.</p>
          </div>
        )}
        <p className="rounded-md bg-cream-100 p-3 text-xs text-navy-600">No processor fee on offline payments. If this is the first payment and no portal link was sent, a guest-list email is drafted for staff approval. The payment is queued for Salesforce.</p>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!valid || saving} data-testid="save-payment">{saving ? 'Saving…' : warnings.length ? 'Record anyway' : 'Record payment'}</button></div>
      </form>
    </Modal>
  )
}

export function AddPledgeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, api } = useStaff()
  const { saving, save } = useSave()
  // This gala's levels only (one list per gala); each shows its amount and how many guests it includes.
  const levels = levelsOf(db).filter((t) => t.tier_category !== 'complimentary')
  const [f, setF] = useState(() => ({ org: '', contact: '', email: '', tierId: levels.find((t) => t.tier_category === 'sponsorship')?.id ?? levels[0]?.id ?? '', source: 'check' as 'check' | 'ach_direct' | 'wire', amount: '' }))
  // Item 1 of AAFE's Oct 20 walk-through: blank means the level's price; type another for a donation or a different gift.
  const level = levels.find((t) => t.id === f.tierId)
  const amount = f.amount.trim() ? Number(f.amount) : null
  const amountError = amount !== null && !(amount > 0 && amount <= 10_000_000) ? 'More than $0, at most $10,000,000' : undefined
  const ok = f.org.trim() && f.contact.trim() && /\S+@\S+\.\S+/.test(f.email) && f.tierId && !amountError
  return (
    <Modal open={open} onClose={onClose} title="New pledge (check, ACH or wire)">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!ok) return; void save(() => api.addPledge({ ...f, amount }), 'Pledge recorded — guest-list email drafted for approval').then((done) => { if (done) { onClose(); setF({ ...f, org: '', contact: '', email: '', amount: '' }) } }) }}>
        <Field id="po" label="Organization or donor name"><input id="po" className="input" value={f.org} onChange={(e) => setF({ ...f, org: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="pc" label="Primary contact"><input id="pc" className="input" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>
          <Field id="pe" label="Contact email"><input id="pe" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="pt" label="Package"><select id="pt" className="input" value={f.tierId} onChange={(e) => setF({ ...f, tierId: e.target.value })}>{levels.map((t) => <option key={t.id} value={t.id}>{t.name} — {money(t.contribution_amount)} · {t.included_seat_count} {t.included_seat_count === 1 ? 'guest' : 'guests'}</option>)}</select></Field>
          <Field id="ps" label="Will pay by"><select id="ps" className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as 'check' })}><option value="check">Check</option><option value="ach_direct">ACH to AAFE bank</option><option value="wire">Wire</option></select></Field>
        </div>
        <Field id="pa" label="Amount" hint={`Leave blank for the level's ${level ? money(level.contribution_amount) : 'price'}; type another for a donation or a different gift.`} error={amountError}>
          <input id="pa" className="input" inputMode="decimal" placeholder={level ? String(level.contribution_amount) : ''} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^0-9.]/g, '') })} />
        </Field>
        <p className="rounded-md bg-cream-100 p-3 text-xs text-navy-600">Give Lively purchases arrive automatically — use this only for donors paying outside Give Lively. Seats are created from the package and a guest-list email is drafted for staff approval.</p>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!ok || saving} data-testid="save-pledge">{saving ? 'Saving…' : 'Record pledge & email link'}</button></div>
      </form>
    </Modal>
  )
}
