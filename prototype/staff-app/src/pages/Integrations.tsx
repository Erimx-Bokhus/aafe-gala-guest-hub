import { useEffect, useRef, useState } from 'react'
import { BellRing, CloudDownload, Download, RefreshCw, Upload } from 'lucide-react'
import { Pill, ago, downloadCsv, fmtDate } from '@shared/ui'
import { PageHead } from '../App'
import { SAMPLE_HEAD, importGiveLively, sampleRows, useStaff, type GLRow } from '../store'
import { canDo, type PullCounts, type QueuedEmail } from '../api'
import { salesforceCsv } from '../exports'

// Column names follow Give Lively's "Line Items (All)" report. Confirm against a real AAFE export before launch.
const COLS: Record<keyof GLRow, string[]> = {
  txn: ['transaction id', 'donation id', 'id'], date: ['donation date', 'date', 'created at'], first: ['first name', 'donor first name'], last: ['last name', 'donor last name'],
  email: ['email', 'donor email'], company: ['company name', 'company', 'organization'], campaign: ['campaign name', 'campaign'], ticketLevel: ['ticket level', 'ticket name', 'item name'],
  method: ['payment method'], original: ['original amount'], covered: ['covered transaction fee amount'], gross: ['gross amount', 'amount'], fee: ['transaction fee amount'], net: ['net amount'],
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
    else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = '' } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = '' } else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim()))
}
function toRows(text: string): GLRow[] {
  const all = parseCsv(text)
  const hi = all.findIndex((r) => r.some((h) => h.toLowerCase().trim() === 'gross amount' || h.toLowerCase().trim() === 'transaction id'))
  if (hi < 0) throw new Error('Could not find Give Lively headers (e.g. “Gross Amount”).')
  const head = all[hi].map((h) => h.toLowerCase().trim())
  const idx = Object.fromEntries(Object.entries(COLS).map(([k, c]) => [k, head.findIndex((h) => c.includes(h))])) as Record<keyof GLRow, number>
  const num = (s: string | undefined) => Number(String(s ?? '').replace(/[$,]/g, '')) || 0
  return all.slice(hi + 1).map((r) => {
    const g = (k: keyof GLRow) => (idx[k] >= 0 ? r[idx[k]] ?? '' : '')
    const gross = num(g('gross')), original = num(g('original')) || gross, covered = num(g('covered')), fee = num(g('fee'))
    return { txn: g('txn') || `GL-${Math.random().toString(36).slice(2, 10)}`, date: g('date') || new Date().toISOString(), first: g('first'), last: g('last'), email: g('email'), company: g('company'), campaign: g('campaign'), ticketLevel: g('ticketLevel'), method: g('method'), original, covered, gross, fee, net: num(g('net')) || gross - fee }
  }).filter((r) => r.gross > 0 && r.email)
}
/** "Give Lively: 2 new, 1 updated, 1 to review, 3 still settling" */
function pullSummary(c: PullCounts): string {
  const parts = [`${c.created} new`, c.updated && `${c.updated} updated`, c.failed && `${c.failed} failed`, c.needs_review && `${c.needs_review} to review`,
    c.not_settled && `${c.not_settled} still settling`, c.unmapped && `${c.unmapped} unreadable`].filter(Boolean)
  return `Give Lively: ${parts.join(', ')}`
}

