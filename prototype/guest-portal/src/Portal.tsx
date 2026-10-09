import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { CalendarDays, CheckCircle2, CircleDashed, Clock, Lock, MapPin, Pencil, Plus } from 'lucide-react'
import { Field, Modal, Toast, fmtDate, money } from '@shared/ui'
import type { DB } from '@shared/types'
import { DICT, LOCALE, type Lang } from './i18n'
import { LIVE, fetchPortalView, getPortalView, removeAttendee, removeAttendeeLive, saveAttendee, saveAttendeeLive, type AttendeeInput, type PortalView } from './portalApi'
import Hero, { MissionStrip } from './Hero'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMPTY: AttendeeInput = { first_name: '', last_name: '', title: '', organization: '', email: '', dietary_needs: '', accessibility_needs: '' }

function AttendeeForm({ lang, initial, onSave, onCancel }: { lang: Lang; initial: AttendeeInput; onSave: (v: AttendeeInput) => void; onCancel: () => void }) {
  const t = DICT[lang]
  const familyFirst = lang === 'zh' || lang === 'ko'
  const [v, setV] = useState(initial)
  const [touched, setTouched] = useState(false)
  const IDS = { first_name: 'fn', last_name: 'ln', title: 'ti', organization: 'or', email: 'em' } as const
  const errs: Partial<Record<keyof AttendeeInput, string>> = {}
  ;(['first_name', 'last_name', 'title', 'organization', 'email'] as const).forEach((k) => { if (!v[k].trim()) errs[k] = t.required })
  if (v.email.trim() && !EMAIL_RE.test(v.email.trim())) errs.email = t.invalidEmail
  const set = (k: keyof AttendeeInput) => (e: ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value })
  const err = (k: keyof AttendeeInput) => (touched ? errs[k] : undefined)
  // Link each required field to its error / hint so screen readers read them with the field
  const a11y = (k: keyof typeof IDS, hint = false) => {
    const id = IDS[k]
    return { 'aria-required': true, 'aria-invalid': err(k) ? true : undefined, 'aria-describedby': err(k) ? `${id}-err` : hint ? `${id}-hint` : undefined }
  }
  const givenField = <Field key="fn" id="fn" label={t.firstName} error={err('first_name')}><input id="fn" className="input" value={v.first_name} onChange={set('first_name')} autoFocus={!familyFirst} autoComplete="off" {...a11y('first_name')} /></Field>
  const familyField = <Field key="ln" id="ln" label={t.lastName} error={err('last_name')}><input id="ln" className="input" value={v.last_name} onChange={set('last_name')} autoFocus={familyFirst} autoComplete="off" {...a11y('last_name')} /></Field>
  const trimmed = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim()])) as unknown as AttendeeInput
  return (
    <form noValidate className="space-y-4" onSubmit={(e) => {
      e.preventDefault(); setTouched(true)
      const order = (familyFirst ? ['last_name', 'first_name', 'title', 'organization', 'email'] : ['first_name', 'last_name', 'title', 'organization', 'email']) as (keyof typeof IDS)[]
      const firstBad = order.find((k) => errs[k])
      if (firstBad) document.getElementById(IDS[firstBad])?.focus() // jump to the first field that needs fixing
      else onSave(trimmed)
    }}>
      {/* Chinese and Korean names are written family name first, so the fields (and the Tab order) follow that */}
      <div className="grid gap-4 sm:grid-cols-2">
        {(familyFirst ? [familyField, givenField] : [givenField, familyField])}
      </div>
      <Field id="ti" label={t.title} hint={t.titleHint} error={err('title')}><input id="ti" className="input" value={v.title} onChange={set('title')} {...a11y('title', true)} /></Field>
      <Field id="or" label={t.organization} hint={t.titleHint} error={err('organization')}><input id="or" className="input" value={v.organization} onChange={set('organization')} {...a11y('organization', true)} /></Field>
      <Field id="em" label={t.email} error={err('email')}><input id="em" type="email" className="input" value={v.email} onChange={set('email')} {...a11y('email')} /></Field>
      <div className="grid gap-4">
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

// B9: after the guest-name deadline the page is read-only (AAFE time, end of the deadline day).
// Demo only (offline mode): add ?demoToday=YYYY-MM-DD before the # to preview, e.g. ?demoToday=2027-05-01
function isPastDeadline(deadline: string | null) {
  if (!deadline) return false
  const demo = LIVE ? null : new URLSearchParams(window.location.search).get('demoToday')
  const today = demo && /^\d{4}-\d{2}-\d{2}$/.test(demo) ? demo : new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  return today > deadline.slice(0, 10)
}

export default function Portal({ db, update, token, lang }: { db: DB; update: (fn: (d: DB) => DB) => void; token: string; lang: Lang }) {
  const t = DICT[lang]
  const loc = LOCALE[lang]
  const localView = useMemo(() => (LIVE ? null : getPortalView(db, token)), [db, token])
  // LIVE: undefined = loading, null = invalid link
  const [liveView, setLiveView] = useState<PortalView | null | undefined>(undefined)
  const [editing, setEditing] = useState<number | null>(null)
  const [removing, setRemoving] = useState<number | null>(null)
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
      <h1 className="type-display mt-4 text-navy-900">{t.notFound}</h1>
      <p className="mt-2 text-navy-600">{t.notFoundHelp}</p>
    </main>
  )

  const closed = isPastDeadline(view.deadline)
  const seat = !closed && editing != null ? view.seats.find((s) => s.slot === editing)! : null
  const removingSeat = !closed && removing != null ? view.seats.find((s) => s.slot === removing) : undefined
  const openSeats = view.stats.total - view.stats.named
  const firstOpen = view.seats.find((s) => !s.guest)
  const deadlineText = view.deadline ? fmtDate(view.deadline, loc) : undefined
  const statusText = { paid: t.stPaid, partial: t.stPartial, pledged: t.stPledged, comp: t.stComp }[view.money.status]
  const statusCls = { paid: 'bg-emerald-50 text-emerald-800', partial: 'bg-amber-50 text-amber-800', pledged: 'bg-amber-50 text-amber-800', comp: 'bg-brand-50 text-brand-600' }[view.money.status]
  const goToSeats = () => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    document.getElementById('seats')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })
    document.getElementById('seats-h')?.focus({ preventScroll: true })
  }

  return (
    <main>
      {/* 1. Short hero: who this is for, the package, and the gala date. The task starts right below it. */}
      <Hero compact lang={lang} eyebrow={t.eyebrow} title={`${t.welcome}, ${view.organization}`} body="">
        <p className="mt-3 text-navy-700"><strong className="font-semibold text-navy-900">{view.tierName}</strong> · {t.eventWhen}: {fmtDate(view.event.date, loc)}</p>
        <button type="button" className="btn-ghost mt-5" onClick={goToSeats}>{t.openList}</button>
      </Hero>

      <div className="mx-auto max-w-4xl space-y-6 px-5 py-8">
        {/* 2. Guests: status first, one primary action, then one row per seat */}
        <section id="seats" className="scroll-mt-32 sm:scroll-mt-20" aria-labelledby="seats-h">
          <h2 id="seats-h" tabIndex={-1} className="type-h2 text-navy-900">{t.seatsTitle}</h2>
          {!closed && <p className="mt-1 max-w-3xl text-navy-600">{t.seatsHelp}</p>}

          <div className="card mt-4 p-5" data-testid="seat-status">
            {closed && (
              <div role="status" className="mb-4 flex items-start gap-3 rounded-xl bg-cream-100 p-4" data-testid="list-closed">
                <Lock size={20} className="mt-0.5 shrink-0 text-navy-700" aria-hidden="true" />
                <div>
                  <p className="type-h6 text-navy-900">{t.closedTitle}</p>
                  <p className="mt-1 text-navy-600">{t.closedBody}</p>
                  <a className="mt-2 inline-block font-semibold text-brand-600 underline underline-offset-2" href="mailto:gala-team@aafe-demo.example.org">gala-team@aafe-demo.example.org</a>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="w-full max-w-md">
                <p className="type-h6 text-navy-900">{t.namedOf(view.stats.named, view.stats.total)}</p>
                <div className="mt-3 flex gap-1" role="progressbar" aria-label={t.seatsTitle} aria-valuemin={0} aria-valuemax={view.stats.total} aria-valuenow={view.stats.named} aria-valuetext={t.namedOf(view.stats.named, view.stats.total)}>
                  {view.seats.map((s) => <span key={s.slot} className={`h-2 flex-1 rounded-full ${s.guest ? 'bg-brand-500' : 'bg-navy-100'}`} />)}
                </div>
                {!closed && openSeats > 0 && <p className="mt-2 text-navy-700">{t.openDue(openSeats, deadlineText)}</p>}
              </div>
              {!closed && firstOpen && (
                <button type="button" className="btn-primary shrink-0" onClick={() => setEditing(firstOpen.slot)} data-testid="add-next">
                  <Plus size={18} aria-hidden /> {t.addToSeat(firstOpen.slot)}
                </button>
              )}
            </div>
          </div>

          <ul className="card mt-4 divide-y divide-navy-100 px-5">
            {view.seats.map((s) => {
              const g = s.guest
              const confirmed = s.status === 'reviewed' || s.status === 'badge_ready' || s.status === 'checked_in'
              // Screen readers hear which seat a button is for
              const seatName = `${t.seat} ${s.slot}${g ? `, ${g.first_name} ${g.last_name}` : ''}`
              return (
                <li key={s.slot} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between" data-testid={`seat-${s.slot}`}>
                  <div className="min-w-0">
                    <div className="type-nav text-navy-500">{t.seat} {s.slot}</div>
                    {g ? (
                      <>
                        <div className="type-h6 mt-1 text-navy-900">{g.first_name} {g.last_name}</div>
                        <div className="text-navy-600">{g.title}{g.organization && g.organization !== view.organization ? ` · ${g.organization}` : ''}</div>
                        {(g.dietary_needs || g.accessibility_needs) && (
                          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                            {g.dietary_needs && <span className="rounded bg-navy-50 px-2 py-0.5 text-navy-700">{t.dietaryShort}: {g.dietary_needs}</span>}
                            {g.accessibility_needs && <span className="rounded bg-navy-50 px-2 py-0.5 text-navy-700">{t.accessShort}: {g.accessibility_needs}</span>}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                          {confirmed
                            ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800"><CheckCircle2 size={14} aria-hidden /> {t.confirmed}</span>
                            : <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800"><Clock size={14} aria-hidden /> {t.received}</span>}
                          <span className="text-xs text-navy-500">{t.lastUpdated}: {fmtDate(g.updated_at, loc)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="mt-1 flex items-center gap-2 text-navy-600"><CircleDashed size={18} aria-hidden /> {t.open}</div>
                    )}
                  </div>
                  {!closed && (
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(s.slot)} aria-label={`${g ? t.update : t.add}: ${seatName}`} data-testid={`edit-seat-${s.slot}`}>
                        {g ? <><Pencil size={14} aria-hidden /> {t.update}</> : <><Plus size={14} aria-hidden /> {t.add}</>}
                      </button>
                      {g && s.status !== 'checked_in' && (
                        <button type="button" className="link-danger" aria-label={`${t.remove}: ${seatName}`} onClick={() => setRemoving(s.slot)} data-testid={`remove-seat-${s.slot}`}>
                          {t.remove}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-navy-700">
            <span className="inline-flex items-center gap-2"><CalendarDays size={16} className="text-navy-500" aria-hidden /> {fmtDate(view.event.date, loc)} · {view.event.doors}</span>
            <span className="inline-flex items-center gap-2"><MapPin size={16} className="text-navy-500" aria-hidden /> {view.event.venue}, {view.event.address}</span>
          </p>
        </section>

        {justSaved && (
          <div role="status" className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
            <CheckCircle2 size={20} aria-hidden /> <span className="font-medium">{t.saved}</span>
          </div>
        )}

        {/* 3. Help, right after the task */}
        <section className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="help-h">
          <div>
            <h2 id="help-h" className="type-h6 text-navy-900">{t.help}</h2>
            <p className="text-navy-600">gala-team@aafe-demo.example.org · (212) 555-0100</p>
          </div>
          <a className="btn-ghost shrink-0" href="mailto:gala-team@aafe-demo.example.org">{t.contact}</a>
        </section>

        {/* 4. Contribution: secondary, leads with status and balance, never a big "$0" */}
        <section className="card p-5" aria-labelledby="money-h">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="money-h" className="type-h6 text-navy-900">{t.contribution}</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusCls}`}>{statusText}</span>
          </div>
          <p className="mt-2 font-semibold tabular-nums text-navy-900" data-testid="balance">{t.balanceOf(money(view.money.balance), money(view.money.commitment))}</p>
          <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-navy-100 pt-4 sm:grid-cols-3">
            <div><dt className="text-navy-500">{t.amountPaid}</dt><dd className="font-semibold tabular-nums text-navy-900" data-testid="amount-paid">{money(view.money.paid, view.money.paid % 1 !== 0)}</dd></div>
            <div><dt className="text-navy-500">{t.commitment}</dt><dd className="font-semibold tabular-nums text-navy-900">{money(view.money.commitment)}</dd></div>
            <div className="col-span-2 sm:col-span-1"><dt className="text-navy-500">{t.paymentsTitle}</dt>
              <dd className="space-y-0.5">
                {view.money.payments.length ? view.money.payments.map((p) => <div key={p.date} className="text-navy-900"><span className="font-semibold">{money(p.amount, p.amount % 1 !== 0)}</span> · {t.paidOn} {fmtDate(p.date, loc)}</div>) : <span className="text-navy-600">{t.noPayments}</span>}
              </dd>
            </div>
          </dl>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-navy-500"><Lock size={12} aria-hidden /> {t.payNote}</p>
        </section>

        {/* 5. Activity: collapsed by default, the event first and the time on the right */}
        <details className="card p-5" data-testid="activity-panel">
          <summary className="type-h6 flex min-h-[44px] cursor-pointer items-center text-navy-900">{t.activityCount(view.activity.length)}</summary>
          <p className="text-sm text-navy-500">{t.activityHelp}</p>
          <ol className="mt-3 max-h-80 divide-y divide-navy-100 overflow-y-auto" tabIndex={0} aria-label={t.activityTitle} data-testid="activity">
            {view.activity.map((a, k) => (
              <li key={k} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <span className="text-navy-800">{activityText(lang, a)}</span>
                <time className="shrink-0 whitespace-nowrap text-xs text-navy-500" dateTime={a.at}>{fmtDate(a.at, loc, true)}</time>
              </li>
            ))}
          </ol>
        </details>
      </div>

      {/* Thank you */}
      <section className="bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 py-12 md:grid-cols-2">
          <img src="./photos/gala-guests-dinner.jpg" alt="Guests sharing a table at the AAFE gala" className="aspect-[4/3] w-full rounded-2xl object-cover" style={{ objectPosition: 'center 35%' }} loading="lazy" />
          <div>
            <h2 className="type-h2 text-navy-900">{t.thanksTitle}</h2>
            <p className="type-lead mt-3 text-navy-600">{t.thanksBody}</p>
          </div>
        </div>
      </section>
      <MissionStrip lang={lang} />
      <footer className="mx-auto max-w-6xl px-5 py-8 text-xs text-navy-500">{t.privacy}</footer>

      <Modal open={seat != null} onClose={() => setEditing(null)} title={seat ? (seat.guest ? t.editInSeat(seat.slot) : t.addToSeat(seat.slot)) : ''} closeLabel={t.close}>
        {seat && <AttendeeForm lang={lang} initial={seat.guest ? { ...EMPTY, ...seat.guest } : { ...EMPTY, organization: view.organization }} onCancel={() => setEditing(null)}
          onSave={(v) => save(seat.slot, v, () => { setEditing(null); setJustSaved(true); setToast(t.saved) })} />}
      </Modal>

      {/* Remove asks first, in the page's own dialog (not the browser's), and names the guest and the seat */}
      <Modal open={removingSeat != null} onClose={() => setRemoving(null)} title={removingSeat?.guest ? t.removeTitle(`${removingSeat.guest.first_name} ${removingSeat.guest.last_name}`, removingSeat.slot) : ''} closeLabel={t.close}>
        <p className="text-navy-700">{t.removeBody}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost" onClick={() => setRemoving(null)} data-testid="keep-guest">{t.keepGuest}</button>
          <button type="button" className="btn-danger-outline" onClick={() => { if (removingSeat) remove(removingSeat.slot, () => { setRemoving(null); setToast(t.saved) }) }} data-testid="confirm-remove">{t.removeGuest}</button>
        </div>
      </Modal>
      <Toast msg={toast} onDone={() => setToast(null)} />
    </main>
  )
}
