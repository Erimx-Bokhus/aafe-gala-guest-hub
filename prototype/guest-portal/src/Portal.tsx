import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { CalendarDays, CheckCircle2, Clock, History, Lock, MapPin, Pencil, Plus, Trash2, UserRound } from 'lucide-react'
import { Field, Modal, Toast, fmtDate, money } from '@shared/ui'
import type { DB } from '@shared/types'
import { DICT, LOCALE, type Lang } from './i18n'
import { LIVE, fetchPortalView, getPortalView, removeAttendee, removeAttendeeLive, saveAttendee, saveAttendeeLive, type AttendeeInput, type PortalView } from './portalApi'
import Hero, { MissionStrip } from './Hero'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMPTY: AttendeeInput = { first_name: '', last_name: '', title: '', organization: '', email: '', dietary_needs: '', accessibility_needs: '' }

function AttendeeForm({ lang, initial, onSave, onCancel }: { lang: Lang; initial: AttendeeInput; onSave: (v: AttendeeInput) => void; onCancel: () => void }) {
  const t = DICT[lang]
  const [v, setV] = useState(initial)
  const [touched, setTouched] = useState(false)
  const errs: Partial<Record<keyof AttendeeInput, string>> = {}
  ;(['first_name', 'last_name', 'title', 'organization', 'email'] as const).forEach((k) => { if (!v[k].trim()) errs[k] = t.required })
  if (v.email.trim() && !EMAIL_RE.test(v.email.trim())) errs.email = t.invalidEmail
  const set = (k: keyof AttendeeInput) => (e: ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value })
  const err = (k: keyof AttendeeInput) => (touched ? errs[k] : undefined)
  const trimmed = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim()])) as unknown as AttendeeInput
  return (
    <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!Object.keys(errs).length) onSave(trimmed) }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="fn" label={t.firstName} error={err('first_name')}><input id="fn" className="input" value={v.first_name} onChange={set('first_name')} autoFocus /></Field>
        <Field id="ln" label={t.lastName} error={err('last_name')}><input id="ln" className="input" value={v.last_name} onChange={set('last_name')} /></Field>
      </div>
      <Field id="ti" label={t.title} hint={t.titleHint} error={err('title')}><input id="ti" className="input" value={v.title} onChange={set('title')} /></Field>
      <Field id="or" label={t.organization} hint={t.titleHint} error={err('organization')}><input id="or" className="input" value={v.organization} onChange={set('organization')} /></Field>
      <Field id="em" label={t.email} error={err('email')}><input id="em" type="email" className="input" value={v.email} onChange={set('email')} placeholder="name@example.org" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="di" label={t.dietary}><input id="di" className="input" value={v.dietary_needs} onChange={set('dietary_needs')} /></Field>
        <Field id="ac" label={t.access}><input id="ac" className="input" value={v.accessibility_needs} onChange={set('accessibility_needs')} /></Field>
      </div>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="btn-ghost">{t.cancel}</button>
        <button type="submit" className="btn-primary" data-testid="save-attendee">{t.save}</button>
      </div>
    </form>
  )
}

