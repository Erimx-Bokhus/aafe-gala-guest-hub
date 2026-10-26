import { useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { Field, Modal, Pill, fmtDate, money } from '@shared/ui'
import type { EventTable, GalaEvent, Seat } from '@shared/types'
import { PageHead } from '../App'
import { useStaff } from '../store'
import { canDo, type NewGala } from '../api'

const RUN = [
  ['5:00 PM', 'Staff & volunteer call time; check-in iPads charged and synced'],
  ['6:00 PM', 'Doors open · check-in · cocktail reception'],
  ['7:00 PM', 'Guests seated'],
  ['7:15 PM', 'Welcome & program'],
  ['7:45 PM', 'Dinner service'],
  ['8:30 PM', 'Honoree recognition & sponsor thank-yous'],
  ['9:30 PM', 'Closing remarks · dessert & networking'],
]

// Sponsor-facing arrivals (decided Oct 6): built switched off; a gala admin switches it on once AAFE's privacy review
// approves, recording who approved and when (staff_set_sponsor_arrivals). Sponsors see arrived or not, never a time.
function SponsorArrivals({ ev }: { ev: GalaEvent }) {
  const { api, user, act } = useStaff()
  const [note, setNote] = useState('')
  const on = !!ev.sponsor_arrivals_visible
  const admin = canDo(user.role, 'setSponsorArrivals')
  return (
    <section className="card p-5" data-testid="sponsor-arrivals">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold text-navy-900">Sponsors see who has arrived</h2>
        <Pill tone={on ? 'green' : 'gray'}>{on ? 'On' : 'Off'}</Pill>
      </div>
      <p className="mt-1 text-sm text-navy-600">On gala night, a sponsor's private link can show which of their guests have arrived: arrived or not, never a time. It stays off until AAFE's privacy review approves it.</p>
      {on && ev.sponsor_arrivals_note && <p className="mt-2 text-xs text-navy-500">Approved: {ev.sponsor_arrivals_note}</p>}
      {!admin ? <p className="mt-3 text-xs text-navy-500">Only gala admins can change this.</p>
        : on ? <button className="btn-ghost mt-3" data-testid="arrivals-off" onClick={() => void act(api.setSponsorArrivals(false, ''), 'Sponsors no longer see arrivals')}>Switch off</button>
        : (
          <div className="mt-3 space-y-2">
            <label className="label" htmlFor="arr-note">AAFE's privacy approval: who approved it, and when</label>
            <input id="arr-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn-primary" data-testid="arrivals-on" disabled={!note.trim()} onClick={() => void act(api.setSponsorArrivals(true, note), 'Sponsors can now see which of their guests have arrived').then((ok) => { if (ok) setNote('') })}>Switch on</button>
          </div>
        )}
    </section>
  )
}

// Tables (AAFE's Oct 20 walk-through, items 12 and 24): each table's number, a name that prints on badges beside it, and
// how many people it seats: 10 unless changed (AAFE's venue has 10- and 12-person tables; a smaller one is fine). The
// guest list's Table picker and its "full" follow the size. Gala admins edit; staff_save_table checks the same rules.
function TableRow({ t, at, canEdit }: { t: EventTable; at: number; canEdit: boolean }) {
  const { api, act } = useStaff()
  const [label, setLabel] = useState(t.label ?? '')
  const [seats, setSeats] = useState(String(t.capacity))
  const n = Number(seats)
  const error = !Number.isInteger(n) || n < 1 || n > 30 ? 'Seats 1 to 30' : n < at ? `${at} seated now` : null
  const changed = label.trim() !== (t.label ?? '') || n !== t.capacity
  const save = () => void act(api.saveTable(t.id, label, n), `Table ${t.number} saved`)
  return (
    <tr>
      <td className="td whitespace-nowrap font-semibold text-navy-900">Table {t.number}</td>
      <td className="td"><input className="input py-1" aria-label={`Name of Table ${t.number}`} placeholder="No name" maxLength={40} value={label} disabled={!canEdit}
        onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && changed && !error && save()} /></td>
      <td className="td"><input className="input w-20 py-1 tabular-nums" aria-label={`Seats at Table ${t.number}`} inputMode="numeric" value={seats} disabled={!canEdit}
        onChange={(e) => setSeats(e.target.value.replace(/[^0-9]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && changed && !error && save()} />
        {error && <div className="mt-1 text-xs text-rose-700">{error}</div>}</td>
      <td className="td tabular-nums text-navy-600">{at}</td>
      <td className="td">{canEdit && <button type="button" className="btn-ghost btn-sm" disabled={!changed || !!error} onClick={save}>Save</button>}</td>
    </tr>
  )
}

function Tables({ ev }: { ev: GalaEvent }) {
  const { db, user } = useStaff()
  const canEdit = canDo(user.role, 'saveTable')
  const tables = db.event_tables.filter((t) => t.event_id === ev.id).sort((a, b) => a.number - b.number)
  return (
    <section className="card mt-6 p-5" data-testid="tables">
      <h2 className="font-semibold text-navy-900">Tables</h2>
      <p className="mt-1 text-sm text-navy-600">A table's name prints on badges with its number ("Table 2 · Harborline"). Seats sets how many people the guest list lets you put there.{canEdit ? '' : ' Only gala admins can change these.'}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full max-w-2xl">
          <thead className="border-b border-navy-100"><tr><th className="th">Number</th><th className="th">Name on badges</th><th className="th">Seats</th><th className="th">Seated now</th><th className="th"><span className="sr-only">Save</span></th></tr></thead>
          <tbody className="divide-y divide-navy-100">
            {tables.map((t) => <TableRow key={`${t.id}:${t.label ?? ''}:${t.capacity}`} t={t} at={db.guests.filter((g) => g.table_id === t.id).length} canEdit={canEdit} />)}
          </tbody>
        </table>
      </div>
      {!tables.length && <p className="mt-3 text-sm text-navy-500">No tables for this gala yet.</p>}
    </section>
  )
}

export default function GalaInfo() {
  const { db, api, user, act } = useStaff()
  const ev = db.gala_events.find((e) => e.id === db.meta.current_event_id)!
  const [f, setF] = useState<GalaEvent>(ev)
  const set = (k: keyof GalaEvent) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const canEdit = user.role === 'gala_admin'
  const [starting, setStarting] = useState(false)
  // Galas started for a later year: in planning until this year's gala is over (current_event_id).
  const upcoming = db.gala_events.filter((e) => e.status !== 'closed' && e.year > ev.year).sort((a, b) => a.year - b.year)
  const past = db.gala_events.filter((e) => e.year < ev.year).sort((a, b) => b.year - a.year)   // a gala in planning isn't past
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
      <PageHead title="Gala information" sub="The single source for date, venue and deadlines. Guest-portal pages and emails read from here."
        actions={canDo(user.role, 'startGala') && <button className="btn-ghost" onClick={() => setStarting(true)} data-testid="start-gala"><CalendarPlus size={16} /> Start next year's gala</button>} />
      {upcoming.length > 0 && (
        <div className="card mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 p-4" data-testid="galas-planning">
          <span className="font-semibold text-navy-900">Coming up:</span>
          {upcoming.map((g) => <span key={g.id} className="text-navy-700">{g.name} · {fmtDate(g.event_date)} <Pill tone="gray">In planning</Pill></span>)}
          <a className="ml-auto text-sm font-semibold text-brand-700 underline underline-offset-2" href="#/levels">Set up its sponsorship levels</a>
        </div>
      )}
      {starting && <StartGala onClose={() => setStarting(false)} />}
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
          <SponsorArrivals ev={ev} />
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
      <Tables ev={ev} />
    </div>
  )
}

// Start next year's gala (staff_start_gala): filled in from this year's (same venue and times, the date a year on,
// on the same weekday), with its sponsorship levels started from this year's. Everything can be changed later.
const ORDINAL = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
const addDays = (iso: string, days: number) => { if (!iso) return ''; const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
function StartGala({ onClose }: { onClose: () => void }) {
  const { db, api, act } = useStaff()
  const latest = [...db.gala_events].sort((a, b) => b.year - a.year)[0]
  const cur = db.gala_events.find((e) => e.id === db.meta.current_event_id)!
  const n = Number(/(\d+)(st|nd|rd|th)/.exec(latest.name)?.[1])
  const date = addDays(latest.event_date, 364)   // a year on, same weekday
  const gap = latest.guest_list_deadline ? Math.round((+new Date(latest.event_date) - +new Date(latest.guest_list_deadline)) / 864e5) : 0
  const [f, setF] = useState<NewGala>({
    year: latest.year + 1, name: n ? latest.name.replace(/\d+(st|nd|rd|th)/, ORDINAL(n + 1)).replace(/ \(demo\)$/, '') + (latest.name.endsWith('(demo)') ? ' (demo)' : '') : '',
    event_date: date, doors_time: latest.doors_time ?? '', program_time: latest.program_time ?? '', venue_name: latest.venue_name ?? '', venue_address: latest.venue_address ?? '',
    dress_code: latest.dress_code ?? '', guest_list_deadline: gap ? addDays(date, -gap) : '', program_ad_deadline: '', copy_levels_from: cur.id,
  })
  const set = (k: keyof NewGala) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === 'year' ? Number(e.target.value) : e.target.value })
  const ok = f.year > latest.year && f.name.trim() && f.event_date && f.event_date.startsWith(String(f.year)) && (!f.guest_list_deadline || f.guest_list_deadline <= f.event_date)
    && (!f.program_ad_deadline || f.program_ad_deadline <= f.event_date)
  return (
    <Modal open onClose={onClose} title="Start next year's gala" wide>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ok) void act(api.startGala(f), `${f.name} started`).then((done) => { if (done) onClose() }) }}>
        <p className="text-sm text-navy-600">It starts in planning: this year's gala stays the current one for check-in, imports and reports until it's over. Filled in from {latest.year}; change anything.</p>
        <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
          <Field id="sg-year" label="Year"><input id="sg-year" className="input tabular-nums" inputMode="numeric" value={f.year || ''} onChange={set('year')} /></Field>
          <Field id="sg-name" label="Name"><input id="sg-name" className="input" value={f.name} onChange={set('name')} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="sg-date" label="Date"><input id="sg-date" type="date" className="input" value={f.event_date} onChange={set('event_date')} /></Field>
          <Field id="sg-doors" label="Doors"><input id="sg-doors" className="input" value={f.doors_time} onChange={set('doors_time')} /></Field>
          <Field id="sg-program" label="Program"><input id="sg-program" className="input" value={f.program_time} onChange={set('program_time')} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="sg-venue" label="Venue"><input id="sg-venue" className="input" value={f.venue_name} onChange={set('venue_name')} /></Field>
          <Field id="sg-address" label="Address"><input id="sg-address" className="input" value={f.venue_address} onChange={set('venue_address')} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="sg-dress" label="Dress code"><input id="sg-dress" className="input" value={f.dress_code} onChange={set('dress_code')} /></Field>
          <Field id="sg-deadline" label="Guest names due"><input id="sg-deadline" type="date" className="input" value={f.guest_list_deadline} onChange={set('guest_list_deadline')} /></Field>
          <Field id="sg-ad" label="Program ads due"><input id="sg-ad" type="date" className="input" value={f.program_ad_deadline} onChange={set('program_ad_deadline')} /></Field>
        </div>
        <label className="flex min-h-[44px] items-center gap-3 text-sm text-navy-800">
          <input type="checkbox" checked={!!f.copy_levels_from} onChange={(e) => setF({ ...f, copy_levels_from: e.target.checked ? cur.id : null })} data-testid="sg-copy" />
          Start its sponsorship levels from {cur.year}'s (change them on Sponsorship levels)
        </label>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!ok} data-testid="sg-save">Start the {f.year || ''} gala</button></div>
      </form>
    </Modal>
  )
}