export default function Integrations() {
  const { db, api, user, toast, act, demo } = useStaff()
  const file = useRef<HTMLInputElement>(null)
  const [lastPull, setLastPull] = useState<string | null>(null)
  // One run at a time: a double click on Pull now or Sync now would run the sync twice (harmless, but pointless).
  const [running, setRunning] = useState<'pull' | 'sync' | null>(null)
  const once = (which: 'pull' | 'sync', run: () => Promise<unknown>) => { if (running) return; setRunning(which); void act(run().finally(() => setRunning(null))) }
  const [preview, setPreview] = useState<GLRow[] | null>(null)
  const [err, setErr] = useState('')
  const pending = db.salesforce_sync.filter((s) => s.status === 'pending').length
  const synced = db.salesforce_sync.filter((s) => s.status === 'synced').length
  const lastSync = db.salesforce_sync.map((s) => s.last_synced_at).filter(Boolean).sort().at(-1)
  // Unsent emails from staff_email_queue(): drafts to approve, approved ones waiting for the sender, and failed ones.
  const [queue, setQueue] = useState<QueuedEmail[]>([])
  const [queueFailed, setQueueFailed] = useState(false)
  const managers = canDo(user.role, 'emailQueue')
  useEffect(() => {
    if (!managers) return
    let on = true
    api.emailQueue().then((q) => { if (on) { setQueue(q); setQueueFailed(false) } }, () => { if (on) setQueueFailed(true) })
    return () => { on = false }
  }, [api, db, managers])
  const drafts = queue.filter((e) => e.state === 'draft')
  const remind = () => void act(api.queueReminders().then((n) => toast(n ? `${n} guest-list reminder${n === 1 ? '' : 's'} drafted: approve each below` : 'No sponsor needs a reminder right now')))
  const emails = db.email_log.filter((e) => e.status !== 'queued').reverse().slice(0, 12)

  const runImport = (rows: GLRow[]) => {
    // Simulated in demo mode only. Live imports go through the import engine's upload screen (staff_import_givelively).
    if (!demo) return
    const r = importGiveLively(db, rows)
    demo(() => r.db)
    toast(`Give Lively: ${r.created} new, ${r.skipped} already imported — guest-list emails drafted for approval`)
  }
  const pullNow = () => once('pull', () => api.pullGiveLively().then((c) => { setLastPull(new Date().toISOString()); toast(pullSummary(c)) }))

  // Salesforce's own reason for a record it refused stays in the sync log; staff get what to do.
  const syncNow = () => once('sync', () => api.syncSalesforce().then((r) => toast((r.failed ? `Salesforce: ${r.sent} sent, ${r.failed} not sent. Try Sync now later.` : `Salesforce: ${r.sent} record${r.sent === 1 ? '' : 's'} sent`)
    + (r.skipped ? ` ${r.skipped} guest record${r.skipped === 1 ? '' : 's'} without an email skipped: match them in Salesforce by hand.` : ''))))

  return (
    <div>
      <PageHead title="Integrations & email" sub={`How data gets in (Give Lively), goes out (Salesforce), and reaches guests (email). ${demo ? 'Connections here are simulated in the prototype.' : 'Salesforce is still simulated.'}`} />
      <div className="grid gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <section className="card break-words p-5">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-navy-900">Give Lively</h2><p className="text-sm text-navy-600">Ticket and sponsorship purchases → orders, payments, per-ticket fees, and a draft guest-list email for staff approval.</p></div>{demo ? <Pill tone="amber">Simulated</Pill> : <Pill tone="green">Connected</Pill>}</div>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-navy-700">
            <li>AAFE admin creates a Zapier API key in the Give Lively Nonprofit Admin Portal.</li>
            <li>Backend stores it as a secret and polls the JSON endpoint every 10–15 min with <code className="rounded bg-navy-50 px-1 font-sans text-xs">?start_time_ms=</code>.</li>
            <li>New donation → order + payment (Original, Covered fee, Gross, Transaction fee, Net) → seats → draft portal-link email (staff approve before it sends).</li>
            <li>Backup: upload the “Line Items (All)” CSV export below. Duplicates are skipped by transaction ID.</li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            {!demo && <p className="w-full text-sm text-navy-600">Connected to the database. Pull now asks Give Lively for new gala purchases right away, as the 15-minute schedule does. To load a CSV export, use the Import page.</p>}
            {canDo(user.role, 'pullGiveLively') && <button className="btn-primary" onClick={pullNow} disabled={running === 'pull'} aria-busy={running === 'pull'} data-testid="gl-pull"><CloudDownload size={16} /> {running === 'pull' ? 'Pulling…' : demo ? 'Pull now (simulated)' : 'Pull now'}</button>}
            <button className="btn-ghost" onClick={() => file.current?.click()} disabled={!demo}><Upload size={16} /> Import CSV</button>
            <button className="btn-ghost" onClick={() => downloadCsv('givelively-line-items-SAMPLE-SYNTHETIC.csv', [SAMPLE_HEAD, ...sampleRows()])}><Download size={16} /> Sample CSV</button>
            <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { setErr(''); setPreview(toRows(await f.text())) } catch (x) { setErr((x as Error).message) } e.target.value = '' }} />
          </div>
          <p className="mt-2 text-xs text-navy-500">Last pull: {lastPull ? ago(lastPull) : 'not yet this session'} · Endpoint: secure.givelively.org/nonprofits/[ORG_ID]/json_dataclips/[API_KEY].json</p>
          {err && <p className="mt-2 text-sm font-medium text-rose-700">{err}</p>}
          {preview && (
            <div className="mt-4 rounded-lg border border-navy-100">
              <div className="flex items-center justify-between border-b border-navy-100 px-3 py-2 text-sm"><span className="font-semibold">{preview.length} rows ready</span><span className="flex gap-2"><button className="btn-ghost btn-sm" onClick={() => setPreview(null)}>Cancel</button><button className="btn-primary btn-sm" onClick={() => { runImport(preview); setPreview(null) }}>Import</button></span></div>
              <ul className="max-h-48 divide-y divide-navy-100 overflow-y-auto text-xs">{preview.map((r) => <li key={r.txn} className="flex justify-between px-3 py-1.5"><span>{r.company || `${r.first} ${r.last}`} · {r.ticketLevel}</span><span className="tabular-nums">${r.gross.toFixed(2)} · fee ${r.fee.toFixed(2)}</span></li>)}</ul>
            </div>
          )}
        </section>

        <section className="card p-5">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-navy-900">Salesforce (Nonprofit Success Pack)</h2><p className="text-sm text-navy-600">The year-over-year historical ledger: who gave, how much, how, and who attended.</p></div>{demo ? <Pill tone="amber">Simulated</Pill> : <Pill tone="amber">Stand-in org</Pill>}</div>
          <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-navy-100"><th className="th pl-0">This app</th><th className="th">Salesforce object</th></tr></thead>
            <tbody className="divide-y divide-navy-100">
              {[['Gala', 'Campaign: Give Lively’s own, once it has made one'], ['Sponsor with a check, ACH or wire order', 'Account'], ['That order', 'Opportunity, in the gala’s Campaign'], ['Check, ACH or wire payment', 'npe01__OppPayment__c (Payment)'], ['Guest, comps included', 'Contact (the one Salesforce already has for that email, if any) + Campaign Member: Registered, Attended or No Show']].map(([a, b]) => <tr key={a}><td className="py-2 pr-3 font-medium text-navy-800">{a}</td><td className="py-2 text-navy-600">{b}</td></tr>)}
            </tbody></table></div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg bg-cream-100 p-2"><div className="text-xl font-semibold tabular-nums">{synced}</div><div className="text-xs text-navy-500">synced</div></div>
            <div className="rounded-lg bg-cream-100 p-2"><div className="text-xl font-semibold tabular-nums text-amber-700" data-testid="sf-pending">{pending}</div><div className="text-xs text-navy-500">pending</div></div>
            <div className="rounded-lg bg-cream-100 p-2"><div className="text-sm font-semibold">{lastSync ? fmtDate(lastSync, 'en-US', true) : '—'}</div><div className="text-xs text-navy-500">last sync</div></div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {canDo(user.role, 'syncSalesforce') && <button className="btn-ghost" data-testid="sf-sync" onClick={syncNow} disabled={running === 'sync'} aria-busy={running === 'sync'}><RefreshCw size={15} /> {running === 'sync' ? 'Syncing…' : demo ? 'Sync now (simulated)' : 'Sync now'}</button>}
            {/* Who actually came, for a Contact + Campaign Member import. Carries email, so gala admins only. */}
            {canDo(user.role, 'exportSalesforce') && <button className="btn-ghost" data-testid="export-salesforce" onClick={() => void act(api.exportSalesforce().then((rows) => downloadCsv('aafe-salesforce-attendees-SYNTHETIC.csv', salesforceCsv(rows))), 'Salesforce file downloaded')}><Download size={15} /> Download Salesforce file</button>}
          </div>
          <p className="mt-2 text-xs text-navy-500">Give Lively’s own Salesforce connector sends its online donations. Sync now sends what Give Lively doesn’t know: checks, direct ACH and wires, guests (comps included) and who came, without making a second copy of anything Give Lively sent, and never phones or dietary and accessibility notes. Live, it goes to a stand-in org, not AAFE’s Salesforce.</p>
        </section>

        <section className="card overflow-hidden xl:col-span-2">
          <div className="border-b border-navy-100 px-5 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-navy-900">Email log</h2>{managers && <button className="btn-ghost btn-sm" data-testid="draft-reminders" onClick={remind}><BellRing size={14} /> Draft guest-list reminders</button>}</div><p className="text-xs text-navy-500">Nothing sends on its own. Give Lively purchases, pledges and payments create a draft guest-list email; staff approve or discard it below. QR invitations and resent links are sent by the staff member who reviews them.</p></div>
          {queueFailed && <p className="border-b border-navy-100 bg-red-50 px-5 py-3 text-sm text-red-800" role="alert" data-testid="email-queue-failed">Couldn’t load the emails waiting for approval. Reload the page; if it keeps happening, ask the gala admin.</p>}
          {queue.length > 0 && (
            <div className="border-b border-navy-100 bg-brand-50 px-5 py-3" data-testid="email-drafts">
              <h3 className="text-sm font-semibold text-navy-900">Waiting for approval ({drafts.length}){queue.length > drafts.length && <span className="font-normal text-navy-600"> · {queue.length - drafts.length} approved or stuck</span>}</h3>
              <ul className="mt-2 divide-y divide-navy-100">
                {queue.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <span className="font-medium text-navy-900">{e.template.replace(/_/g, ' ')}</span> to {e.to_name} <span className="text-xs text-navy-500">{e.to_email} · {e.trigger.replace(/_/g, ' ')}</span>
                      {/* What staff need to judge it: the sponsor, its seats and deadline, the guest or the payment. */}
                      {e.organization && <span className="block text-xs text-navy-600">{[e.organization, e.tier, e.seats_total ? `${e.seats_unnamed} of ${e.seats_total} seats unnamed` : null, e.deadline ? `names due ${fmtDate(e.deadline)}` : null, e.guest, e.payment ? `payment ${fmtDate(e.payment.received_at)}` : null].filter(Boolean).join(' · ')}</span>}
                    </span>
                    {e.state === 'draft' ? (
                      <span className="flex gap-2">
                        <button className="btn-primary btn-sm" onClick={() => void act(api.approveEmail(e.id), api.live ? `Approved: sending to ${e.to_name}` : `Approved and sent to ${e.to_name} (simulated)`)}>Approve and send</button>
                        <button className="btn-ghost btn-sm" onClick={() => void act(api.cancelEmail(e.id), 'Draft discarded')}>Discard</button>
                      </span>
                    ) : e.state === 'approved' ? (
                      <Pill tone="gray">Approved by {e.approved_by} · sending</Pill>
                    ) : (
                      <span className="flex items-center gap-2"><span className="max-w-md text-xs font-medium text-red-800" title={e.last_error ?? undefined}>Not sent after {e.attempts} tries. Check the address, discard it and send again; if it fails again, ask the technical partner.</span><button className="btn-ghost btn-sm" onClick={() => void act(api.cancelEmail(e.id), 'Draft discarded')}>Discard</button></span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <table className="w-full min-w-[700px] text-sm"><thead className="bg-cream-100"><tr><th className="th">When</th><th className="th">Template</th><th className="th">To</th><th className="th">Trigger</th><th className="th">Status</th></tr></thead>
            <tbody className="divide-y divide-navy-100">{emails.map((e) => <tr key={e.id}><td className="td whitespace-nowrap">{e.sent_at ? fmtDate(e.sent_at, 'en-US', true) : '—'}</td><td className="td">{e.template.replace(/_/g, ' ')}</td><td className="td">{e.to_name} <span className="text-xs text-navy-500">{e.to_email}</span></td><td className="td">{e.trigger.replace(/_/g, ' ')}</td><td className="td"><Pill tone={e.status === 'cancelled' ? 'gray' : 'green'}>{e.status}</Pill>{e.approved_by && <div className="mt-0.5 text-xs text-navy-500">approved by {e.approved_by}</div>}</td></tr>)}</tbody></table>
        </section>
      </div>
    </div>
  )
}