function activityText(lang: Lang, a: PortalView['activity'][number]) {
  const t = DICT[lang]
  const m = a.summary.match(/^(.*?) (?:added to seat|updated \(seat|removed from seat) (\d+)/)
  const name = m?.[1] ?? a.summary.replace(/ confirmed by AAFE\.?$/, '')
  const seat = m?.[2] ?? ''
  switch (a.action) {
    case 'guest.submitted': return t.actAdded(name, seat)
    case 'guest.updated': return t.actUpdated(name, seat)
    case 'guest.removed': return t.actRemoved(name, seat)
    case 'seat.reviewed': return t.actConfirmed(name)
    case 'payment.recorded': return t.actPayment(a.summary.replace(/^Payment received: /, '').replace(/\.$/, ''))
    case 'order.created': return t.actOrder
    case 'portal_link.sent': return t.actLink
    default: return a.summary
  }
}

export default function Portal({ db, update, token, lang }: { db: DB; update: (fn: (d: DB) => DB) => void; token: string; lang: Lang }) {
  const t = DICT[lang]
  const loc = LOCALE[lang]
  const localView = useMemo(() => (LIVE ? null : getPortalView(db, token)), [db, token])
  // LIVE: undefined = loading, null = invalid link
  const [liveView, setLiveView] = useState<PortalView | null | undefined>(undefined)
  const [editing, setEditing] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  useEffect(() => { if (LIVE) { setLiveView(undefined); fetchPortalView(token).then(setLiveView, () => setLiveView(null)) } }, [token])
  const view = LIVE ? liveView : localView
  const save = (slot: number, v: AttendeeInput, after: () => void) => {
    if (!LIVE) { update((d) => saveAttendee(d, token, slot, v)); after(); return }
    saveAttendeeLive(token, slot, v).then((nv) => { setLiveView(nv); after() }, () => setToast(t.saveFailed))
  }
  const remove = (slot: number, after: () => void) => {
    if (!LIVE) { update((d) => removeAttendee(d, token, slot)); after(); return }
    removeAttendeeLive(token, slot).then((nv) => { setLiveView(nv); after() }, () => setToast(t.saveFailed))
  }

  if (view === undefined) return <main aria-busy="true" className="mx-auto max-w-xl px-5 py-20 text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" /></main>
  if (!view) return (
    <main className="mx-auto max-w-xl px-5 py-20 text-center">
      <Lock className="mx-auto text-navy-300" size={32} />
      <h1 className="mt-4 text-2xl font-semibold text-navy-900">{t.notFound}</h1>
      <p className="mt-2 text-navy-600">{t.notFoundHelp}</p>
    </main>
  )

  const seat = editing != null ? view.seats.find((s) => s.slot === editing)! : null
  const pct = view.stats.total ? Math.round((view.stats.named / view.stats.total) * 100) : 0
  const statusText = { paid: t.stPaid, partial: t.stPartial, pledged: t.stPledged, comp: t.stComp }[view.money.status]
  const statusCls = { paid: 'bg-emerald-50 text-emerald-800', partial: 'bg-amber-50 text-amber-800', pledged: 'bg-amber-50 text-amber-800', comp: 'bg-brand-50 text-brand-600' }[view.money.status]

  return (
    <main>
      <Hero lang={lang} eyebrow={t.eyebrow} title={`${t.welcome}, ${view.organization}`} body={t.heroBody}>
        <div className="mt-6 grid max-w-md grid-cols-2 gap-3">
          <div className="rounded-xl border border-cream-200 bg-surface p-3"><div className="text-[0.6875rem] font-semibold uppercase tracking-wide text-brand-600">{t.package}</div><div className="mt-1 text-sm font-semibold text-navy-900">{view.tierName}</div></div>
          <div className="rounded-xl border border-cream-200 bg-surface p-3"><div className="text-[0.6875rem] font-semibold uppercase tracking-wide text-brand-600">{t.eventWhen}</div><div className="mt-1 text-sm font-semibold text-navy-900">{fmtDate(view.event.date, loc)}</div></div>
        </div>
        <button type="button" className="btn-primary mt-6" onClick={() => {
          const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          document.getElementById('seats')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
          document.getElementById('seats-h')?.focus({ preventScroll: true })
        }}>{t.openList}</button>
      </Hero>

      <div className="mx-auto max-w-6xl space-y-8 px-5 py-10">
        {/* Seats */}
        <section id="seats" className="scroll-mt-20" aria-labelledby="seats-h">
          <h2 id="seats-h" tabIndex={-1} className="text-2xl font-semibold text-navy-900">{t.seatsTitle}</h2>
          <p className="mt-1 max-w-3xl text-navy-600">{t.seatsHelp}</p>
          <div className="card mt-5 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500">{t.seats}</h2>
            <div className="mt-2 font-serif text-4xl text-navy-900">{view.stats.named}<span className="text-2xl text-navy-300"> / {view.stats.total}</span></div>
            <div className="text-sm text-navy-500">{t.progress(view.stats.named, view.stats.total)}</div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-navy-50"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
            <dl className="mt-4 space-y-2 border-t border-navy-100 pt-4 text-sm">
              {view.deadline && <div className="flex items-center gap-2 text-navy-700"><Clock size={15} className="text-brand-500" /> {t.deadline}: <strong className="text-navy-900">{fmtDate(view.deadline, loc)}</strong></div>}
              <div className="flex items-center gap-2 text-navy-700"><CalendarDays size={15} className="text-brand-500" /> {fmtDate(view.event.date, loc)} · {view.event.doors}</div>
              <div className="flex items-start gap-2 text-navy-700"><MapPin size={15} className="mt-0.5 shrink-0 text-brand-500" /> <span>{view.event.venue}<br /><span className="text-xs text-navy-500">{view.event.address}</span></span></div>
            </dl>
          </div>
          <ul className="mt-5 grid gap-3 md:grid-cols-2">
            {view.seats.map((s) => {
              const named = !!s.guest
              const confirmed = s.status === 'reviewed' || s.status === 'badge_ready' || s.status === 'checked_in'
              return (
                <li key={s.slot} className={`card flex flex-col p-4 ${named ? '' : 'border-dashed'}`} data-testid={`seat-${s.slot}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-navy-500">{t.seat} {s.slot}</span>
                    {named ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${confirmed ? 'bg-emerald-50 text-emerald-800' : 'bg-brand-50 text-brand-600'}`}>{confirmed ? t.confirmed : t.received}</span>
                      : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">{t.open}</span>}
                  </div>
                  {s.guest ? (
                    <div className="mt-2 flex-1">
                      <div className="flex items-center gap-2 text-lg font-semibold text-navy-900"><UserRound size={18} className="text-navy-300" /> {s.guest.first_name} {s.guest.last_name}</div>
                      <div className="text-sm text-navy-600">{s.guest.title} · {s.guest.organization}</div>
                      {(s.guest.dietary_needs || s.guest.accessibility_needs) && (
                        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                          {s.guest.dietary_needs && <span className="rounded bg-navy-50 px-2 py-0.5 text-navy-700">{t.dietaryShort}: {s.guest.dietary_needs}</span>}
                          {s.guest.accessibility_needs && <span className="rounded bg-navy-50 px-2 py-0.5 text-navy-700">{t.accessShort}: {s.guest.accessibility_needs}</span>}
                        </div>
                      )}
                      <div className="mt-2 text-xs text-navy-500">{t.lastUpdated}: {fmtDate(s.guest.updated_at, loc, true)}</div>
                    </div>
                  ) : <div className="flex-1" />}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className={named ? 'btn-ghost btn-sm' : 'btn-primary btn-sm'} onClick={() => setEditing(s.slot)} data-testid={`edit-seat-${s.slot}`}>
                      {named ? <><Pencil size={14} /> {t.update}</> : <><Plus size={14} /> {t.add}</>}
                    </button>
                    {named && s.status !== 'checked_in' && (
                      <button className="btn-ghost btn-sm text-rose-700" onClick={() => { if (window.confirm(t.confirmRemove)) remove(s.slot, () => setToast(t.saved)) }}>
                        <Trash2 size={14} /> {t.remove}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        {justSaved && (
          <div role="status" className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            <CheckCircle2 size={20} /> <span className="font-medium">{t.saved}</span>
          </div>
        )}

        {/* Activity */}
        <section className="card p-5" aria-labelledby="act-h">
          <h2 id="act-h" className="flex items-center gap-2 text-lg font-semibold text-navy-900"><History size={18} className="text-brand-500" /> {t.activityTitle}</h2>
          <p className="text-sm text-navy-500">{t.activityHelp}</p>
          <ol className="mt-4 max-h-80 space-y-0 overflow-y-auto" data-testid="activity">
            {view.activity.map((a, k) => (
              <li key={k} className="flex gap-3 border-l-2 border-cream-200 py-2 pl-4">
                <time className="w-40 shrink-0 text-xs text-navy-500" dateTime={a.at}>{fmtDate(a.at, loc, true)}</time>
                <span className="text-sm text-navy-800">{activityText(lang, a)}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Contribution */}
        <section className="grid gap-4 lg:grid-cols-3" aria-label={t.contribution}>
          <div className="card p-5 lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-navy-500">{t.contribution}</h2>
                <div className="mt-2 font-serif text-4xl text-navy-900" data-testid="amount-paid">{money(view.money.paid, view.money.paid % 1 !== 0)}</div>
                <div className="text-sm text-navy-500">{t.amountPaid}</div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusCls}`}>{statusText}</span>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-navy-100 pt-4 text-sm sm:grid-cols-3">
              <div><dt className="text-navy-500">{t.commitment}</dt><dd className="font-semibold text-navy-900">{money(view.money.commitment)}</dd></div>
              <div><dt className="text-navy-500">{t.balance}</dt><dd className="font-semibold text-navy-900">{money(view.money.balance)}</dd></div>
              <div className="col-span-2 sm:col-span-1"><dt className="text-navy-500">{t.paymentsTitle}</dt>
                <dd className="space-y-0.5">
                  {view.money.payments.length ? view.money.payments.map((p) => <div key={p.date} className="text-navy-900"><span className="font-semibold">{money(p.amount, p.amount % 1 !== 0)}</span> · {t.paidOn} {fmtDate(p.date, loc)}</div>) : <span className="text-navy-600">{t.noPayments}</span>}
                </dd>
              </div>
            </dl>
            <p className="mt-4 flex items-center gap-1.5 text-xs text-navy-500"><Lock size={12} /> {t.payNote}</p>
          </div>
        </section>
      </div>

      {/* Thank you */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 py-12 md:grid-cols-2">
          <img src="./photos/gala-guests-dinner.jpg" alt="Guests sharing a table at the AAFE gala" className="aspect-[4/3] w-full rounded-2xl object-cover" style={{ objectPosition: 'center 35%' }} loading="lazy" />
          <div>
            <h2 className="font-serif text-3xl font-medium text-navy-900">{t.thanksTitle}</h2>
            <p className="mt-3 leading-relaxed text-navy-600">{t.thanksBody}</p>
            <div className="mt-6 rounded-xl bg-cream-100 p-4 text-sm">
              <div className="font-semibold text-navy-900">{t.help}</div>
              <a className="font-medium text-brand-600 underline underline-offset-2" href="mailto:gala-team@aafe-demo.example.org">{t.contact}</a>
              <div className="text-navy-500">gala-team@aafe-demo.example.org · (212) 555-0100</div>
            </div>
          </div>
        </div>
      </section>
      <MissionStrip lang={lang} />
      <footer className="mx-auto max-w-6xl px-5 py-8 text-xs leading-relaxed text-navy-500">{t.privacy}</footer>

      <Modal open={seat != null} onClose={() => setEditing(null)} title={seat?.guest ? t.formEditTitle : t.formAddTitle}>
        {seat && <AttendeeForm lang={lang} initial={seat.guest ? { ...EMPTY, ...seat.guest } : { ...EMPTY, organization: view.organization }} onCancel={() => setEditing(null)}
          onSave={(v) => save(seat.slot, v, () => { setEditing(null); setJustSaved(true); setToast(t.saved) })} />}
      </Modal>
      <Toast msg={toast} onDone={() => setToast(null)} />
    </main>
  )
}
