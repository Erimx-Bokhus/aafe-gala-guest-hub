import { useEffect, useRef, useState } from 'react'
import { levelsOf } from '@shared/data'
import { FileUp, Sparkles } from 'lucide-react'
import { Pill, fmtDate } from '@shared/ui'
import type { DB, ImportReview } from '@shared/types'
import { PageHead } from '../App'
import { useStaff } from '../store'
import { canDo } from '../api'
import { GalaPageNotSetError, REVIEW, prepareImport, sampleExport, type ImportResult } from '../importer'

// Give Lively import (docs/import-matching-spec.md). The import engine reads the export in the browser and shows what it found;
// nothing is saved until a gala admin chooses Import, and staff_import_givelively() writes all of it or nothing. Re-uploading
// the same file never adds a purchase twice. Close calls wait in the review queue below for a person to decide.
type Prepared = Awaited<ReturnType<typeof prepareImport>>
type Pages = { pageName: string | null; rows: number }[]

export default function Import() {
  const { db, api, user, act } = useStaff()
  const admin = canDo(user.role, 'importGiveLively')
  const ev = db.gala_events.find((e) => e.id === db.meta.current_event_id)!
  const [file, setFile] = useState<{ csv: string; name: string } | null>(null)
  const [prep, setPrep] = useState<Prepared | null>(null)
  const [pages, setPages] = useState<Pages | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const input = useRef<HTMLInputElement>(null)

  // Read the file again whenever the gala's data changes (a page chosen, a tier linked), so the preview stays true.
  useEffect(() => {
    if (!file) return
    let on = true
    setError('')
    prepareImport(file.csv, file.name, db).then(
      (p) => { if (on) { setPrep(p); setPages(null) } },
      (e: unknown) => {
        if (!on) return
        setPrep(null)
        if (e instanceof GalaPageNotSetError) setPages(e.pages)
        else { setPages(null); setError(e instanceof Error ? e.message : String(e)) }
      })
    return () => { on = false }
  }, [file, db])

  const choose = async (f: File) => { setResult(null); setFile({ csv: await f.text(), name: f.name }) }
  const doImport = () => {
    if (!prep) return
    void act(api.importGiveLively(prep.rows, prep.run).then((r) => { setResult(r); setFile(null); setPrep(null) }))
  }

  const reviews = (db.import_review ?? []).filter((v) => v.event_id === ev.id)
  const open = reviews.filter((v) => v.status === 'open').sort((a, b) => a.created_at.localeCompare(b.created_at))
  const runs = (db.import_runs ?? []).filter((r) => r.event_id === ev.id).sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 5)

  return (
    <div>
      <PageHead title="Give Lively import" sub="Upload the attendee export from Give Lively. Nothing is saved until you choose Import, and uploading the same file again never adds a purchase twice." />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {admin && (
            <section className="card p-5" data-testid="import-upload">
              <h2 className="font-semibold text-navy-900">Upload an export</h2>
              <p className="mt-1 text-sm text-navy-600">This gala's Give Lively page: {ev.givelively_page_name ? <b>{ev.givelively_page_name}</b> : <span>not chosen yet; you'll pick it from the first upload.</span>}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <input ref={input} type="file" accept=".csv,text/csv" className="hidden" data-testid="import-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void choose(f); e.target.value = '' }} />
                <button className="btn-primary" onClick={() => input.current?.click()}><FileUp size={15} /> Choose the CSV file</button>
                {!api.live && <button className="btn-ghost" data-testid="import-sample" onClick={() => { const s = sampleExport(db); setResult(null); setFile({ csv: s.csv, name: s.fileName }) }}><Sparkles size={15} /> Try a sample export (invented)</button>}
              </div>
              {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">This file can't be imported: {error}.</p>}
              {pages && <PagePicker pages={pages} onPick={(p) => void act(api.setGalaPage(p), `Give Lively page set to "${p}"`)} />}
              {prep && <Preview prep={prep} db={db} onMap={(name, tierId) => void act(api.setTierMapping(name, tierId), `"${name}" linked`)} onImport={doImport} />}
              {result && <ResultNote r={result} />}
            </section>
          )}
          <ReviewQueue open={open} db={db} admin={admin} onResolve={(v, choice) => void act(api.resolveImportReview(v.id, choice), 'Decision recorded')}
            onMap={(name, tierId) => void act(api.setTierMapping(name, tierId), `"${name}" linked; upload the file again to import those purchases`)} />
        </div>
        <section className="card p-5">
          <h2 className="font-semibold text-navy-900">Recent uploads</h2>
          {!runs.length ? <p className="mt-2 text-sm text-navy-500">No uploads yet for this gala.</p> : (
            <ul className="mt-3 divide-y divide-navy-100 text-sm" data-testid="import-runs">
              {runs.map((r) => (
                <li key={r.id} className="py-2">
                  <div className="flex justify-between gap-2"><span className="font-medium text-navy-900">{r.file_name ?? 'Give Lively sync'}</span><Pill tone={r.status === 'succeeded' ? 'green' : 'gray'}>{r.status}</Pill></div>
                  <div className="text-xs text-navy-500">{fmtDate(r.started_at, 'en-US', true)} · {r.started_by}{r.counts ? ` · ${r.counts.created ?? 0} new, ${r.counts.skipped ?? 0} unchanged, ${r.counts.review_items ?? 0} for review` : ''}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function PagePicker({ pages, onPick }: { pages: Pages; onPick: (p: string) => void }) {
  const named = pages.filter((p) => p.pageName)
  const [pick, setPick] = useState(named[0]?.pageName ?? '')
  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4" data-testid="import-pages">
      <h3 className="text-sm font-semibold text-amber-900">Choose this gala's Give Lively page</h3>
      <p className="mt-1 text-sm text-amber-900">Only purchases from this page are imported, now and in every later upload. You choose it once a year.</p>
      <fieldset className="mt-3 space-y-1">
        <legend className="sr-only">Pages in this file</legend>
        {named.map((p) => (
          <label key={p.pageName} className="flex items-center gap-2 text-sm"><input type="radio" name="gl-page" checked={pick === p.pageName} onChange={() => setPick(p.pageName!)} /> {p.pageName} <span className="text-navy-500">({p.rows} row{p.rows === 1 ? '' : 's'})</span></label>
        ))}
      </fieldset>
      <button className="btn-primary mt-3" disabled={!pick} onClick={() => onPick(pick)}>Use this page</button>
    </div>
  )
}

function TierLink({ name, db, onMap }: { name: string; db: DB; onMap: (name: string, tierId: string) => void }) {
  const [tier, setTier] = useState('')
  const tiers = levelsOf(db).filter((t) => t.tier_category !== 'complimentary')
  return (
    <span className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`tier-${name}`}>Package for {name}</label>
      <select id={`tier-${name}`} className="input w-auto py-1 text-sm" value={tier} onChange={(e) => setTier(e.target.value)}>
        <option value="">Choose a package…</option>
        {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <button className="btn-ghost btn-sm" disabled={!tier} onClick={() => onMap(name, tier)}>Link</button>
    </span>
  )
}

function Preview({ prep, db, onMap, onImport }: { prep: Prepared; db: DB; onMap: (name: string, tierId: string) => void; onImport: () => void }) {
  const r = prep.prepared.report
  const close = r.reviewItems.filter((i) => i.reason !== 'unknown_tier').length
  const stats: [string, number][] = [['Rows read', r.rowsRead], ['Ready to import', prep.prepared.rows.length], ['Names to pre-fill', r.namesPrefilled],
    ['Lists left for the sponsor', r.listsForSponsor], ['Close calls for staff', close], ['Other pages, skipped', r.skippedOtherPage.length], ['Rejected', r.rejected.length]]
  return (
    <div className="mt-4 space-y-4" data-testid="import-preview">
      <h3 className="text-sm font-semibold text-navy-900">What this file holds{r.dateRange ? ` (purchases ${fmtDate(r.dateRange.earliest)} to ${fmtDate(r.dateRange.latest)})` : ''}</h3>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(([k, v]) => <div key={k} className="rounded-lg bg-cream-100 p-3"><dt className="text-xs text-navy-500">{k}</dt><dd className="text-xl font-semibold tabular-nums text-navy-900">{v}</dd></div>)}
      </dl>
      {r.unknownTiers.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4" data-testid="import-tiers">
          <h4 className="text-sm font-semibold text-amber-900">Link these Give Lively ticket types to a package</h4>
          <p className="mt-1 text-sm text-amber-900">Done once per gala. Purchases of an unlinked type wait for review and aren't imported until it's linked.</p>
          <ul className="mt-2 space-y-2">
            {r.unknownTiers.map((t) => <li key={t.givelivelyName} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span><b>"{t.givelivelyName}"</b> <span className="text-navy-500">rows {t.rowNumbers.join(', ')}</span></span><TierLink name={t.givelivelyName} db={db} onMap={onMap} /></li>)}
          </ul>
        </div>
      )}
      {r.rejected.length > 0 && (
        <details className="text-sm"><summary className="cursor-pointer font-medium text-navy-800">{r.rejected.length} row{r.rejected.length === 1 ? '' : 's'} can't be read</summary>
          <ul className="mt-2 list-disc pl-5 text-navy-600">{r.rejected.map((x) => <li key={x.rowNumber}>Row {x.rowNumber}: {x.reason}</li>)}</ul></details>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" data-testid="import-run" disabled={!prep.rows.length} onClick={onImport}>Import {prep.prepared.rows.length} purchase{prep.prepared.rows.length === 1 ? '' : 's'}</button>
        <span className="text-xs text-navy-500">All or nothing: if anything fails, nothing is saved. Guest-list links are drafted for staff approval, never sent.</span>
      </div>
    </div>
  )
}

function ResultNote({ r }: { r: ImportResult }) {
  return (
    <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900" role="status" data-testid="import-result">
      Imported: <b>{r.created}</b> new, {r.skipped} already imported, {r.names_prefilled} guest names pre-filled, {r.review_items} for review{r.unknown_tier ? ` (${r.unknown_tier} waiting on a ticket type)` : ''}{r.zero_amount ? `, ${r.zero_amount} at $0 for staff to check` : ''}.
    </p>
  )
}

function describe(v: ImportReview, db: DB): string {
  const d = v.details as Record<string, string | number | null>
  const sponsor = (() => { const o = db.orders.find((x) => x.id === v.order_id); return o ? db.sponsors.find((s) => s.id === o.sponsor_id)?.organization_name : null })()
  const guest = (id: unknown) => { const g = db.guests.find((x) => x.id === id); return g ? `${g.first_name} ${g.last_name}` : 'a guest already on the list' }
  switch (v.reason) {
    case 'unknown_tier': return `Ticket type "${d.tier_purchased}" isn't linked to a package yet.`
    case 'possible_duplicate': return `${d.guest} on ${sponsor ?? 'this purchase'} may be ${guest(d.existing_guest_id)}.`
    case 'double_booked': return `${d.guest} on ${sponsor ?? 'this purchase'} is also ${guest(d.existing_guest_id)} on another sponsor's list.`
    case 'email_name_conflict': return `${d.buyer} bought with ${d.email}, which another sponsor's contact also uses.`
    case 'refund': return `${sponsor ?? 'This purchase'} was refunded in Give Lively (${d.status ?? 'refunded'}); its seats are cancelled.`
    case 'missing_from_source': return `${sponsor ?? 'A purchase'} from ${d.purchased_at ? fmtDate(String(d.purchased_at)) : 'earlier'} isn't in this export.`
    case 'guest_text_changed': return `${sponsor ?? 'A sponsor'}'s guest list changed in Give Lively after names were entered.`
    case 'zero_amount': return `${d.buyer ?? d.email} got ${d.tickets ?? 'a'} "${d.tier_purchased}" ticket${Number(d.tickets) > 1 ? 's' : ''} for $0 in Give Lively${d.guest_text ? ` (guests: ${d.guest_text})` : ''}. Nothing was imported: if it's a comp, add the guests on Relationship guests.`
  }
}

function ReviewQueue({ open, db, admin, onResolve, onMap }: { open: ImportReview[]; db: DB; admin: boolean; onResolve: (v: ImportReview, choice: string) => void; onMap: (name: string, tierId: string) => void }) {
  return (
    <section className="card p-5" data-testid="import-review">
      <h2 className="font-semibold text-navy-900">Waiting for a person ({open.length})</h2>
      <p className="mt-1 text-sm text-navy-600">Close calls the import won't decide on its own. Recording a decision closes the item; changes to seats or guests are made on the sponsor's page.</p>
      {!open.length ? <p className="mt-3 text-sm text-navy-500">Nothing waiting.</p> : (
        <ul className="mt-3 divide-y divide-navy-100">
          {open.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span><Pill tone="gray">{REVIEW[v.reason].label}</Pill> <span className="text-navy-800">{describe(v, db)}</span></span>
              <span className="flex flex-wrap gap-2">
                {REVIEW[v.reason].choices?.map((c) => <button key={c} className="btn-ghost btn-sm" onClick={() => onResolve(v, c)}>{c}</button>)}
                {v.reason === 'unknown_tier' && (admin ? <TierLink name={String(v.details.tier_purchased ?? '')} db={db} onMap={onMap} /> : <span className="text-xs text-navy-500">A gala admin links it</span>)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

