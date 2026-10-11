import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Field, Modal, Pill, fmtDate, money } from '@shared/ui'
import type { PipelineStage, Sector } from '@shared/types'
import { PageHead } from '../App'
import { SECTORS, STAGES, parseAmount, useStaff, type ProspectInput } from '../store'
import { canDo, type PipelineBoard, type PipelineProspect } from '../api'

// Sponsor pipeline (AAFE's prospect tracker; staff_pipeline() in backend.sql). Staff move the early stages; a pledge moves a
// sponsor to closed won and a payment to payment received by themselves. The smallest working version: Natalie's design
// replaces the layout, the data and the rules stay.
const TONE: Record<PipelineStage, 'gray' | 'blue' | 'amber' | 'green' | 'red'> = {
  not_started: 'gray', reached_out: 'blue', in_conversation: 'amber', closed_won: 'green', payment_received: 'green', lost: 'red',
}
const sectorLabel = (s: Sector | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ') : '—')

export default function Pipeline() {
  const { db, api, act } = useStaff()
  const [board, setBoard] = useState<PipelineBoard | null>(null)
  const [error, setError] = useState('')
  const [only, setOnly] = useState<PipelineStage | null>(null)
  const [editing, setEditing] = useState<PipelineProspect | 'new' | null>(null)

  // The board is read from the server (or the demo) again whenever the gala's data changes.
  useEffect(() => {
    let on = true
    api.pipeline().then((b) => { if (on) { setBoard(b); setError('') } }, (e: unknown) => { if (on) setError(e instanceof Error ? e.message : String(e)) })
    return () => { on = false }
  }, [api, db])

  if (!board) return <div><PageHead title="Sponsor pipeline" />{error && <p className="text-sm text-red-800">{error}</p>}</div>
  const t = board.totals
  const rows = board.prospects.filter((p) => !only || p.stage === only)
  const pct = board.goal ? Math.min(100, Math.round((t.committed / board.goal) * 100)) : 0

  return (
    <div>
      <PageHead title="Sponsor pipeline" sub="Every sponsor ask for this gala, by stage. A pledge moves a sponsor to closed won and a payment to payment received by themselves; staff move the early stages."
        actions={<button className="btn-primary" data-testid="pipeline-add" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden /> Add prospect</button>} />

      <section className="card p-5" data-testid="pipeline-summary">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Goal goal={board.goal} />
          <Stat label="Committed" value={t.committed} hint="Closed won and paid" />
          <Stat label="Received" value={t.received} />
          <Stat label="Weighted forecast" value={t.weighted} hint="Each ask × its stage's likelihood" />
          <Stat label="Open asks" value={t.open_ask} hint={`${t.prospects} prospects in all`} />
        </div>
        {board.goal ? (
          <div className="mt-4" aria-label={`${pct}% of the goal committed`}>
            <div className="h-2 overflow-hidden rounded-full bg-navy-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
            <p className="mt-1 text-xs text-navy-500">{pct}% of the goal committed</p>
          </div>
        ) : null}
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-6" data-testid="pipeline-stages" aria-label="Stages">
        {board.stages.map((s) => (
          <button key={s.stage} type="button" onClick={() => setOnly(only === s.stage ? null : s.stage)} aria-pressed={only === s.stage}
            className={`card flex flex-col items-start p-3 text-left ${only === s.stage ? 'ring-2 ring-brand-500' : ''}`}>
            <span className="text-xs font-semibold uppercase tracking-wide text-navy-500">{s.label}</span>
            <span className="mt-1 block text-xl font-semibold tabular-nums text-navy-900">{s.count}</span>
            <span className="block text-xs tabular-nums text-navy-500">{s.committed ? `${money(s.committed)} committed` : `${money(s.ask)} asked`} · {Math.round(s.probability * 100)}% likely</span>
          </button>
        ))}
      </section>

      <section className="card mt-6 overflow-x-auto" data-testid="pipeline-table">
        <table className="w-full min-w-[960px]">
          <thead className="border-b border-navy-100 bg-cream-100"><tr>
            <th className="th">Sponsor</th><th className="th">Sector</th><th className="th text-right">Ask</th><th className="th text-right">Committed</th>
            <th className="th text-right">Received</th><th className="th">Last two galas</th><th className="th">Stage</th><th className="th"></th>
          </tr></thead>
          <tbody className="divide-y divide-navy-100">
            {rows.map((p) => {
              const paid = p.stage === 'payment_received'
              return (
                <tr key={p.id} className="align-top hover:bg-navy-50">
                  <td className="td">
                    <span className="font-semibold text-navy-900">{p.organization}</span>
                    <span className="block text-xs text-navy-500">{p.contact}{p.relationship_manager ? ` · ${p.relationship_manager}` : ''}{p.follow_up ? ` · follow-up ${p.follow_up}` : ''}</span>
                    {p.notes && <span className="mt-1 block max-w-xs text-xs text-navy-600">{p.notes}</span>}
                  </td>
                  <td className="td text-navy-600">{sectorLabel(p.sector)}</td>
                  <td className="td text-right tabular-nums">{p.ask != null ? money(p.ask) : '—'}{p.ask_tier && <span className="block text-xs text-navy-500">{p.ask_tier}</span>}</td>
                  <td className="td text-right tabular-nums">{p.commitment != null ? money(p.commitment) : '—'}{p.tier && <span className="block text-xs text-navy-500">{p.tier}</span>}</td>
                  <td className="td text-right tabular-nums">{money(p.received)}{p.balance > 0 && <span className="block text-xs text-navy-500">{money(p.balance)} due</span>}</td>
                  <td className="td text-xs tabular-nums text-navy-600">{p.prior_years.length ? p.prior_years.map((y) => <span key={y.year} className="block whitespace-nowrap">{y.year}: {y.given ? money(y.given) : '—'}</span>) : '—'}</td>
                  <td className="td">
                    <label className="sr-only" htmlFor={`st-${p.id}`}>Stage for {p.organization}</label>
                    <select id={`st-${p.id}`} className="input w-auto py-1 text-sm" value={p.stage} disabled={paid}
                      title={paid ? 'Paid: the stage stays payment received' : undefined}
                      onChange={(e) => void act(api.setProspectStage(p.id, e.target.value as PipelineStage), `${p.organization}: ${STAGES.find((s) => s.stage === e.target.value)!.label}`)}>
                      {STAGES.map((s) => <option key={s.stage} value={s.stage} disabled={s.stage === 'payment_received' && !paid}>{s.label}</option>)}
                    </select>
                    <span className="mt-1 block text-xs text-navy-500"><Pill tone={TONE[p.stage]}>{Math.round(p.probability * 100)}%</Pill> since {fmtDate(p.stage_changed_at)}</span>
                  </td>
                  <td className="td"><button className="btn-ghost btn-sm" onClick={() => setEditing(p)}>Edit</button></td>
                </tr>
              )
            })}
            {!rows.length && <tr><td className="td text-sm text-navy-500" colSpan={8}>No prospects{only ? ' at this stage' : ''}.</td></tr>}
          </tbody>
        </table>
      </section>

      <ProspectForm key={editing === 'new' ? 'new' : editing?.id ?? 'none'} editing={editing} board={board} onClose={() => setEditing(null)} />
    </div>
  )

}

function Goal({ goal }: { goal: number | null }) {
  const { api, user, act } = useStaff()
  const admin = canDo(user.role, 'setSponsorshipGoal')
  const [draft, setDraft] = useState<string | null>(null)
  if (draft === null) return (
    <div data-testid="pipeline-goal">
      <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">Goal</p>
      <p className="text-xl font-semibold tabular-nums text-navy-900">{goal != null ? money(goal) : 'Not set'}</p>
      {admin && <button className="btn-ghost btn-sm mt-1" onClick={() => setDraft(goal != null ? String(goal) : '')}>{goal != null ? 'Change' : 'Set the goal'}</button>}
    </div>
  )
  return (
    <form data-testid="pipeline-goal" onSubmit={(e) => { e.preventDefault(); void act(Promise.resolve().then(() => api.setSponsorshipGoal(parseAmount(draft))), 'Goal saved').then((ok) => { if (ok) setDraft(null) }) }}>
      <label htmlFor="goal" className="text-xs font-semibold uppercase tracking-wide text-navy-500">Goal ($)</label>
      <input id="goal" className="input mt-1" inputMode="numeric" value={draft} onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ''))} />
      <div className="mt-1 flex gap-1"><button className="btn-primary btn-sm">Save</button><button type="button" className="btn-ghost btn-sm" onClick={() => setDraft(null)}>Cancel</button></div>
    </form>
  )
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">{label}</p>
      <p className="text-xl font-semibold tabular-nums text-navy-900">{money(value)}</p>
      {hint && <p className="text-xs text-navy-500">{hint}</p>}
    </div>
  )
}

