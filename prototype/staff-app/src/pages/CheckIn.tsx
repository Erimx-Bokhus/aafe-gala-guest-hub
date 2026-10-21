import { useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, Download, QrCode, Search, UserPlus } from 'lucide-react'
import { GUEST_TYPE_LABEL, hasSponsor, sponsorOf } from '@shared/data'
import { unknownCodeMessage } from '@shared/offlineCheckin'
import { Field, Modal, downloadCsv, fmtDate } from '@shared/ui'
import { useStaff } from '../store'
import { curOrders } from './Dashboard'
import { canDo, checkInErrorText } from '../api'
import { checkinCsv, csvName, isDemo } from '../exports'

// iPad check-in. Volunteers see ONLY name, title, organization, sponsor, table/seat and status.
const EXCEPTIONS = ['Arrived with sponsor', 'Sponsor seat was not previously named', 'Comp guest', 'Approved by relationship manager', 'Walk-in pending confirmation']
type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> }

export default function CheckIn() {
  const { db, api, user, toast, act } = useStaff()
  const [q, setQ] = useState('')
  const [code, setCode] = useState('')
  const [scan, setScan] = useState(false)
  const [exc, setExc] = useState(false)
  const [last, setLast] = useState<string | null>(null)
  const [ex, setEx] = useState({ name: '', orderId: '', type: EXCEPTIONS[0], note: '' })
  const video = useRef<HTMLVideoElement>(null)
  const ids = new Set(curOrders(db).map((o) => o.id))
  const guests = db.guests.filter((g) => ids.has(g.order_id))
  const arrived = db.check_ins.filter((c) => c.event_id === db.meta.current_event_id).length
  const sp = (oid: string) => sponsorOf(db, db.orders.find((o) => o.id === oid)!.sponsor_id).organization_name
  const results = q.trim().length < 2 ? [] : guests.filter((g) => `${g.first_name} ${g.last_name} ${g.organization} ${sp(g.order_id)}`.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)

  const arrive = async (gid: string, method: 'qr' | 'search') => {
    const g = guests.find((x) => x.id === gid)!
    if (g.attendance_status === 'checked_in') { toast(`${g.first_name} ${g.last_name} is already checked in`); return }
    // Not through act(): a failed check-in says what still works at the door when the internet is down.
    try {
      const r = await api.checkIn(gid, method)
      setLast(gid); toast(r.already ? `${g.first_name} ${g.last_name} is already checked in` : `${g.first_name} ${g.last_name} checked in`)
    } catch (e) { toast(checkInErrorText(e)) }
  }
  // The door list never holds QR codes (the database keeps only their hash), so the server matches the code.
  const byCode = async (c: string) => {
    if (!c.trim()) return
    try {
      const r = await api.checkInByCode(c)
      const g = guests.find((x) => x.id === r.guestId)
      setLast(r.guestId); setCode('')
      toast(`${g ? `${g.first_name} ${g.last_name}` : 'Guest'} ${r.already ? 'is already checked in' : 'checked in'}`)
    } catch (e) {
      toast(e instanceof Error && e.message.startsWith('not_found: unknown QR code') ? unknownCodeMessage(c) : checkInErrorText(e))
    }
  }

  // Camera QR scanning where the browser supports BarcodeDetector (Safari on iPadOS 17+, Chrome). Manual code entry otherwise.
  useEffect(() => {
    if (!scan) return
    const BD = (window as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector
    if (!BD || !navigator.mediaDevices) { toast('Camera scanning not supported here — type the code instead'); setScan(false); return }
    let stream: MediaStream | null = null, raf = 0, stop = false
    const det = new BD({ formats: ['qr_code'] })
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then((s) => {
      stream = s; if (!video.current) return
      video.current.srcObject = s; video.current.play()
      const loop = async () => { if (stop || !video.current) return; try { const r = await det.detect(video.current); if (r[0]) { byCode(r[0].rawValue); setScan(false); return } } catch { /* keep scanning */ } raf = requestAnimationFrame(loop) }
      loop()
    }).catch(() => { toast('Camera permission denied — type the code instead'); setScan(false) })
    return () => { stop = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()) }
  }, [scan]) // eslint-disable-line

  const lastG = guests.find((g) => g.id === last)
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold text-navy-900">Event-day check-in</h1><p className="text-sm text-navy-600">Search a name or scan a guest’s QR code.</p></div>
        <div className="flex flex-wrap items-end gap-4">
          {/* The fallback if the iPad or the venue's internet fails: print it before doors open. */}
          <button className="btn-ghost" data-testid="export-checkin" onClick={() => void act(api.exportCheckin().then((rows) => downloadCsv(csvName(db, 'aafe-checkin-list'), checkinCsv(rows, isDemo(db)))), 'Check-in list downloaded')}><Download size={15} /> Printed check-in list</button>
          {/* The end-of-night report: who came, with their sponsor and what was paid (Reports page, Oct 14). */}
          {/* It has guests' emails, so it opens the Reports page rather than saving a file on a shared door iPad (review of #135). */}
          {canDo(user.role, 'reportAttendance') && <a className="btn-primary" data-testid="download-who-came" href="#/reports"><Download size={15} /> Who came (Reports)</a>}
          <div className="text-right"><div className="text-3xl font-semibold tabular-nums text-navy-900" data-testid="arrived-count">{arrived}</div><div className="text-xs text-navy-500">arrived</div></div>
        </div>
      </div>

      {lastG && <div role="status" className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800"><CheckCircle2 size={22} /><div><div className="font-semibold">{lastG.first_name} {lastG.last_name} — welcome</div><div className="text-sm">{lastG.table_id ? `Table ${db.event_tables.find((t) => t.id === lastG.table_id)!.number}, seat ${lastG.seat_number}` : 'See the host stand for seating'}</div></div></div>}

      <div className="relative"><Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-navy-300" />
        <input className="input h-14 pl-12 text-lg" placeholder="Guest name, organization or sponsor" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search guests" data-testid="checkin-search" /></div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); byCode(code) }}>
          <input className="input h-12" placeholder="QR code, e.g. AAFE-3F9C…" value={code} onChange={(e) => setCode(e.target.value)} aria-label="QR code" data-testid="qr-input" />
          <button className="btn-navy h-12 shrink-0"><QrCode size={18} /> Enter</button>
        </form>
        <button className="btn-ghost h-12" onClick={() => setScan((s) => !s)}><Camera size={18} /> {scan ? 'Stop camera' : 'Scan QR'}</button>
        <button className="btn-ghost h-12" onClick={() => setExc(true)}><UserPlus size={18} /> Exception</button>
      </div>
      {scan && <video ref={video} className="mt-3 aspect-video w-full rounded-xl bg-black object-cover" muted playsInline />}

      <ul className="mt-4 space-y-3">
        {results.map((g) => {
          const t = db.event_tables.find((x) => x.id === g.table_id)
          const done = g.attendance_status === 'checked_in'
          return (
            <li key={g.id} className="card flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <div className="text-xl font-semibold text-navy-900">{g.first_name} {g.last_name}</div>
                <div className="text-sm text-navy-600">{g.title} · {g.organization}</div>
                <div className="mt-1 text-sm text-navy-500">{hasSponsor(g.guest_type) ? `Sponsor: ${sp(g.order_id)}` : GUEST_TYPE_LABEL[g.guest_type]} · <strong className="text-navy-800">{t ? `Table ${t.number}, seat ${g.seat_number}` : 'Table pending'}</strong></div>
              </div>
              {done ? <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 font-semibold text-emerald-800"><CheckCircle2 size={18} /> Checked in</span>
                : <button className="btn-primary h-14 px-8 text-base" onClick={() => arrive(g.id, 'search')} data-testid={`arrive-${g.id}`}>Mark arrived</button>}
            </li>
          )
        })}
        {q.trim().length >= 2 && !results.length && <li className="card p-6 text-center text-navy-600">No match. Check spelling, or add an approved exception.</li>}
      </ul>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500">Recent arrivals</h2>
        <ul className="mt-2 divide-y divide-navy-100 text-sm">
          {db.check_ins.filter((c) => c.event_id === db.meta.current_event_id).sort((a, b) => Date.parse(b.checked_in_at) - Date.parse(a.checked_in_at)).slice(0, 6).map((c) => { const g = guests.find((x) => x.id === c.guest_id); return <li key={c.id} className="flex justify-between gap-3 py-2"><span className="text-navy-800">{g ? `${g.first_name} ${g.last_name}` : c.arrival_name} <span className="text-xs text-navy-500">· {c.type} · {c.method}</span></span><span className="shrink-0 text-xs text-navy-500">{fmtDate(c.checked_in_at, 'en-US', true)} · {c.checked_in_by}</span></li> })}
        </ul>
      </section>

      <Modal open={exc} onClose={() => setExc(false)} title="Add approved exception">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!ex.name.trim()) return; void act(api.checkInException({ ...ex, orderId: ex.orderId || null }), 'Exception check-in saved').then((ok) => { if (ok) { setExc(false); setEx({ name: '', orderId: '', type: EXCEPTIONS[0], note: '' }) } }) }}>
          <Field id="xn" label="Guest name"><input id="xn" className="input" value={ex.name} onChange={(e) => setEx({ ...ex, name: e.target.value })} /></Field>
          <Field id="xs" label="With sponsor (optional)"><select id="xs" className="input" value={ex.orderId} onChange={(e) => setEx({ ...ex, orderId: e.target.value })}><option value="">—</option>{curOrders(db).map((o) => <option key={o.id} value={o.id}>{sponsorOf(db, o.sponsor_id).organization_name}</option>)}</select></Field>
          <fieldset><legend className="mb-1 text-sm font-medium text-navy-800">Exception type</legend><div className="space-y-1.5">{EXCEPTIONS.map((x) => <label key={x} className="flex items-center gap-2 text-sm"><input type="radio" name="xt" checked={ex.type === x} onChange={() => setEx({ ...ex, type: x })} className="accent-[#C64C28]" /> {x}</label>)}</div></fieldset>
          <Field id="xo" label="Internal note (optional)"><input id="xo" className="input" value={ex.note} onChange={(e) => setEx({ ...ex, note: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setExc(false)}>Cancel</button><button className="btn-primary" disabled={!ex.name.trim()}>Save check-in</button></div>
        </form>
      </Modal>
    </div>
  )
}
