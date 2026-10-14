// Sponsorship levels, one list per gala (decided Oct 14). Levels change every year, so each gala has its own: gala
// admins set next year's while this year's gala is still running, starting from last year's list, and a past gala's
// levels stay as they were. The database rules are staff_save_level, staff_copy_levels and staff_retire_level.
import { useState } from 'react'
import { Copy, Pencil, Plus } from 'lucide-react'
import { levelsOf } from '@shared/data'
import { Field, Modal, Pill, money } from '@shared/ui'
import type { DB, Tier } from '@shared/types'
import { PageHead } from '../App'
import { canDo, type LevelInput } from '../api'
import { useStaff } from '../store'

const KIND: Record<Tier['tier_category'], string> = { sponsorship: 'Sponsorship', ticket: 'Ticket', advertising_only: 'Advertising only', complimentary: 'Complimentary' }
const MATERIALS: [string, string][] = [['logo', 'Logo'], ['full_page_ad', 'Full-page ad'], ['half_page_ad', 'Half-page ad']]

/** The most recent gala before this one that has levels: what "start from last year's" copies. */
function previousWithLevels(db: DB, eventId: string) {
  const ev = db.gala_events.find((e) => e.id === eventId)
  return db.gala_events.filter((e) => ev && e.year < ev.year && levelsOf(db, e.id).some((t) => t.tier_category !== 'complimentary'))
    .sort((a, b) => b.year - a.year)[0] ?? null
}

