import { useState } from 'react'
import { orderMoney, sponsorOf } from '@shared/data'
import { Field, Modal, Pill, money, type Tone } from '@shared/ui'
import type { SeatStatus } from '@shared/types'
import { addPledge, recordOfflinePayment, useStaff } from './store'
import { curOrders } from './pages/Dashboard'

export const GUEST_PORTAL_URL: string = import.meta.env.VITE_GUEST_PORTAL_URL ?? 'https://guest-portal.example.org/'

export const SEAT_PILL: Record<SeatStatus, [Tone, string]> = {
  unnamed: ['amber', 'Unnamed'], submitted: ['blue', 'Needs review'], reviewed: ['gray', 'Reviewed'],
  badge_ready: ['green', 'Badge ready'], checked_in: ['brand', 'Checked in'], cancelled: ['gray', 'Cancelled'],
}
export const SeatPill = ({ s }: { s: SeatStatus }) => <Pill tone={SEAT_PILL[s][0]}>{SEAT_PILL[s][1]}</Pill>

/** Check in the mail, or ACH/wire seen on AAFE's bank statement — staff records it here. */
export function RecordPaymentModal({ open, onClose, orderId }: { open: boolean; onClose: () => void; orderId?: string }) {
  const { db, update, user, toast } = useStaff()
  const candidates = curOrders(db).filter((o) => o.source !== 'givelively' && o.source !== 'comp' && orderMoney(db, o.id).balance > 0)
  const [oid, setOid] = useState(orderId ?? candidates[0]?.id ?? '')
  const bal = oid ? orderMoney(db, oid).balance : 0
  const [method, setMethod] = useState<'check' | 'ach_direct' | 'wire'>('check')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [checkNo, setCheckNo] = useState('')
  const amt = Number(amount || bal)
  const valid = oid && amt > 0 && (method !== 'check' || checkNo.trim())
  return (
    <Modal open={open} onClose={onClose} title="Record check, ACH or wire">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!valid) return; update((d) => recordOfflinePayment(d, user, oid, { method, amount: amt, received: date, check_number: checkNo })); toast('Payment recorded — guest portal updated'); onClose() }}>
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
              <button type="button" key={v} onClick={() => setMethod(v)} aria-pressed={method === v} className={`rounded-md border px-2 py-2 text-sm font-medium ${method === v ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-navy-100 text-navy-700'}`}>{l}</button>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field id="ra" label="Amount" hint={`Balance due ${money(bal)}`}><input id="ra" className="input" inputMode="decimal" placeholder={String(bal)} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} /></Field>
          <Field id="rd" label={method === 'check' ? 'Deposit date' : 'Date on statement'}><input id="rd" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        {method === 'check' && <Field id="rc" label="Check number" error={!checkNo.trim() && amount ? 'Required for checks' : undefined}><input id="rc" className="input" value={checkNo} onChange={(e) => setCheckNo(e.target.value)} /></Field>}
        <p className="rounded-md bg-cream-100 p-3 text-xs text-navy-600">No processor fee on offline payments. If this is the first payment and no portal link was sent, the guest-list email goes out automatically. The payment is queued for Salesforce.</p>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!valid} data-testid="save-payment">Record payment</button></div>
      </form>
    </Modal>
  )
}

export function AddPledgeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, update, user, toast } = useStaff()
  const [f, setF] = useState({ org: '', contact: '', email: '', tierId: 'silver', source: 'check' as 'check' | 'ach_direct' | 'wire' })
  const ok = f.org.trim() && f.contact.trim() && /\S+@\S+\.\S+/.test(f.email)
  return (
    <Modal open={open} onClose={onClose} title="New pledge (check, ACH or wire)">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (!ok) return; update((d) => addPledge(d, user, f)); toast('Pledge recorded — guest-list link emailed'); onClose(); setF({ ...f, org: '', contact: '', email: '' }) }}>
        <Field id="po" label="Organization or donor name"><input id="po" className="input" value={f.org} onChange={(e) => setF({ ...f, org: e.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="pc" label="Primary contact"><input id="pc" className="input" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>
          <Field id="pe" label="Contact email"><input id="pe" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="pt" label="Package"><select id="pt" className="input" value={f.tierId} onChange={(e) => setF({ ...f, tierId: e.target.value })}>{db.sponsorship_tiers.filter((t) => t.tier_category !== 'complimentary').map((t) => <option key={t.id} value={t.id}>{t.name} — {money(t.contribution_amount)}</option>)}</select></Field>
          <Field id="ps" label="Will pay by"><select id="ps" className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as 'check' })}><option value="check">Check</option><option value="ach_direct">ACH to AAFE bank</option><option value="wire">Wire</option></select></Field>
        </div>
        <p className="rounded-md bg-cream-100 p-3 text-xs text-navy-600">Give Lively purchases arrive automatically — use this only for donors paying outside Give Lively. Seats are created from the package and the guest-list link is emailed right away.</p>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!ok}>Record pledge & email link</button></div>
      </form>
    </Modal>
  )
}
