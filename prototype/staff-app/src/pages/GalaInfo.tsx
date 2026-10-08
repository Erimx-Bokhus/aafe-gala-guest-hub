import { useState } from 'react'
import { fmtDate, money } from '@shared/ui'
import type { GalaEvent, Seat } from '@shared/types'
import { PageHead } from '../App'
import { useStaff } from '../store'

const RUN = [
  ['5:00 PM', 'Staff & volunteer call time; check-in iPads charged and synced'],
  ['6:00 PM', 'Doors open · check-in · cocktail reception'],
  ['7:00 PM', 'Guests seated'],
  ['7:15 PM', 'Welcome & program'],
  ['7:45 PM', 'Dinner service'],
  ['8:30 PM', 'Honoree recognition & sponsor thank-yous'],
  ['9:30 PM', 'Closing remarks · dessert & networking'],
]

export default function GalaInfo() {
  const { db, api, user, act } = useStaff()
  const ev = db.gala_events.find((e) => e.id === db.meta.current_event_id)!
  const [f, setF] = useState<GalaEvent>(ev)
  const set = (k: keyof GalaEvent) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const canEdit = user.role === 'gala_admin'
  const past = db.gala_events.filter((e) => e.id !== ev.id).sort((a, b) => b.year - a.year)
  // What saving moves (staff_update_gala_event): QR e-ticket expiry follows the date; sponsors on the gala's deadline
  // follow the new deadline, with their links. Live seats carry the code's hash; demo data keeps codes on guests.
  const orders = db.orders.filter((o) => o.event_id === ev.id)
  const ids = new Set(orders.map((o) => o.id))
  const qrCount = db.seats.filter((s) => ids.has(s.order_id) && s.status !== 'cancelled' && (s as Seat & { qr_token_hash?: string | null }).qr_token_hash).length
    || db.guests.filter((g) => ids.has(g.order_id) && g.qr_token).length
  const followers = orders.filter((o) => (o.guest_list_deadline ?? '') === (ev.guest_list_deadline ?? '')).length
  const moves = [
    f.event_date !== ev.event_date && qrCount > 0 && `${qrCount} QR e-ticket${qrCount === 1 ? '' : 's'} will expire the morning after the new date.`,
    f.guest_list_deadline !== ev.guest_list_deadline && followers > 0 && `${followers} sponsor${followers === 1 ? '' : 's'} on the gala's deadline will move to the new one, with their links. Sponsors with their own deadline keep it.`,
  ].filter(Boolean) as string[]
  return (
    <div>
      <PageHead title="Gala information" sub="The single source for date, venue and deadlines. Guest-portal pages and emails read from here." />
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); const { name, event_date, doors_time, program_time, venue_name, venue_address, dress_code, guest_list_deadline, program_ad_deadline } = f; void act(api.updateGalaEvent({ name, event_date, doors_time, program_time, venue_name, venue_address, dress_code, guest_list_deadline, program_ad_deadline }), 'Gala information saved') }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label" htmlFor="n">Event name</label><input id="n" className="input" value={f.name} onChange={set('name')} disabled={!canEdit} /></div>
            <div><label className="label" htmlFor="d">Date</label><input id="d" type="date" className="input" value={f.event_date} onChange={set('event_date')} disabled={!canEdit} /></div>
            <div className="grid grid-cols-2 gap-2"><div><label className="label" htmlFor="dt">Doors</label><input id="dt" className="input" value={f.doors_time} onChange={set('doors_time')} disabled={!canEdit} /></div><div><label className="label" htmlFor="pt">Program</label><input id="pt" className="input" value={f.program_time} onChange={set('program_time')} disabled={!canEdit} /></div></div>
            <div><label className="label" htmlFor="v">Venue</label><input id="v" className="input" value={f.venue_name} onChange={set('venue_name')} disabled={!canEdit} /></div>
            <div><label className="label" htmlFor="dc">Dress code</label><input id="dc" className="input" value={f.dress_code} onChange={set('dress_code')} disabled={!canEdit} /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="a">Address</label><input id="a" className="input" value={f.venue_address} onChange={set('venue_address')} disabled={!canEdit} /></div>
            <div><label className="label" htmlFor="gd">Guest names due</label><input id="gd" type="date" className="input" value={f.guest_list_deadline} onChange={set('guest_list_deadline')} disabled={!canEdit} /></div>
            <div><label className="label" htmlFor="ad">Logos & program ads due</label><input id="ad" type="date" className="input" value={f.program_ad_deadline} onChange={set('program_ad_deadline')} disabled={!canEdit} /></div>
          </div>
          {canEdit && moves.length > 0 && <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status" data-testid="gala-moves">{moves.map((m) => <li key={m}>{m}</li>)}</ul>}
          {canEdit ? <button className="btn-primary">Save gala information</button> : <p className="text-xs text-navy-500">Only gala admins can edit.</p>}
        </form>
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-semibold text-navy-900">Run of show (draft)</h2>
            <ol className="mt-3 space-y-2">{RUN.map(([t, d]) => <li key={t} className="flex gap-3 text-sm"><span className="w-16 shrink-0 font-semibold tabular-nums text-brand-600">{t}</span><span className="text-navy-700">{d}</span></li>)}</ol>
          </section>
          <section className="card p-5">
            <h2 className="font-semibold text-navy-900">Past galas (historical ledger)</h2>
            <ul className="mt-3 divide-y divide-navy-100 text-sm">
              {past.map((e) => {
                const ids = new Set(db.orders.filter((o) => o.event_id === e.id).map((o) => o.id))
                const total = db.payments.filter((p) => ids.has(p.order_id)).reduce((s, p) => s + p.gross_amount, 0)
                return <li key={e.id} className="flex justify-between py-2"><span><span className="font-semibold text-navy-900">{e.name}</span><br /><span className="text-xs text-navy-500">{fmtDate(e.event_date)}</span></span><span className="text-right font-semibold tabular-nums text-navy-800">{money(total)}<br /><span className="text-xs font-normal text-navy-500">{ids.size} sponsors (synthetic)</span></span></li>
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