export default function Levels() {
  const { db, api, user, act } = useStaff()
  const admin = canDo(user.role, 'saveLevel')
  const galas = [...db.gala_events].sort((a, b) => b.year - a.year)
  const [eventId, setEventId] = useState(db.meta.current_event_id)
  const [editing, setEditing] = useState<Tier | 'new' | null>(null)
  const ev = db.gala_events.find((e) => e.id === eventId)!
  const open = ev.status !== 'closed'
  const levels = levelsOf(db, eventId, true).filter((t) => t.tier_category !== 'complimentary')
  const prev = previousWithLevels(db, eventId)
  return (
    <div>
      <PageHead title="Sponsorship levels" sub="Each gala has its own levels, because they change every year. Set up next year's while this year's gala is still running; a past gala keeps the levels it was sold with."
        actions={admin && open && <button className="btn-primary" onClick={() => setEditing('new')} data-testid="level-add"><Plus size={16} /> Add a level</button>} />

      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Gala">
        {galas.map((g) => (
          <button key={g.id} type="button" aria-pressed={g.id === eventId} onClick={() => setEventId(g.id)} data-testid={`level-gala-${g.year}`}
            className={`min-h-[44px] rounded-full border-2 px-5 text-sm font-semibold ${g.id === eventId ? 'border-brand-500 bg-brand-500 text-white' : 'border-navy-500 bg-surface text-navy-800 hover:bg-navy-50'}`}>
            {g.year}{g.id === db.meta.current_event_id ? ' · current' : g.status === 'closed' ? ' · past' : ' · planning'}
          </button>
        ))}
      </div>

      {!levels.length ? (
        <section className="card p-6" data-testid="levels-empty">
          <h2 className="text-lg font-semibold text-navy-900">{ev.name} has no levels yet</h2>
          <p className="mt-1 text-navy-600">{prev ? `Start from ${prev.year}'s levels and change what's different this year, or add each level yourself.` : 'Add each level: its name, amount and how many guests it includes.'}</p>
          {admin && open && (
            <div className="mt-4 flex flex-wrap gap-3">
              {prev && <button className="btn-primary" data-testid="levels-copy" onClick={() => void act(api.copyLevels(prev.id, eventId), `Started from ${prev.year}'s levels`)}><Copy size={16} /> Start from {prev.year}'s levels</button>}
              <button className="btn-ghost" onClick={() => setEditing('new')}><Plus size={16} /> Add a level</button>
            </div>
          )}
        </section>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm" data-testid="levels-table">
            <thead><tr>
              <th className="th">Level</th><th className="th">Kind</th><th className="th text-right">Amount</th><th className="th text-right">Guests included</th>
              <th className="th">Table</th><th className="th">Materials</th><th className="th">Status</th>{admin && open && <th className="th"><span className="sr-only">Actions</span></th>}
            </tr></thead>
            <tbody>
              {levels.map((t) => (
                <tr key={t.id} className={t.retired ? 'opacity-60' : ''} data-testid={`level-${t.id}`}>
                  <td className="td font-semibold text-navy-900">{t.name}</td>
                  <td className="td">{KIND[t.tier_category]}</td>
                  <td className="td text-right tabular-nums">{money(t.contribution_amount)}</td>
                  <td className="td text-right tabular-nums">{t.included_seat_count}</td>
                  <td className="td">{t.tier_category === 'sponsorship' ? (t.guaranteed_seating ? 'Guaranteed table' : 'Admittance only') : '—'}</td>
                  <td className="td">{t.required_materials.length ? t.required_materials.map((m) => MATERIALS.find(([k]) => k === m)?.[1] ?? m).join(', ') : '—'}</td>
                  <td className="td">{t.retired ? <Pill tone="gray">Not offered</Pill> : <Pill tone="green">Offered</Pill>}</td>
                  {admin && open && (
                    <td className="td whitespace-nowrap text-right">
                      <button className="btn-ghost btn-sm" onClick={() => setEditing(t)} data-testid={`level-edit-${t.id}`}><Pencil size={13} /> Edit</button>{' '}
                      <button className="btn-ghost btn-sm" onClick={() => void act(api.retireLevel(t.id, !t.retired), t.retired ? `${t.name} offered again` : `${t.name} no longer offered`)}>
                        {t.retired ? 'Offer again' : 'Stop offering'}</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!open && <p className="border-t border-navy-100 p-4 text-sm text-navy-600">{ev.name} is closed, so its levels are kept as they were.</p>}
        </div>
      )}
      <p className="mt-4 text-sm text-navy-600">
        Give Lively: build the gala's Give Lively page with the same level names. On the first upload, match each Give Lively level once on <strong>Give Lively import</strong>.
        Editing a level changes new pledges and purchases only; sponsors who already bought keep their amount and guests.
      </p>

      {editing && <LevelForm key={editing === 'new' ? 'new' : editing.id} eventId={eventId} level={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function LevelForm({ eventId, level, onClose }: { eventId: string; level: Tier | null; onClose: () => void }) {
  const { api, act } = useStaff()
  const [f, setF] = useState({
    name: level?.name ?? '', kind: level?.tier_category ?? 'sponsorship' as Tier['tier_category'],
    amount: level ? String(level.contribution_amount) : '', guests: level ? String(level.included_seat_count) : '',
    table: level?.guaranteed_seating ?? true, materials: level?.required_materials ?? ['logo'],
  })
  const amount = Number(f.amount), count = Number(f.guests)
  const ok = f.name.trim() && f.amount !== '' && amount >= 0 && f.guests !== '' && Number.isInteger(count) && count >= 0 && count <= 500
  const save = () => {
    const lv: LevelInput = { id: level?.id, name: f.name.trim(), contribution_amount: amount, included_seat_count: count, tier_category: f.kind,
      guaranteed_seating: f.kind === 'sponsorship' && f.table, required_materials: f.materials }
    void act(api.saveLevel(eventId, lv), level ? 'Level saved' : 'Level added').then((done) => { if (done) onClose() })
  }
  return (
    <Modal open onClose={onClose} title={level ? `Edit ${level.name}` : 'Add a level'}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ok) save() }}>
        <Field id="lv-name" label="Name"><input id="lv-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Gold — Documentary Screening Sponsor" /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="lv-kind" label="Kind"><select id="lv-kind" className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Tier['tier_category'] })}>
            <option value="sponsorship">Sponsorship</option><option value="ticket">Ticket</option><option value="advertising_only">Advertising only</option>
          </select></Field>
          <Field id="lv-amount" label="Amount ($)"><input id="lv-amount" className="input tabular-nums" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^0-9.]/g, '') })} /></Field>
          <Field id="lv-guests" label="Guests included"><input id="lv-guests" className="input tabular-nums" inputMode="numeric" value={f.guests} onChange={(e) => setF({ ...f, guests: e.target.value.replace(/[^0-9]/g, '') })} /></Field>
        </div>
        {f.kind === 'sponsorship' && (
          <fieldset><legend className="mb-1 text-sm font-medium text-navy-800">Table</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex min-h-[44px] items-center gap-2"><input type="radio" name="lv-table" checked={f.table} onChange={() => setF({ ...f, table: true })} /> Guaranteed table</label>
              <label className="flex min-h-[44px] items-center gap-2"><input type="radio" name="lv-table" checked={!f.table} onChange={() => setF({ ...f, table: false })} /> Admittance only</label>
            </div>
          </fieldset>
        )}
        <fieldset><legend className="mb-1 text-sm font-medium text-navy-800">Materials the sponsor sends</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            {MATERIALS.map(([k, label]) => (
              <label key={k} className="flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={f.materials.includes(k)}
                onChange={(e) => setF({ ...f, materials: e.target.checked ? [...f.materials, k] : f.materials.filter((m) => m !== k) })} /> {label}</label>
            ))}
          </div>
        </fieldset>
        {level && <p className="text-sm text-navy-600">Sponsors who already bought this level keep the amount and guests they bought.</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!ok} data-testid="level-save">{level ? 'Save' : 'Add level'}</button></div>
      </form>
    </Modal>
  )
}