/** Add a prospect (a sponsor already on file, or a new organization) or edit one's ask, sector, follow-up and notes. */
function ProspectForm({ editing, board, onClose }: { editing: PipelineProspect | 'new' | null; board: PipelineBoard; onClose: () => void }) {
  const { db, api, act } = useStaff()
  const isNew = editing === 'new'
  const old = editing && editing !== 'new' ? editing : null
  // ponytail: the board gives the tier and follow-up by name; staff and package names are unique, so map them back to ids.
  const [f, setF] = useState({
    sponsor_id: '', organization: '', contact_name: '', contact_email: '',
    sector: (old?.sector ?? '') as Sector | '', ask: old?.ask != null ? String(old.ask) : '',
    ask_tier_id: db.sponsorship_tiers.find((x) => x.name === old?.ask_tier)?.id ?? '',
    follow_up_owner_id: db.staff_users.find((u) => u.name === old?.follow_up)?.id ?? '', notes: old?.notes ?? '',
  })
  const inPipeline = new Set(board.prospects.map((p) => p.sponsor_id))
  const sponsors = db.sponsors.filter((s) => !inPipeline.has(s.id)).sort((a, b) => a.organization_name.localeCompare(b.organization_name))
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const ready = !isNew || f.sponsor_id || (f.organization.trim() && f.contact_name.trim())
  const save = () => {
    const fields = { sector: (f.sector || null) as Sector | null, ask_amount: parseAmount(f.ask), ask_tier_id: f.ask_tier_id || null, follow_up_owner_id: f.follow_up_owner_id || null, notes: f.notes }
    const p: ProspectInput = old ? { id: old.id, ...fields }
      : f.sponsor_id ? { sponsor_id: f.sponsor_id, ...fields } : { organization: f.organization, contact_name: f.contact_name, contact_email: f.contact_email, ...fields }
    return api.saveProspect(p)
  }
  return (
    <Modal open={!!editing} onClose={onClose} title={old ? `Edit ${old.organization}` : 'Add a prospect'}>
      <form className="space-y-3" data-testid="prospect-form" onSubmit={(e) => { e.preventDefault(); if (ready) void act(Promise.resolve().then(save), old ? 'Prospect saved' : 'Prospect added').then((ok) => { if (ok) onClose() }) }}>
        {isNew && (
          <>
            <Field id="pf-sp" label="Sponsor already on file" hint="Or leave this empty and add a new organization below.">
              <select id="pf-sp" className="input" value={f.sponsor_id} onChange={set('sponsor_id')}>
                <option value="">— New organization —</option>
                {sponsors.map((s) => <option key={s.id} value={s.id}>{s.organization_name}</option>)}
              </select>
            </Field>
            {!f.sponsor_id && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id="pf-org" label="Organization"><input id="pf-org" className="input" value={f.organization} onChange={set('organization')} /></Field>
                <Field id="pf-contact" label="Contact name"><input id="pf-contact" className="input" value={f.contact_name} onChange={set('contact_name')} /></Field>
                <div className="sm:col-span-2"><Field id="pf-email" label="Contact email (optional)"><input id="pf-email" type="email" className="input" value={f.contact_email} onChange={set('contact_email')} /></Field></div>
              </div>
            )}
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="pf-sector" label="Sector"><select id="pf-sector" className="input" value={f.sector} onChange={set('sector')}><option value="">—</option>{SECTORS.map((s) => <option key={s} value={s}>{sectorLabel(s)}</option>)}</select></Field>
          <Field id="pf-ask" label="Ask ($)"><input id="pf-ask" className="input" inputMode="numeric" value={f.ask} onChange={(e) => setF({ ...f, ask: e.target.value.replace(/[^0-9.]/g, '') })} /></Field>
          <Field id="pf-tier" label="Package asked for"><select id="pf-tier" className="input" value={f.ask_tier_id} onChange={set('ask_tier_id')}><option value="">—</option>{db.sponsorship_tiers.filter((x) => x.tier_category === 'sponsorship').map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <Field id="pf-fu" label="Follow-up (AAFE)"><select id="pf-fu" className="input" value={f.follow_up_owner_id} onChange={set('follow_up_owner_id')}><option value="">—</option>{db.staff_users.filter((u) => u.role !== 'check_in_volunteer').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        </div>
        <Field id="pf-notes" label="Notes (staff only)"><textarea id="pf-notes" className="input" rows={2} value={f.notes} onChange={set('notes')} /></Field>
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={!ready}>{old ? 'Save' : 'Add prospect'}</button></div>
      </form>
    </Modal>
  )
}
