import { useState } from 'react'
import { Mail, Plus } from 'lucide-react'
import { Field, Modal, Pill, fmtDate } from '@shared/ui'
import type { Guest } from '@shared/types'
import { PageHead } from '../App'
import { QR } from '../qr'
import { useStaff } from '../store'
import { useSave } from '../components'
import { curOrders } from './Dashboard'

export default function Relationship() {
  const { db, api, act } = useStaff()
  const { saving, save } = useSave()
  const [add, setAdd] = useState(false)
  const [preview, setPreview] = useState<Guest | null>(null)
  const [sendAll, setSendAll] = useState(false)
  const [f, setF] = useState({ first_name: '', last_name: '', title: '', organization: '', email: '', relationship_note: '' })
  const ev = db.gala_events.find((e) => e.id === db.meta.current_event_id)!
  // This gala's relationship guests only, by the guest list's own rule (curOrders), so the two pages always agree. It
  // listed every gala's (AAFE's Oct 20 walk-through, triage B5), which would mix 2027's into 2028's once it runs.
  const orders = new Set(curOrders(db).map((o) => o.id))
  const list = db.guests.filter((g) => g.guest_type === 'comp_relationship' && orders.has(g.order_id))
  const lastEmail = (g: Guest) => db.email_log.filter((e) => e.guest_id === g.id && e.template === 'qr_invitation').at(-1)
  // A name is enough (AAFE's Oct 20 walk-through, D4): an official's guest may come with no email yet. The server already
  // takes a guest without one; a typed email must still look like one.
  const ok = (f.first_name.trim() || f.last_name.trim()) && (!f.email.trim() || /\S+@\S+\.\S+/.test(f.email))
  // "Send all" (D5) reaches only guests who have an email and have never had an invitation, so it can't replace a code
  // someone was already sent (each send makes a new one).
  const unsent = list.filter((g) => g.email && !lastEmail(g))
  const sendAllNow = () => {
    const n = unsent.length
    setSendAll(false)
    void act((async () => { for (const g of unsent) await api.sendQrInvite(g.id) })(), `${n} QR invitation${n === 1 ? '' : 's'} sent${api.live ? '' : ' (simulated)'}`)
  }
  return (
    <div>
      <PageHead title="Relationship guests" sub="Complimentary guests invited by the Executive Director, board and relationship managers. Each gets a personal QR code by email to show at the door."
        actions={<>
          {unsent.length > 0 && <button className="btn-ghost" onClick={() => setSendAll(true)} data-testid="send-all-qr"><Mail size={16} /> Send all unsent QR invites ({unsent.length})</button>}
          <button className="btn-primary" onClick={() => setAdd(true)}><Plus size={16} /> Add guest</button>
        </>} />
      <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3 [&>*]:min-w-0">
        {list.map((g) => {
          const em = lastEmail(g)
          const t = db.event_tables.find((x) => x.id === g.table_id)
          return (
            <li key={g.id} className="card flex gap-4 p-4">
              {g.qr_token && <QR value={g.qr_token} size={96} className="shrink-0 ring-1 ring-navy-100" />}
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-navy-900">{g.first_name} {g.last_name}</div>
                <div className="truncate text-sm text-navy-600">{g.title} · {g.organization}</div>
                {/* The table, never a seat number: AAFE doesn't seat guests at numbered places (Oct 20 walk-through, 36:39). */}
                <div className="mt-1 text-xs text-navy-500">{g.relationship_note} · {t ? `Table ${t.number}` : 'No table'}</div>
                {g.qr_token && <div className="mt-1 font-sans tabular-nums text-xs text-navy-500">{g.qr_token}</div>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {em ? <Pill tone={em.status === 'queued' ? 'amber' : 'green'}>{em.status === 'queued' ? 'Invitation queued' : `Sent ${em.sent_at ? fmtDate(em.sent_at) : ''}`}</Pill> : <Pill tone="amber">Not sent</Pill>}
                  {g.attendance_status === 'checked_in' && <Pill tone="brand">Arrived</Pill>}
                  {g.email
                    ? <button className="btn-ghost btn-sm" onClick={() => setPreview(g)}><Mail size={13} /> {em && em.status !== 'queued' ? 'Resend' : 'Send'} QR invite</button>
                    : <span className="text-xs text-navy-500" data-testid="no-email">No email: add one to send a QR invite, or they check in by name</span>}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <Modal open={add} onClose={() => setAdd(false)} title="Add relationship guest">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!ok) return; void save(() => api.addCompGuest(f), api.live ? 'Guest added — send the QR invitation when ready' : 'Guest added — QR code created').then((done) => { if (done) { setAdd(false); setF({ first_name: '', last_name: '', title: '', organization: '', email: '', relationship_note: '' }) } }) }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="cf" label="First name" hint="A first or last name is enough"><input id="cf" className="input" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></Field>
            <Field id="cl" label="Last name"><input id="cl" className="input" value={f.last_name} onChange={(e) => setF({ ...f, last_name: e.target.value })} /></Field>
          </div>
          <Field id="ct" label="Title"><input id="ct" className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field id="co" label="Organization"><input id="co" className="input" value={f.organization} onChange={(e) => setF({ ...f, organization: e.target.value })} /></Field>
          <Field id="ce" label="Email (optional)" hint="Needed for the QR invitation; without one, the guest checks in by name"><input id="ce" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field id="cn" label="Relationship (staff only)" hint="Never shown to the guest or printed"><input id="cn" className="input" value={f.relationship_note} onChange={(e) => setF({ ...f, relationship_note: e.target.value })} placeholder="e.g. Executive Director’s guest" /></Field>
          <div className="flex justify-end gap-2 pt-1"><button type="button" className="btn-ghost" onClick={() => setAdd(false)}>Cancel</button><button className="btn-primary" disabled={!ok || saving} data-testid="save-comp">{saving ? 'Saving…' : 'Add guest'}</button></div>
        </form>
      </Modal>

      <Modal open={sendAll} onClose={() => setSendAll(false)} title={`Send ${unsent.length} QR invitation${unsent.length === 1 ? '' : 's'}?`}>
        <p className="text-sm text-navy-700">Each guest gets their own QR code by email: the same invitation as one sent from their card. Guests who were already sent one are left alone, so nobody's code changes.</p>
        <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setSendAll(false)}>Cancel</button><button className="btn-primary" data-testid="send-all-confirm" onClick={sendAllNow}><Mail size={15} /> Send {unsent.length}{api.live ? '' : ' (simulated)'}</button></div>
      </Modal>

      <Modal open={!!preview} onClose={() => setPreview(null)} title="QR invitation email (preview)">
        {preview && (
          <div>
            <div className="rounded-xl border border-navy-100 bg-cream-50 p-5">
              <div className="text-xs text-navy-500">To: {preview.first_name} {preview.last_name} &lt;{preview.email}&gt;<br />From: AAFE Gala Team &lt;gala-team@aafe-demo.example.org&gt;<br />Subject: Your invitation to the {ev.name}</div>
              <hr className="my-3 border-navy-100" />
              <p className="text-sm text-navy-800">Dear {preview.first_name},</p>
              <p className="mt-2 text-sm text-navy-800">It would be our honor to welcome you as our guest at the {ev.name} on {fmtDate(ev.event_date)} at {ev.venue_name}. Doors open at {ev.doors_time}.</p>
              <p className="mt-2 text-sm text-navy-800">Please show this code at check-in:</p>
              <div className="mt-3 flex justify-center">{preview.qr_token ? <QR value={preview.qr_token} size={140} /> : <p className="text-sm text-navy-600">(A new personal QR code is created when this sends.)</p>}</div>
              <p className="mt-3 text-sm text-navy-800">With gratitude,<br />The AAFE Gala Team</p>
            </div>
            <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setPreview(null)}>Close</button><button className="btn-primary" data-testid="send-qr" onClick={() => { void act(api.sendQrInvite(preview.id), api.live ? `QR invitation sent to ${preview.email}` : `QR invitation sent to ${preview.email} (simulated)`); setPreview(null) }}><Mail size={15} /> {api.live ? 'Send' : 'Send (simulated)'}</button></div>
          </div>
        )}
      </Modal>
    </div>
  )
}
